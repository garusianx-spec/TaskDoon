import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { UpdateWorkingHoursBody, WeekDay, WorkingHoursView } from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { Clock } from '../../platform/clock/clock.js';
import { isoOrNull } from '../../platform/db/rows.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { MembershipService } from '../rbac/membership.service.js';
import { DEFAULT_WORKING_HOURS, HH_MM, isWorkingTime, WEEK_DAYS } from './working-hours.js';

/** An auto-reply answers each person at most once in this window. */
export const AUTO_REPLY_WINDOW_HOURS = 24;
/** How long a node trusts its list of who answers automatically in a workspace. */
const ENABLED_TTL_MS = 15_000;

interface HoursRow extends Record<string, unknown> {
  auto_reply_enabled: boolean;
  days: WeekDay[];
  start_time: string;
  end_time: string;
  message: string;
  updated_at: string | Date | null;
  time_zone: string;
}

/** An auto-reply that is due: who answers, with what; `release` gives the day's slot back if it cannot be posted. */
export interface DueReply {
  readonly responder: MembershipContext;
  readonly text: string;
  release(): Promise<void>;
}

/**
 * Working hours and the out-of-office auto-reply (Phase 3.2). A direct message that reaches a
 * member outside their hours, with their auto-reply on, is answered with their message, as them,
 * once a day per person who writes: the answer claims a row of `auto_reply_log` first, atomically,
 * so two nodes (or two quick messages) never answer twice. Groups, channels and project channels
 * are never answered, and an auto-reply is never answered in turn.
 *
 * The check runs after a message's broadcast, off its sender's path. Each node keeps the list of
 * members with the auto-reply on per workspace for a few seconds, so a workspace where nobody
 * uses it pays nothing per message; a change made on another node applies within that time.
 */
@Injectable()
export class AutoReplyService implements OnModuleDestroy {
  private readonly logger = new Logger('AutoReplyService');
  private readonly enabled = new Map<string, { readonly userIds: ReadonlySet<string>; readonly expires: number }>();
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(
    private readonly uow: UnitOfWork,
    private readonly membership: MembershipService,
    private readonly audit: AuditWriter,
    private readonly clock: Clock,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.idle();
  }

  /* ================================================================== settings */

  async get(member: MembershipContext): Promise<WorkingHoursView> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const result = await tx.execute<HoursRow>(sql`
        select h.auto_reply_enabled, h.days, h.start_time, h.end_time, h.message, h.updated_at,
               coalesce(w.settings ->> 'timeZone', 'Asia/Tehran') as time_zone
        from workspaces w
        left join member_working_hours h on h.workspace_id = w.id and h.user_id = ${member.userId}
        where w.id = ${member.workspaceId}`);
      return toView(result.rows[0]);
    });
  }

  async put(member: MembershipContext, body: UpdateWorkingHoursBody): Promise<WorkingHoursView> {
    const days = WEEK_DAYS.filter((day) => body.days.includes(day));
    const message = body.message.trim();
    const errors = [
      ...(days.length !== body.days.length ? [{ field: 'days', message: 'are distinct week days' }] : []),
      ...(!HH_MM.test(body.start) ? [{ field: 'start', message: 'is HH:mm' }] : []),
      ...(!HH_MM.test(body.end) ? [{ field: 'end', message: 'is HH:mm' }] : []),
      ...(body.start === body.end ? [{ field: 'end', message: 'must differ from the start' }] : []),
      ...(message.length < 1 || message.length > 500 ? [{ field: 'message', message: 'is 1 to 500 characters' }] : []),
    ];
    if (errors.length > 0) throw ApiError.validation(errors);
    const view = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      await tx.execute(sql`
        insert into member_working_hours (workspace_id, user_id, auto_reply_enabled, days, start_time, end_time, message)
        values (${member.workspaceId}, ${member.userId}, ${body.autoReplyEnabled}, ${sql.param(days)}::text[], ${body.start}, ${body.end}, ${message})
        on conflict (workspace_id, user_id) do update set
          auto_reply_enabled = excluded.auto_reply_enabled, days = excluded.days, start_time = excluded.start_time,
          end_time = excluded.end_time, message = excluded.message`);
      await this.audit.write(tx, {
        action: 'member.working_hours.update',
        workspaceId: member.workspaceId,
        resourceType: 'member',
        resourceId: member.userId,
        changes: { after: { autoReplyEnabled: body.autoReplyEnabled, days, start: body.start, end: body.end } },
      });
      const result = await tx.execute<HoursRow>(sql`
        select h.auto_reply_enabled, h.days, h.start_time, h.end_time, h.message, h.updated_at,
               coalesce(w.settings ->> 'timeZone', 'Asia/Tehran') as time_zone
        from member_working_hours h join workspaces w on w.id = h.workspace_id
        where h.workspace_id = ${member.workspaceId} and h.user_id = ${member.userId}`);
      return toView(result.rows[0]);
    });
    this.enabled.delete(member.workspaceId);
    return view;
  }

  /* ================================================================== answering */

  /**
   * After `sender` posted in `conversationId`: the auto-reply that is due now, if any, with its
   * day's slot already claimed. Only a direct chat, only a recipient who is still a member with
   * the auto-reply on and outside their hours, only once in 24 hours for this sender.
   */
  async due(sender: MembershipContext, conversationId: string): Promise<DueReply | null> {
    const enabled = await this.enabledIn(sender.workspaceId);
    if (enabled.size === 0 || (enabled.size === 1 && enabled.has(sender.userId))) return null;
    const scope = { workspaceId: sender.workspaceId, userId: sender.userId };
    const now = this.clock.now();
    const claimed = await this.uow.run(scope, async ({ tx }) => {
      const result = await tx.execute<HoursRow & { responder_id: string }>(sql`
        select other.user_id as responder_id, h.auto_reply_enabled, h.days, h.start_time, h.end_time, h.message, h.updated_at,
               coalesce(w.settings ->> 'timeZone', 'Asia/Tehran') as time_zone
        from conversations c
        join conversation_members other on other.workspace_id = c.workspace_id and other.conversation_id = c.id
                                        and other.user_id <> ${sender.userId} and other.left_at is null
        join member_working_hours h on h.workspace_id = c.workspace_id and h.user_id = other.user_id and h.auto_reply_enabled
        join workspace_members wm on wm.workspace_id = c.workspace_id and wm.user_id = other.user_id and wm.status = 'active'
        join workspaces w on w.id = c.workspace_id
        where c.workspace_id = ${sender.workspaceId} and c.id = ${conversationId} and c.kind = 'direct' and c.archived_at is null`);
      const row = result.rows[0];
      if (!row || isWorkingTime({ days: row.days, start: row.start_time, end: row.end_time }, row.time_zone, now)) return null;
      // The day's slot: taken now, or already taken less than 24 hours ago (then nothing is sent).
      const slot = await tx.execute<{ replied_at: string }>(sql`
        insert into auto_reply_log (workspace_id, user_id, sender_id, replied_at)
        values (${sender.workspaceId}, ${row.responder_id}, ${sender.userId}, ${now.toISOString()}::timestamptz)
        on conflict (workspace_id, user_id, sender_id) do update set replied_at = excluded.replied_at
          where auto_reply_log.replied_at <= excluded.replied_at - make_interval(hours => ${AUTO_REPLY_WINDOW_HOURS})
        returning replied_at`);
      return slot.rows[0] ? { responderId: row.responder_id, text: row.message } : null;
    });
    if (!claimed) return null;
    const release = () =>
      this.uow
        .run(scope, ({ tx }) =>
          tx.execute(sql`
            delete from auto_reply_log where workspace_id = ${sender.workspaceId} and user_id = ${claimed.responderId}
              and sender_id = ${sender.userId} and replied_at = ${now.toISOString()}::timestamptz`),
        )
        .then(() => undefined);
    const responder = await this.membership.load(sender.workspaceId, claimed.responderId);
    if (!responder) {
      await release();
      return null;
    }
    return { responder, text: claimed.text, release };
  }

  /** Keeps a background answer on the books, so shutdown (and tests) can wait for it. */
  track(work: Promise<unknown>): void {
    const settled = work.catch((error: unknown) =>
      this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'auto-reply not sent'),
    );
    this.inFlight.add(settled);
    void settled.finally(() => this.inFlight.delete(settled));
  }

  /** Resolves once every answer started so far is posted (or given up). */
  async idle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  /** Members of the workspace with the auto-reply on, cached for a few seconds on this node. */
  private async enabledIn(workspaceId: string): Promise<ReadonlySet<string>> {
    const cached = this.enabled.get(workspaceId);
    if (cached && cached.expires > Date.now()) return cached.userIds;
    const result = await this.uow.run({ workspaceId, userId: null }, ({ tx }) =>
      tx.execute<{ user_id: string }>(sql`select user_id from member_working_hours where workspace_id = ${workspaceId} and auto_reply_enabled`),
    );
    const userIds = new Set(result.rows.map((row) => row.user_id));
    this.enabled.set(workspaceId, { userIds, expires: Date.now() + ENABLED_TTL_MS });
    return userIds;
  }
}

function toView(row: HoursRow | undefined): WorkingHoursView {
  const saved = row?.start_time !== null && row?.start_time !== undefined;
  return {
    autoReplyEnabled: saved ? row.auto_reply_enabled : false,
    days: saved ? WEEK_DAYS.filter((day) => row.days.includes(day)) : DEFAULT_WORKING_HOURS.days,
    start: saved ? row.start_time : DEFAULT_WORKING_HOURS.start,
    end: saved ? row.end_time : DEFAULT_WORKING_HOURS.end,
    message: saved ? row.message : DEFAULT_WORKING_HOURS.message,
    timeZone: row?.time_zone ?? 'Asia/Tehran',
    updatedAt: saved ? isoOrNull(row.updated_at) : null,
  };
}

import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { ApiErrorCode, MessageMeta, ScheduledMessageStatus, ScheduledMessageView, ScheduleMessageBody, SendMessageBody } from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { Clock } from '../../platform/clock/clock.js';
import { RequestContext } from '../../platform/context/request-context.js';
import type { Tx } from '../../platform/db/database.js';
import { isUniqueViolation } from '../../platform/db/pg-errors.js';
import { iso } from '../../platform/db/rows.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { RealtimePublisher } from '../../platform/realtime/realtime-publisher.js';
import { rooms } from '../../platform/realtime/rooms.js';
import { MembershipService } from '../rbac/membership.service.js';
import { loadConversation, requireMessageGrant } from './chat-access.js';
import { attachmentView } from './message-queries.js';
import { MessagesService } from './messages.service.js';

/** A schedule is at least this far ahead (a minute-picking UI never gets close) … */
const MIN_LEAD_MS = 10_000;
/** … and at most a year. */
const MAX_AHEAD_MS = 366 * 24 * 3600 * 1000;
/** Pending schedules per author and conversation. */
export const PENDING_LIMIT = 100;
/** A dispatcher that holds a schedule this long without finishing is taken over. */
const CLAIM_MINUTES = 2;

interface ScheduledRow extends Record<string, unknown> {
  id: string;
  workspace_id: string;
  conversation_id: string;
  author_id: string;
  kind: 'text' | 'voice' | 'file';
  body_text: string | null;
  body_meta: Record<string, unknown> | null;
  attachment_id: string | null;
  reply_to_id: string | null;
  client_msg_id: string;
  scheduled_at: string | Date;
  status: ScheduledMessageStatus;
  message_id: string | null;
  failure_code: string | null;
  created_at: string | Date;
  attachment: Record<string, unknown> | null;
}

/** What a dispatch did: sent it, found it could not go out, or left it (not due, not pending, held by another dispatcher). */
export type DispatchOutcome = 'sent' | 'failed' | 'skipped';

const selectView = sql`
  select s.id, s.workspace_id, s.conversation_id, s.author_id, s.kind, s.body_text, s.body_meta, s.attachment_id, s.reply_to_id,
         s.client_msg_id, s.scheduled_at, s.status, s.message_id, s.failure_code, s.created_at,
         case when a.id is null then null else json_build_object(
           'id', a.id, 'name', a.file_name, 'kind', a.kind, 'mimeType', a.mime_type, 'size', a.size_bytes,
           'status', a.status, 'uploadedById', a.uploader_id, 'uploadedAt', a.created_at) end as attachment
  from scheduled_messages s
  left join attachments a on a.workspace_id = s.workspace_id and a.id = s.attachment_id and a.deleted_at is null`;

/**
 * Scheduled messages (Phase 3.2, the Telegram pattern). A schedule is stored with everything the
 * message needs, private to its author, and an outbox event puts a delayed job on the work queue
 * for its time; the worker then sends it as its author through the ordinary send path, so it
 * reaches the conversation's room as a plain `message:new`. A one-minute sweep sends whatever is
 * due and was missed. «ارسال فوری» sends it at once; «لغو» cancels it.
 *
 * A dispatch first claims the schedule (`claimed_at`), so the delayed job, the sweep and «ارسال
 * فوری» never send it twice and a cancel cannot slip in half-way; the message takes the
 * schedule's client id, so a dispatch retried after a crash is stored once all the same. When it
 * cannot go out (the author left or may no longer post, the conversation was archived, the file is
 * gone) it is marked `failed` with the reason, and the author hears of it on `scheduled:updated`.
 */
@Injectable()
export class ScheduledMessagesService {
  private readonly logger = new Logger('ScheduledMessages');

  constructor(
    private readonly uow: UnitOfWork,
    private readonly outbox: OutboxWriter,
    private readonly audit: AuditWriter,
    private readonly publisher: RealtimePublisher,
    private readonly messages: MessagesService,
    private readonly membership: MembershipService,
    private readonly context: RequestContext,
    private readonly clock: Clock,
  ) {}

  /** The caller's pending schedules, soonest first; in one conversation, or all of them. */
  async list(member: MembershipContext, conversationId?: string): Promise<ScheduledMessageView[]> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const result = await tx.execute<ScheduledRow>(sql`
        ${selectView}
        where s.workspace_id = ${member.workspaceId} and s.author_id = ${member.userId} and s.status = 'pending'
          ${conversationId ? sql`and s.conversation_id = ${conversationId}` : sql``}
        order by s.scheduled_at, s.id
        limit 500`);
      return result.rows.map(toView);
    });
  }

  async schedule(member: MembershipContext, conversationId: string, body: ScheduleMessageBody): Promise<{ readonly view: ScheduledMessageView; readonly created: boolean }> {
    requireMessageGrant(member, 'create');
    const text = body.text?.trim() ? body.text.trim() : null;
    if (body.kind === 'text' && !text) throw ApiError.validation([{ field: 'text', message: 'is required for a text message' }]);
    if (text && text.length > 8000) throw ApiError.validation([{ field: 'text', message: 'is at most 8000 characters' }]);
    if (body.kind !== 'text' && !body.attachmentId) throw ApiError.validation([{ field: 'attachmentId', message: `is required for a ${body.kind} message` }]);
    if (body.kind === 'voice' && (!body.durationSec || body.durationSec < 1 || body.durationSec > 3600)) {
      throw ApiError.validation([{ field: 'durationSec', message: 'is 1 to 3600 seconds for a voice message' }]);
    }
    const at = new Date(body.scheduledAt);
    const lead = at.getTime() - this.clock.now().getTime();
    if (Number.isNaN(at.getTime()) || lead < MIN_LEAD_MS || lead > MAX_AHEAD_MS) {
      throw ApiError.validation([{ field: 'scheduledAt', message: 'is at least ten seconds ahead and at most a year away' }]);
    }

    const outcome = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const access = await loadConversation(tx, member, conversationId);
      if (!access.canPost) {
        if (access.myRole === null) throw ApiError.forbidden('Join the channel to post.');
        if (access.conversation.archived) throw new ApiError('CONVERSATION_ARCHIVED');
        throw new ApiError('POSTING_RESTRICTED');
      }
      const existing = await this.byClientId(tx, member, conversationId, body.clientMsgId);
      if (existing) return { row: existing, created: false };
      const pending = await tx.execute<{ count: string }>(sql`
        select count(*) from scheduled_messages
        where workspace_id = ${member.workspaceId} and author_id = ${member.userId} and conversation_id = ${conversationId} and status = 'pending'`);
      if (Number(pending.rows[0]?.count ?? 0) >= PENDING_LIMIT) throw new ApiError('SCHEDULE_LIMIT_REACHED', `At most ${PENDING_LIMIT} messages wait in one conversation.`);
      await this.checkReferences(tx, member, conversationId, body);
      const meta =
        body.kind === 'voice'
          ? { durationSec: Math.round(body.durationSec ?? 0), waveform: (body.waveform ?? []).slice(0, 64).map((value) => Math.max(0, Math.min(100, Math.round(value)))) }
          : body.kind === 'file' && body.asFile === true
            ? { asFile: true }
            : null;
      let id: string;
      try {
        const inserted = await tx.execute<{ id: string }>(sql`
          insert into scheduled_messages (workspace_id, conversation_id, author_id, kind, body_text, body_meta, attachment_id, reply_to_id, client_msg_id, scheduled_at)
          values (${member.workspaceId}, ${conversationId}, ${member.userId}, ${body.kind}::message_kind, ${text}, ${meta ? JSON.stringify(meta) : null}::jsonb,
                  ${body.attachmentId ?? null}::uuid, ${body.replyToId ?? null}::uuid, ${body.clientMsgId}, ${at.toISOString()}::timestamptz)
          returning id`);
        id = inserted.rows[0]?.id as string;
      } catch (error) {
        if (isUniqueViolation(error, 'scheduled_messages_client_msg_uq')) throw new ApiError('CONFLICT', 'The same message is still being scheduled.');
        throw error;
      }
      await this.outbox.add(tx, {
        type: 'message.scheduled',
        aggregateType: 'conversation',
        aggregateId: conversationId,
        workspaceId: member.workspaceId,
        payload: { scheduledId: id, authorId: member.userId, scheduledAt: at.toISOString() },
      });
      await this.audit.write(tx, {
        action: 'message.schedule',
        workspaceId: member.workspaceId,
        resourceType: 'scheduled_message',
        resourceId: id,
        changes: { after: { conversationId, kind: body.kind, scheduledAt: at.toISOString() } },
      });
      return { row: await this.load(tx, member.workspaceId, id), created: true };
    });
    const view = toView(outcome.row);
    if (outcome.created) await this.announce(member.workspaceId, view);
    return { view, created: outcome.created };
  }

  /** «لغو / حذف». Cancelling twice is fine; a message that already went out cannot be cancelled. */
  async cancel(member: MembershipContext, scheduledId: string): Promise<void> {
    const cancelled = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const result = await tx.execute<{ id: string }>(sql`
        update scheduled_messages set status = 'cancelled', cancelled_at = now()
        where workspace_id = ${member.workspaceId} and id = ${scheduledId} and author_id = ${member.userId} and status = 'pending'
          and (claimed_at is null or claimed_at < now() - make_interval(mins => ${CLAIM_MINUTES}))
        returning id`);
      if (!result.rows[0]) {
        const row = await this.find(tx, member, scheduledId);
        if (row.status === 'cancelled' || row.status === 'failed') return null;
        throw new ApiError('SCHEDULED_MESSAGE_CLOSED', row.status === 'sent' ? 'It was sent already.' : 'It is being sent right now.');
      }
      await this.audit.write(tx, {
        action: 'message.schedule.cancel',
        workspaceId: member.workspaceId,
        resourceType: 'scheduled_message',
        resourceId: scheduledId,
        changes: { after: { status: 'cancelled' } },
      });
      return this.load(tx, member.workspaceId, scheduledId);
    });
    if (cancelled) await this.announce(member.workspaceId, toView(cancelled));
  }

  /** «ارسال فوری»: sends it now, as the caller; a refusal (say, posting is restricted now) marks it failed and is returned as the error. */
  async sendNow(member: MembershipContext, scheduledId: string): Promise<ScheduledMessageView> {
    requireMessageGrant(member, 'create');
    const scope = { workspaceId: member.workspaceId, userId: member.userId };
    const row = await this.claim(scope, scheduledId, { due: false });
    if (!row) {
      const current = await this.uow.run(scope, ({ tx }) => this.find(tx, member, scheduledId));
      throw new ApiError('SCHEDULED_MESSAGE_CLOSED', current.status === 'pending' ? 'It is being sent right now.' : `It is ${current.status}.`);
    }
    await this.uow.run(scope, ({ tx }) =>
      this.audit.write(tx, {
        action: 'message.schedule.send_now',
        workspaceId: member.workspaceId,
        resourceType: 'scheduled_message',
        resourceId: scheduledId,
        changes: { before: { scheduledAt: iso(row.scheduled_at) } },
      }),
    );
    const { view, refusal } = await this.deliver(member, row);
    if (refusal) throw refusal;
    return view;
  }

  /**
   * Worker: the delayed job of one schedule, or one item of the sweep. Sends it as its author if it
   * is due, still pending and not held by another dispatcher.
   */
  async dispatch(workspaceId: string, scheduledId: string, authorId: string): Promise<DispatchOutcome> {
    return this.context.run({ requestId: this.context.requestId, traceId: this.context.traceId, userId: authorId }, async () => {
      const scope = { workspaceId, userId: authorId };
      const row = await this.claim(scope, scheduledId, { due: true });
      if (!row) return 'skipped';
      const member = await this.membership.load(workspaceId, authorId);
      if (!member) {
        // A workspace a platform admin suspended sends nothing; the schedule says why.
        const failure = (await this.membership.suspendedFor(workspaceId, authorId)) ? 'WORKSPACE_SUSPENDED' : 'FORBIDDEN';
        await this.announce(workspaceId, await this.finish(scope, row, { failure }));
        return 'failed';
      }
      const { refusal } = await this.deliver(member, row);
      return refusal ? 'failed' : 'sent';
    });
  }

  /** Worker, every minute: whatever is due and was not sent by its own job. */
  async dispatchDue(limit = 100): Promise<{ sent: number; failed: number }> {
    const due = await this.uow.run({ workspaceId: null, userId: null }, ({ tx }) =>
      tx.execute<{ workspace_id: string; scheduled_id: string; author_id: string }>(sql`select * from app.scheduled_messages_due(${limit})`),
    );
    const counts = { sent: 0, failed: 0 };
    for (const entry of due.rows) {
      try {
        const outcome = await this.dispatch(entry.workspace_id, entry.scheduled_id, entry.author_id);
        if (outcome !== 'skipped') counts[outcome] += 1;
      } catch (error) {
        this.logger.warn({ scheduledId: entry.scheduled_id, error: error instanceof Error ? error.message : String(error) }, 'scheduled message not sent; retried on the next sweep');
      }
    }
    return counts;
  }

  /* ------------------------------------------------------------------ helpers */

  /**
   * Sends a claimed schedule as `member`. A refusal (an API error other than a conflict) marks it
   * failed; anything else (the database, the network) gives the claim back and is thrown, so the
   * job or the next sweep tries again.
   */
  private async deliver(member: MembershipContext, row: ScheduledRow): Promise<{ readonly view: ScheduledMessageView; readonly refusal: ApiError | null }> {
    const scope = { workspaceId: row.workspace_id, userId: row.author_id };
    try {
      const { sent } = await this.messages.send(member, row.conversation_id, sendBody(row), { audit: true });
      const view = await this.finish(scope, row, { messageId: sent.id });
      await this.announce(row.workspace_id, view);
      return { view, refusal: null };
    } catch (error) {
      if (error instanceof ApiError && error.getStatus() < 500 && error.code !== 'CONFLICT' && error.code !== 'RATE_LIMITED') {
        const view = await this.finish(scope, row, { failure: error.code });
        await this.announce(row.workspace_id, view);
        return { view, refusal: error };
      }
      await this.uow.run(scope, ({ tx }) => tx.execute(sql`update scheduled_messages set claimed_at = null where workspace_id = ${row.workspace_id} and id = ${row.id}`));
      throw error;
    }
  }

  private async claim(scope: { workspaceId: string; userId: string }, scheduledId: string, options: { due: boolean }): Promise<ScheduledRow | null> {
    return this.uow.run(scope, async ({ tx }) => {
      const claimed = await tx.execute<{ id: string }>(sql`
        update scheduled_messages set claimed_at = now()
        where workspace_id = ${scope.workspaceId} and id = ${scheduledId} and author_id = ${scope.userId} and status = 'pending'
          and (claimed_at is null or claimed_at < now() - make_interval(mins => ${CLAIM_MINUTES}))
          ${options.due ? sql`and scheduled_at <= now() + interval '1 second'` : sql``}
        returning id`);
      return claimed.rows[0] ? this.load(tx, scope.workspaceId, scheduledId) : null;
    });
  }

  private async finish(scope: { workspaceId: string; userId: string }, row: ScheduledRow, outcome: { messageId?: string; failure?: ApiErrorCode }): Promise<ScheduledMessageView> {
    return this.uow.run(scope, async ({ tx }) => {
      await tx.execute(
        outcome.messageId
          ? sql`update scheduled_messages set status = 'sent', sent_at = now(), message_id = ${outcome.messageId}, claimed_at = null
                where workspace_id = ${row.workspace_id} and id = ${row.id}`
          : sql`update scheduled_messages set status = 'failed', failure_code = ${outcome.failure ?? 'INTERNAL'}, claimed_at = null
                where workspace_id = ${row.workspace_id} and id = ${row.id}`,
      );
      if (outcome.failure) {
        await this.audit.write(tx, {
          action: 'message.schedule.fail',
          workspaceId: row.workspace_id,
          resourceType: 'scheduled_message',
          resourceId: row.id,
          changes: { after: { status: 'failed', failureCode: outcome.failure } },
        });
      }
      return toView(await this.load(tx, row.workspace_id, row.id));
    });
  }

  /** The author's devices keep their list of pending schedules in step (the author's room only). */
  private async announce(workspaceId: string, view: ScheduledMessageView): Promise<void> {
    await this.publisher.emit({ type: 'scheduled:updated', workspaceId, rooms: [rooms.user(view.authorId)], actorId: view.authorId, data: view });
  }

  /** The file must be the author's own finished upload; a reply must be to this conversation. */
  private async checkReferences(tx: Tx, member: MembershipContext, conversationId: string, body: SendMessageBody): Promise<void> {
    if (!body.attachmentId && !body.replyToId) return;
    const result = await tx.execute<{ attachment_kind: string | null; reply: boolean }>(sql`
      select
        (select a.kind from attachments a
           where a.workspace_id = ${member.workspaceId} and a.id = ${body.attachmentId ?? null}::uuid and a.uploader_id = ${member.userId}
             and a.status in ('scanning', 'ready') and a.deleted_at is null) as attachment_kind,
        exists (select 1 from messages r where r.workspace_id = ${member.workspaceId} and r.id = ${body.replyToId ?? null}::uuid
                  and r.conversation_id = ${conversationId}) as reply`);
    const row = result.rows[0];
    if (body.attachmentId && !row?.attachment_kind) throw ApiError.validation([{ field: 'attachmentId', message: 'must be a completed upload of your own' }]);
    if (body.kind === 'voice' && row?.attachment_kind !== 'audio') throw ApiError.validation([{ field: 'attachmentId', message: 'must be an audio file' }]);
    if (body.replyToId && !row?.reply) throw ApiError.validation([{ field: 'replyToId', message: 'must be a message of this conversation' }]);
  }

  private async byClientId(tx: Tx, member: MembershipContext, conversationId: string, clientMsgId: string): Promise<ScheduledRow | null> {
    const result = await tx.execute<ScheduledRow>(sql`
      ${selectView}
      where s.workspace_id = ${member.workspaceId} and s.conversation_id = ${conversationId} and s.author_id = ${member.userId} and s.client_msg_id = ${clientMsgId}`);
    return result.rows[0] ?? null;
  }

  private async find(tx: Tx, member: MembershipContext, scheduledId: string): Promise<ScheduledRow> {
    const result = await tx.execute<ScheduledRow>(sql`${selectView} where s.workspace_id = ${member.workspaceId} and s.id = ${scheduledId} and s.author_id = ${member.userId}`);
    const row = result.rows[0];
    if (!row) throw ApiError.notFound('The scheduled message');
    return row;
  }

  private async load(tx: Tx, workspaceId: string, scheduledId: string): Promise<ScheduledRow> {
    const result = await tx.execute<ScheduledRow>(sql`${selectView} where s.workspace_id = ${workspaceId} and s.id = ${scheduledId}`);
    return result.rows[0] as ScheduledRow;
  }
}

/** The send a schedule turns into: the same body, with the schedule's client id. */
function sendBody(row: ScheduledRow): SendMessageBody {
  const meta = row.body_meta ?? {};
  return {
    clientMsgId: row.client_msg_id,
    kind: row.kind,
    ...(row.body_text ? { text: row.body_text } : {}),
    ...(row.attachment_id ? { attachmentId: row.attachment_id } : {}),
    ...(row.reply_to_id ? { replyToId: row.reply_to_id } : {}),
    ...(typeof meta.durationSec === 'number' ? { durationSec: meta.durationSec } : {}),
    ...(Array.isArray(meta.waveform) ? { waveform: meta.waveform as number[] } : {}),
    ...(meta.asFile === true ? { asFile: true } : {}),
  };
}

function toView(row: ScheduledRow): ScheduledMessageView {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    authorId: row.author_id,
    kind: row.kind,
    text: row.body_text,
    meta: (row.body_meta as MessageMeta | null) ?? null,
    attachment: attachmentView(row.attachment),
    replyToId: row.reply_to_id,
    clientMsgId: row.client_msg_id,
    scheduledAt: iso(row.scheduled_at),
    status: row.status,
    messageId: row.message_id,
    failureCode: (row.failure_code as ApiErrorCode | null) ?? null,
    createdAt: iso(row.created_at),
  };
}

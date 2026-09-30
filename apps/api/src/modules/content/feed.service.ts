import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type {
  ActivityKind,
  ActivityPage,
  ActivityView,
  MarkNotificationsReadBody,
  NotificationFilter,
  NotificationKind,
  NotificationPage,
  NotificationTargetType,
  NotificationView,
} from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import type { Tx } from '../../platform/db/database.js';
import { iso, num } from '../../platform/db/rows.js';
import { projects, users } from '../../platform/db/schema/all.js';
import { type Unit, UnitOfWork } from '../../platform/db/unit-of-work.js';
import type { AuthPrincipal, MembershipContext } from '../../platform/http/request.js';
import type { OutboxEventMap } from '../../platform/outbox/outbox-writer.js';
import type { FeedFanoutJob } from '../../platform/queue/queues.js';
import { RealtimePublisher } from '../../platform/realtime/realtime-publisher.js';
import { rooms } from '../../platform/realtime/rooms.js';
import { AccessService, projectVisibleSql } from '../work/access.js';
import { decodeCursor, encodeCursor } from '../work/task-queries.js';

export interface NotificationInsert {
  readonly workspaceId: string;
  readonly recipientId: string;
  readonly actorId: string | null;
  readonly kind: NotificationKind;
  readonly subject: string;
  readonly targetType: NotificationTargetType;
  readonly targetId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  /** Unread notifications with the same key are one notification. */
  readonly dedupeKey: string;
  /** Replace the unread one (a card moved again) instead of keeping the first. */
  readonly collapse?: boolean;
}

interface ActivityInsert {
  readonly workspaceId: string;
  readonly actorId: string | null;
  readonly kind: ActivityKind;
  readonly targetType: NotificationTargetType;
  readonly targetId: string;
  readonly targetTitle: string;
  readonly context: string;
  readonly projectId: string | null;
  readonly sourceEventId: number;
}

/**
 * In-app notifications and the activity feed (RFC §8), written by the worker from outbox events.
 * Delivery is at-least-once, so every write is idempotent: activity rows are unique per event,
 * notifications per dedupe key while unread.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly access: AccessService,
    private readonly publisher: RealtimePublisher,
  ) {}

  /* ================================================================== fan-out (worker) */

  async fanout(job: FeedFanoutJob): Promise<void> {
    await this.uow.run({ workspaceId: job.workspaceId, userId: null }, async (unit) => {
      const { tx } = unit;
      const actor = job.actorId;
      switch (job.type) {
        case 'task.assigned': {
          const payload = job.payload as unknown as OutboxEventMap['task.assigned'];
          const recipients = await this.viewers(tx, job.workspaceId, payload.projectId, payload.assigneeIds, actor);
          await this.notify(
            unit,
            recipients.map((recipientId) => ({
              ...this.taskTarget(job, payload),
              recipientId,
              kind: 'task-assigned',
              payload: { code: payload.code },
              dedupeKey: `evt:${job.eventId}`,
            })),
          );
          await this.record(tx, { ...this.activity(job, payload), kind: 'task-assigned', context: payload.code });
          return;
        }
        case 'task.status_changed': {
          const payload = job.payload as unknown as OutboxEventMap['task.status_changed'];
          const recipients = await this.viewers(tx, job.workspaceId, payload.projectId, payload.watcherIds, actor);
          await this.notify(
            unit,
            recipients.map((recipientId) => ({
              ...this.taskTarget(job, payload),
              recipientId,
              kind: 'status-changed',
              payload: { code: payload.code, from: payload.from, to: payload.to },
              // A card dragged across the board five times is one unread notification.
              dedupeKey: `task:${payload.taskId}:status`,
              collapse: true,
            })),
          );
          if (payload.to === 'done') await this.record(tx, { ...this.activity(job, payload), kind: 'task-completed', context: payload.code });
          return;
        }
        case 'task.commented': {
          const payload = job.payload as unknown as OutboxEventMap['task.commented'];
          const replyTo = payload.replyToAuthorId && payload.replyToAuthorId !== actor ? payload.replyToAuthorId : null;
          const recipients = await this.viewers(tx, job.workspaceId, payload.projectId, [...payload.watcherIds, ...(replyTo ? [replyTo] : [])], actor);
          await this.notify(
            unit,
            recipients.map((recipientId) => ({
              ...this.taskTarget(job, payload),
              recipientId,
              kind: recipientId === replyTo ? 'reply' : 'comment',
              payload: { code: payload.code, commentId: payload.commentId, excerpt: payload.excerpt },
              dedupeKey: `evt:${job.eventId}`,
            })),
          );
          await this.record(tx, { ...this.activity(job, payload), kind: 'task-commented', context: payload.excerpt });
          return;
        }
        case 'task.file_attached': {
          const payload = job.payload as unknown as OutboxEventMap['task.file_attached'];
          await this.record(tx, { ...this.activity(job, payload), kind: 'file-shared', context: payload.fileName });
          return;
        }
        case 'member.joined': {
          const payload = job.payload as unknown as OutboxEventMap['member.joined'];
          const [person] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, payload.userId));
          await this.record(tx, {
            workspaceId: job.workspaceId,
            actorId: payload.userId,
            kind: 'member-joined',
            targetType: 'workspace',
            targetId: job.workspaceId,
            targetTitle: person?.fullName ?? '',
            context: '',
            projectId: null,
            sourceEventId: job.eventId,
          });
          return;
        }
        case 'message.posted': {
          const payload = job.payload as unknown as OutboxEventMap['message.posted'];
          const candidates = [...new Set([...payload.mentionIds, ...(payload.replyToAuthorId ? [payload.replyToAuthorId] : [])])].filter((id) => id !== actor);
          if (candidates.length === 0) return;
          // Still in the conversation, and not silenced ("nothing"); a muted chat still reports mentions.
          const result = await tx.execute<{ user_id: string; title: string | null; kind: string }>(sql`
            select cm.user_id, c.title, c.kind
            from conversation_members cm
            join conversations c on c.workspace_id = cm.workspace_id and c.id = cm.conversation_id
            where cm.workspace_id = ${job.workspaceId} and cm.conversation_id = ${payload.conversationId} and cm.left_at is null
              and cm.notification_level <> 'none' and cm.user_id = any(${sql.param(candidates)}::uuid[])`);
          const mentioned = new Set(payload.mentionIds);
          await this.notify(
            unit,
            result.rows.map((row) => ({
              workspaceId: job.workspaceId,
              recipientId: row.user_id,
              actorId: actor,
              kind: mentioned.has(row.user_id) ? ('mention' as const) : ('reply' as const),
              subject: row.title ?? '',
              targetType: 'message' as const,
              targetId: payload.messageId,
              payload: { conversationId: payload.conversationId, conversationKind: row.kind, seq: payload.seq, excerpt: payload.excerpt },
              dedupeKey: `evt:${job.eventId}`,
            })),
          );
          return;
        }
        default:
          return;
      }
    });
  }

  /**
   * Inserts notifications idempotently (the worker, and calendar reminders). After the unit
   * commits, each new (or collapsed) notification is pushed to its recipient's sockets.
   */
  async notify(unit: Unit, rows: readonly NotificationInsert[]): Promise<void> {
    const { tx } = unit;
    const created: { recipientId: string; view: NotificationView }[] = [];
    for (const collapse of [false, true]) {
      const batch = rows.filter((row) => Boolean(row.collapse) === collapse);
      if (batch.length === 0) continue;
      const values = sql.join(
        batch.map(
          (row) =>
            sql`(${row.workspaceId}::uuid, ${row.recipientId}::uuid, ${row.actorId}::uuid, ${row.kind}::notification_kind, ${JSON.stringify(row.payload)}::jsonb,
                 ${row.subject}, ${row.targetType}, ${row.targetId}::uuid, ${row.dedupeKey})`,
        ),
        sql`, `,
      );
      const inserted = await tx.execute<Record<string, unknown>>(sql`
        insert into notifications (workspace_id, recipient_id, actor_id, kind, payload, subject, target_type, target_id, dedupe_key)
        values ${values}
        on conflict (recipient_id, dedupe_key) where dedupe_key is not null and read_at is null
        ${
          collapse
            ? sql`do update set payload = excluded.payload, actor_id = excluded.actor_id, subject = excluded.subject, created_at = now()`
            : sql`do nothing`
        }
        returning id, workspace_id, recipient_id, kind, actor_id, subject, payload, target_type, target_id, read_at, created_at`);
      for (const row of inserted.rows) created.push({ recipientId: String(row.recipient_id), view: notificationView(row) });
    }
    if (created.length > 0) unit.afterCommit(() => this.announce(created));
  }

  /** `notification:new` to the recipient's sockets (in every workspace: the inbox is per user). */
  private announce(created: readonly { recipientId: string; view: NotificationView }[]): Promise<void> {
    return this.publisher.emit(
      ...created.map(({ recipientId, view }) => ({
        type: 'notification:new' as const,
        workspaceId: view.workspaceId,
        rooms: [rooms.user(recipientId)],
        actorId: view.actorId,
        data: view,
        durable: true,
      })),
    );
  }

  /* ================================================================== inbox (per user, across workspaces) */

  async inbox(principal: AuthPrincipal, query: { workspaceId?: string; filter: NotificationFilter; cursor?: string; limit: number }): Promise<NotificationPage> {
    const member = sql`exists (select 1 from workspace_members m join workspaces w on w.id = m.workspace_id
                               where m.workspace_id = n.workspace_id and m.user_id = ${principal.userId} and m.status = 'active' and w.deleted_at is null)`;
    const scope = [sql`n.recipient_id = ${principal.userId}`, member];
    if (query.workspaceId) scope.push(sql`n.workspace_id = ${query.workspaceId}`);
    const conditions = [...scope];
    if (query.filter === 'unread') conditions.push(sql`n.read_at is null`);
    if (query.filter === 'mentions') conditions.push(sql`n.kind in ('mention', 'reply')`);
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      conditions.push(sql`(n.created_at, n.id) < (${cursor.value}::timestamptz, ${cursor.id}::uuid)`);
    }
    const result = await this.uow.run({ workspaceId: null, userId: principal.userId }, ({ tx }) =>
      tx.execute<{ items: (Record<string, unknown> & { sort_created: string })[] | null; unread: string }>(sql`
        with page as (
          select n.id, n.workspace_id, n.kind, n.actor_id, n.subject, n.payload, n.target_type, n.target_id,
                 n.read_at, n.created_at, n.created_at::text as sort_created
          from notifications n
          where ${sql.join(conditions, sql` and `)}
          order by n.created_at desc, n.id desc
          limit ${query.limit + 1})
        select (select json_agg(page order by page.created_at desc, page.id desc) from page) as items,
               (select count(*) from notifications n where ${sql.join(scope, sql` and `)} and n.read_at is null) as unread`),
    );
    const row = result.rows[0];
    const items = row?.items ?? [];
    const last = items.length > query.limit ? items[query.limit - 1] : undefined;
    return {
      items: items.slice(0, query.limit).map((item) => notificationView(item)),
      nextCursor: last ? encodeCursor(last.sort_created, String(last.id)) : null,
      unreadCount: num(row?.unread),
    };
  }

  async markRead(principal: AuthPrincipal, body: MarkNotificationsReadBody): Promise<number> {
    return this.uow.run({ workspaceId: null, userId: principal.userId }, async ({ tx }) => {
      const conditions = [sql`recipient_id = ${principal.userId}`, sql`read_at is null`];
      if (body.ids?.length) conditions.push(sql`id = any(${sql.param([...body.ids])}::uuid[])`);
      else if (!body.all) return 0;
      if (body.workspaceId) conditions.push(sql`workspace_id = ${body.workspaceId}`);
      const updated = await tx.execute(sql`update notifications set read_at = now() where ${sql.join(conditions, sql` and `)} returning id`);
      // The inbox is the user's, not a workspace's: the audit row is user-level (no tenant is set).
      await this.audit.write(tx, {
        action: 'notification.read',
        workspaceId: null,
        resourceType: 'notification',
        changes: { count: updated.rows.length, all: Boolean(body.all), workspaceId: body.workspaceId ?? null },
      });
      return updated.rows.length;
    });
  }

  /* ================================================================== activity feed */

  async activityPage(member: MembershipContext, query: { cursor?: string; limit: number }): Promise<ActivityPage> {
    const conditions = [sql`a.workspace_id = ${member.workspaceId}`, sql`(a.project_id is null or ${projectVisibleSql(member)})`];
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      conditions.push(sql`(a.created_at, a.id) < (${cursor.value}::timestamptz, ${cursor.id}::uuid)`);
    }
    const result = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, ({ tx }) =>
      tx.execute<{
        id: string;
        kind: ActivityKind;
        actor_id: string | null;
        target_type: NotificationTargetType;
        target_id: string;
        target_title: string;
        context: string;
        project_id: string | null;
        created_at: string;
        sort_created: string;
      }>(sql`
        select a.id, a.kind, a.actor_id, a.target_type, a.target_id, a.target_title, a.context, a.project_id, a.created_at,
               a.created_at::text as sort_created
        from activity_events a
        left join projects p on p.workspace_id = a.workspace_id and p.id = a.project_id
        where ${sql.join(conditions, sql` and `)}
        order by a.created_at desc, a.id desc
        limit ${query.limit + 1}`),
    );
    const rows = result.rows;
    const last = rows.length > query.limit ? rows[query.limit - 1] : undefined;
    return {
      items: rows.slice(0, query.limit).map(
        (row): ActivityView => ({
          id: row.id,
          kind: row.kind,
          actorId: row.actor_id,
          targetType: row.target_type,
          targetId: row.target_id,
          targetTitle: row.target_title,
          context: row.context,
          projectId: row.project_id,
          createdAt: iso(row.created_at),
        }),
      ),
      nextCursor: last ? encodeCursor(last.sort_created, last.id) : null,
    };
  }

  /* ================================================================== helpers */

  /** `candidates` who can still see the project, minus the actor. */
  private async viewers(tx: Tx, workspaceId: string, projectId: string, candidates: readonly string[], actor: string | null): Promise<string[]> {
    const [project] = await tx.select({ visibility: projects.visibility }).from(projects).where(eq(projects.id, projectId));
    if (!project) return [];
    return this.access.viewersOf(tx, workspaceId, projectId, project.visibility, candidates.filter((userId) => userId !== actor));
  }

  private taskTarget(job: FeedFanoutJob, payload: { taskId: string; title: string }) {
    return { workspaceId: job.workspaceId, actorId: job.actorId, subject: payload.title, targetType: 'task' as const, targetId: payload.taskId };
  }

  private activity(job: FeedFanoutJob, payload: { taskId: string; title: string; projectId: string }) {
    return {
      workspaceId: job.workspaceId,
      actorId: job.actorId,
      targetType: 'task' as const,
      targetId: payload.taskId,
      targetTitle: payload.title,
      projectId: payload.projectId,
      sourceEventId: job.eventId,
    };
  }

  private async record(tx: Tx, row: ActivityInsert): Promise<void> {
    await tx.execute(sql`
      insert into activity_events (workspace_id, actor_id, kind, target_type, target_id, target_title, context, project_id, source_event_id)
      values (${row.workspaceId}, ${row.actorId}, ${row.kind}, ${row.targetType}, ${row.targetId}, ${row.targetTitle}, ${row.context.slice(0, 280)},
              ${row.projectId}, ${row.sourceEventId})
      on conflict (source_event_id) where source_event_id is not null do nothing`);
  }
}

function notificationView(item: Record<string, unknown>): NotificationView {
  return {
    id: String(item.id),
    workspaceId: String(item.workspace_id),
    kind: item.kind as NotificationKind,
    actorId: (item.actor_id as string | null) ?? null,
    subject: String(item.subject),
    payload: (item.payload as Record<string, unknown>) ?? {},
    targetType: item.target_type as NotificationTargetType,
    targetId: String(item.target_id),
    read: item.read_at !== null && item.read_at !== undefined,
    createdAt: iso(String(item.created_at)),
  };
}

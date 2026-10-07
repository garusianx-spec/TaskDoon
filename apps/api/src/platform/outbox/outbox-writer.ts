import type { SystemBroadcastEvent } from '@taskin/contracts';
import { Injectable } from '@nestjs/common';
import { RequestContext } from '../context/request-context.js';
import type { Tx } from '../db/database.js';
import { outboxEvents } from '../db/schema/all.js';

/** Every event type the outbox carries, with its payload. Consumers switch on `type`. */
export interface OutboxEventMap {
  'system.broadcast': SystemBroadcastEvent;
  /** An SMS the worker must send (invitation link, security alert). */
  'notification.sms': {
    readonly to: string;
    readonly template: 'invite' | 'alert' | 'password_reset';
    /** Template tokens; values marked sealed are SecretBox-encrypted until the worker sends. */
    readonly tokens: Readonly<Record<string, string>>;
    readonly sealed?: readonly string[];
  };
  /** An email the worker must send. */
  'notification.email': {
    readonly to: string;
    readonly template: 'invite' | 'password_reset';
    readonly params: Readonly<Record<string, string>>;
    readonly sealed?: readonly string[];
  };
  'workspace.created': { readonly workspaceId: string; readonly ownerId: string };
  'workspace.deleted': { readonly workspaceId: string; readonly purgeAfter: string };
  'workspace.purged': { readonly workspaceId: string };
  'member.joined': { readonly workspaceId: string; readonly userId: string };
  'member.removed': { readonly workspaceId: string; readonly userId: string };
  'rbac.changed': { readonly workspaceId: string; readonly userIds?: readonly string[] };
  'session.revoked': { readonly userId: string; readonly sessionIds: readonly string[]; readonly reason: string };

  /* M2: projects, board and tasks. */
  'project.created': { readonly projectId: string };
  'project.updated': { readonly projectId: string; readonly fields: readonly string[] };
  /** Moved to the trash (Phase 3.1): restorable for 40 days, then purged. */
  'project.deleted': { readonly projectId: string };
  /** Back from the trash. */
  'project.restored': { readonly projectId: string };
  'project.member.changed': { readonly projectId: string; readonly userId: string; readonly role: string | null };
  'board.column.added': { readonly workflowId: string; readonly projectId: string; readonly columnId: string; readonly version: number };
  'board.column.updated': { readonly workflowId: string; readonly projectId: string; readonly columnId: string; readonly version: number };
  'board.column.removed': {
    readonly workflowId: string;
    readonly projectId: string;
    readonly columnId: string;
    readonly version: number;
    readonly disposition: 'migrate' | 'archive' | 'empty';
    readonly targetColumnId: string | null;
    /** Up to 500; beyond that clients resync the board. */
    readonly taskIds: readonly string[];
    readonly resync: boolean;
  };
  'task.created': { readonly taskId: string; readonly projectId: string; readonly columnId: string; readonly version: number };
  'task.updated': { readonly taskId: string; readonly projectId: string; readonly version: number; readonly fields: readonly string[] };
  'task.moved': {
    readonly taskId: string;
    readonly projectId: string;
    readonly fromColumnId: string;
    readonly toColumnId: string;
    readonly position: string;
    readonly version: number;
  };
  'task.deleted': { readonly taskId: string; readonly projectId: string };
  /** Feed events: in-app notifications and the activity feed are fanned out from these. */
  'task.assigned': TaskFeedPayload & { readonly assigneeIds: readonly string[] };
  'task.status_changed': TaskFeedPayload & { readonly from: string; readonly to: string };
  'task.commented': TaskFeedPayload & { readonly commentId: string; readonly excerpt: string; readonly replyToAuthorId: string | null };
  'task.file_attached': TaskFeedPayload & { readonly attachmentId: string; readonly fileName: string };
  /** An upload completed: the worker scans it, then marks it ready. */
  'file.uploaded': { readonly attachmentId: string };
  /** Schedules (or, with `remindAt: null`, cancels) the reminder of this event version. */
  'calendar.event.changed': { readonly eventId: string; readonly version: number; readonly remindAt: string | null };
  'calendar.event.deleted': { readonly eventId: string };
  'note.task_linked': { readonly noteId: string; readonly taskId: string; readonly ownerId: string };

  /* M3: chat. The messages themselves are broadcast directly; these carry what must not be lost. */
  'conversation.created': { readonly conversationId: string; readonly kind: string; readonly memberIds: readonly string[] };
  'conversation.updated': { readonly conversationId: string; readonly fields: readonly string[] };
  /** A member joined, rejoined or changed role. */
  'conversation.member.added': { readonly conversationId: string; readonly userId: string; readonly role: string };
  'conversation.member.removed': { readonly conversationId: string; readonly userId: string };
  /** Phase 3.2: a message scheduled for later; the relay turns it into a delayed dispatch job. */
  'message.scheduled': { readonly scheduledId: string; readonly authorId: string; readonly scheduledAt: string };
  /** Only for messages with mentions or a reply: their notifications. */
  'message.posted': {
    readonly conversationId: string;
    readonly messageId: string;
    readonly seq: number;
    readonly excerpt: string;
    readonly mentionIds: readonly string[];
    readonly replyToAuthorId: string | null;
  };
}

/** What every task feed event carries, so fan-out never has to read the task back. */
export interface TaskFeedPayload {
  readonly taskId: string;
  readonly projectId: string;
  readonly code: string;
  readonly title: string;
  /** Who should hear about it, besides those the event names (assignees, reviewer, creator). */
  readonly watcherIds: readonly string[];
}

export type OutboxEventType = keyof OutboxEventMap;

export interface OutboxEvent<T extends OutboxEventType = OutboxEventType> {
  readonly type: T;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly workspaceId?: string | null;
  readonly payload: OutboxEventMap[T];
}

/**
 * Records domain events in the caller's transaction. They become visible to the relay only when
 * that transaction commits, and nothing is sent if it rolls back.
 */
@Injectable()
export class OutboxWriter {
  constructor(private readonly context: RequestContext) {}

  async add<T extends OutboxEventType>(tx: Tx, ...events: readonly OutboxEvent<T>[]): Promise<void> {
    if (events.length === 0) return;
    const headers: Record<string, string> = {};
    if (this.context.requestId) headers.requestId = this.context.requestId;
    if (this.context.traceId) headers.traceId = this.context.traceId;
    if (this.context.traceparent) headers.traceparent = this.context.traceparent;
    if (this.context.userId) headers.actorId = this.context.userId;
    await tx.insert(outboxEvents).values(
      events.map((event) => ({
        workspaceId: event.workspaceId ?? null,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.type,
        payload: event.payload as unknown as Record<string, unknown>,
        headers,
      })),
    );
  }
}

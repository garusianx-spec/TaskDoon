import type { outboxEvents } from '../db/schema/all.js';
import type { OutboxEventMap, OutboxEventType } from '../outbox/outbox-writer.js';
import type { RealtimeEmit, RealtimeItem } from './realtime-publisher.js';
import { rooms } from './rooms.js';

type OutboxRow = typeof outboxEvents.$inferSelect;

/**
 * What each committed outbox event means to connected clients (RFC §4, §12): events to rooms,
 * and room operations (join, leave, re-evaluate, evict, disconnect) that every WebSocket node
 * applies to its own sockets. Chat messages are not here: the node that stores a message
 * broadcasts it at once, and clients recover a missed one by `seq`.
 */
export function realtimeFor(row: OutboxRow): RealtimeItem[] {
  const type = row.eventType as OutboxEventType;
  const workspaceId = row.workspaceId;
  const meta = { actorId: row.headers.actorId ?? null, requestId: row.headers.requestId ?? null, occurredAt: row.createdAt.toISOString() };
  const emit = (event: Omit<RealtimeEmit, 'actorId' | 'requestId' | 'occurredAt'>): RealtimeItem => ({ emit: { ...meta, durable: true, ...event } as RealtimeEmit });
  const payload = row.payload as unknown;

  switch (type) {
    case 'system.broadcast': {
      const data = payload as OutboxEventMap['system.broadcast'];
      // A global invalidation must not disclose the operator or their request metadata.
      return [{ emit: { type: 'system:broadcast', workspaceId: null, rooms: [rooms.platform], data, durable: false, actorId: null, requestId: null, occurredAt: meta.occurredAt } }];
    }
    case 'session.revoked': {
      const data = payload as OutboxEventMap['session.revoked'];
      return [{ op: { op: 'revoke', sessionIds: data.sessionIds, reason: data.reason } }];
    }
  }
  if (!workspaceId) return [];

  switch (type) {
    /* ---------------------------------------------------------- board and tasks */
    case 'task.created': {
      const data = payload as OutboxEventMap['task.created'];
      return [emit({ type: 'task:created', workspaceId, rooms: [rooms.project(data.projectId)], version: data.version, data: { taskId: data.taskId, projectId: data.projectId, columnId: data.columnId } })];
    }
    case 'task.updated': {
      const data = payload as OutboxEventMap['task.updated'];
      return [emit({ type: 'task:updated', workspaceId, rooms: [rooms.project(data.projectId)], version: data.version, data: { taskId: data.taskId, projectId: data.projectId, fields: data.fields } })];
    }
    case 'task.moved': {
      const data = payload as OutboxEventMap['task.moved'];
      return [
        emit({
          type: 'task:moved',
          workspaceId,
          rooms: [rooms.project(data.projectId)],
          version: data.version,
          data: { taskId: data.taskId, projectId: data.projectId, fromColumnId: data.fromColumnId, toColumnId: data.toColumnId, position: data.position },
        }),
      ];
    }
    case 'task.deleted': {
      const data = payload as OutboxEventMap['task.deleted'];
      return [emit({ type: 'task:deleted', workspaceId, rooms: [rooms.project(data.projectId)], data: { taskId: data.taskId, projectId: data.projectId } })];
    }
    case 'board.column.added':
    case 'board.column.updated': {
      const data = payload as OutboxEventMap['board.column.added'];
      return [
        emit({
          type: type === 'board.column.added' ? 'board:column_added' : 'board:column_updated',
          workspaceId,
          // A column is its project's alone: only people who can see the project hear of it.
          rooms: [rooms.project(data.projectId)],
          version: data.version,
          data: { workflowId: data.workflowId, projectId: data.projectId, columnId: data.columnId },
        }),
      ];
    }
    case 'board.column.removed': {
      const data = payload as OutboxEventMap['board.column.removed'];
      return [
        emit({
          type: 'board:column_removed',
          workspaceId,
          rooms: [rooms.project(data.projectId)],
          version: data.version,
          data: {
            workflowId: data.workflowId,
            projectId: data.projectId,
            columnId: data.columnId,
            disposition: data.disposition,
            targetColumnId: data.targetColumnId,
            taskIds: data.taskIds,
            resync: data.resync,
          },
        }),
      ];
    }

    /* ---------------------------------------------------------- who sees what */
    case 'project.created':
      return [{ op: { op: 'rescope', workspaceId, userIds: null, reason: 'project.created' } }];
    case 'project.updated': {
      const data = payload as OutboxEventMap['project.updated'];
      // A rename is news for the project's viewers; a visibility change moves people in or out.
      if (data.fields.includes('visibility')) return [{ op: { op: 'rescope', workspaceId, userIds: null, reason: 'project.visibility' } }];
      return [emit({ type: 'resync:required', workspaceId, rooms: [rooms.project(data.projectId)], data: { scopes: ['projects'] } })];
    }
    case 'project.deleted': {
      const data = payload as OutboxEventMap['project.deleted'];
      return [
        emit({ type: 'resync:required', workspaceId, rooms: [rooms.project(data.projectId)], data: { scopes: ['projects'] } }),
        { op: { op: 'rescope', workspaceId, userIds: null, reason: 'project.deleted' } },
      ];
    }
    case 'project.restored':
      // Everyone who can see it again gets its rooms back, and lists reload.
      return [
        { op: { op: 'rescope', workspaceId, userIds: null, reason: 'project.restored' } },
        emit({ type: 'resync:required', workspaceId, rooms: [rooms.workspace(workspaceId)], data: { scopes: ['projects'] } }),
      ];
    case 'project.member.changed': {
      const data = payload as OutboxEventMap['project.member.changed'];
      return [{ op: { op: 'rescope', workspaceId, userIds: [data.userId], reason: 'project.member' } }];
    }
    case 'rbac.changed': {
      const data = payload as OutboxEventMap['rbac.changed'];
      return [{ op: { op: 'rescope', workspaceId, userIds: data.userIds ?? null, reason: 'rbac' } }];
    }
    case 'member.joined': {
      const data = payload as OutboxEventMap['member.joined'];
      return [emit({ type: 'member:joined', workspaceId, rooms: [rooms.workspace(workspaceId)], data: { userId: data.userId } })];
    }
    case 'member.removed': {
      const data = payload as OutboxEventMap['member.removed'];
      return [
        { op: { op: 'evict', workspaceId, userIds: [data.userId], reason: 'removed' } },
        emit({ type: 'member:removed', workspaceId, rooms: [rooms.workspace(workspaceId)], data: { userId: data.userId } }),
      ];
    }
    case 'workspace.deleted':
      return [{ op: { op: 'evict', workspaceId, userIds: null, reason: 'deleted' } }];

    /* ---------------------------------------------------------- conversations */
    case 'conversation.created': {
      const data = payload as OutboxEventMap['conversation.created'];
      const room = rooms.conversation(data.conversationId);
      return [
        { op: { op: 'join', workspaceId, userIds: data.memberIds, rooms: [room] } },
        emit({ type: 'conversation:created', workspaceId, rooms: [room], data: { conversationId: data.conversationId } }),
      ];
    }
    case 'conversation.updated': {
      const data = payload as OutboxEventMap['conversation.updated'];
      return [emit({ type: 'conversation:updated', workspaceId, rooms: [rooms.conversation(data.conversationId)], data: { conversationId: data.conversationId, fields: data.fields } })];
    }
    case 'conversation.member.added': {
      const data = payload as OutboxEventMap['conversation.member.added'];
      const room = rooms.conversation(data.conversationId);
      return [
        { op: { op: 'join', workspaceId, userIds: [data.userId], rooms: [room] } },
        emit({ type: 'conversation:member_added', workspaceId, rooms: [room], data: { conversationId: data.conversationId, userId: data.userId, role: data.role } }),
      ];
    }
    case 'conversation.member.removed': {
      const data = payload as OutboxEventMap['conversation.member.removed'];
      const room = rooms.conversation(data.conversationId);
      // Announce first, so the person removed hears it too, then take them out of the room.
      return [
        emit({ type: 'conversation:member_removed', workspaceId, rooms: [room, rooms.user(data.userId)], data: { conversationId: data.conversationId, userId: data.userId } }),
        { op: { op: 'leave', userIds: [data.userId], rooms: [room] } },
      ];
    }
    default:
      return [];
  }
}

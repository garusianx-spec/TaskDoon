import type { ManualPresence } from './api/workspaces.js';
import type { ApiErrorCode } from './api/errors.js';
import type { MessageView, ReactionView, ScheduledMessageView, SendMessageBody, SentMessage } from './api/chat.js';
import type { NotificationView } from './api/content.js';

/**
 * The Socket.IO contract (RFC §4 and §12): one connection per browser tab on the `/rt` path,
 * authenticated at the handshake with `auth: { token }`. Both maps are shared by the gateway and
 * the web client (`socket.io-client`'s `Socket<ServerToClientEvents, ClientToServerEvents>`).
 */

/** Every server event arrives in this envelope. */
export interface RealtimeEnvelope<T extends RealtimeEventType = RealtimeEventType> {
  /**
   * The event's id in the workspace's replay stream, to pass back as `lastEventId` on resume.
   * `null` for events that are not replayed: chat messages (recovered by `seq`), typing, presence.
   */
  readonly eventId: string | null;
  readonly type: T;
  readonly workspaceId: string | null;
  readonly occurredAt: string;
  readonly actorId: string | null;
  readonly requestId: string | null;
  /** The entity's version after the change, when it has one: apply only if newer than yours. */
  readonly version?: number;
  readonly data: RealtimeEventMap[T];
}

export type ResyncScope = 'all' | 'board' | 'projects' | 'conversations' | 'notifications';

/** Payloads of the server events. */
export interface RealtimeEventMap {
  'message:new': MessageView;
  'message:updated': MessageView;
  'message:deleted': { readonly conversationId: string; readonly messageId: string; readonly seq: number };
  /** A message became a task. Only the code travels: not every member can see the project. */
  'message:task_linked': { readonly conversationId: string; readonly messageId: string; readonly taskId: string; readonly code: string };
  'reaction:updated': { readonly conversationId: string; readonly messageId: string } & ReactionView;
  /** One of your scheduled messages was scheduled, sent, cancelled or could not go out (your user room only). */
  'scheduled:updated': ScheduledMessageView;
  /** Coalesced: at most one per member and conversation per second. */
  'read:updated': {
    readonly conversationId: string;
    readonly userId: string;
    readonly lastReadSeq: number;
    readonly lastDeliveredSeq: number;
  };
  'typing': { readonly conversationId: string; readonly userId: string; readonly typing: boolean };
  /** Connectivity (`online`) and, when it changed, the manual status. Batched every 2 seconds. */
  'presence:updated': {
    readonly userId: string;
    readonly online: boolean;
    readonly presence?: ManualPresence;
    readonly statusMessage?: string;
  };
  /** Fetch the conversation (`GET /conversations/:id`): the view is per member. */
  'conversation:created': { readonly conversationId: string };
  'conversation:updated': { readonly conversationId: string; readonly fields: readonly string[] };
  'conversation:member_added': { readonly conversationId: string; readonly userId: string; readonly role: string };
  'conversation:member_removed': { readonly conversationId: string; readonly userId: string };
  'task:created': { readonly taskId: string; readonly projectId: string; readonly columnId: string };
  'task:updated': { readonly taskId: string; readonly projectId: string; readonly fields: readonly string[] };
  'task:moved': {
    readonly taskId: string;
    readonly projectId: string;
    readonly fromColumnId: string;
    readonly toColumnId: string;
    readonly position: string;
  };
  'task:deleted': { readonly taskId: string; readonly projectId: string };
  'board:column_added': { readonly workflowId: string; readonly projectId: string; readonly columnId: string };
  'board:column_updated': { readonly workflowId: string; readonly projectId: string; readonly columnId: string };
  'board:column_removed': {
    readonly workflowId: string;
    readonly projectId: string;
    readonly columnId: string;
    readonly disposition: 'migrate' | 'archive' | 'empty';
    readonly targetColumnId: string | null;
    readonly taskIds: readonly string[];
    readonly resync: boolean;
  };
  'notification:new': NotificationView;
  'member:joined': { readonly userId: string };
  'member:removed': { readonly userId: string };
  /** Refetch `GET /me/permissions` and the project list; your rooms were already re-evaluated. */
  'permissions:updated': { readonly reason: string };
  /** You are no longer a member (or the workspace was deleted); its rooms were left. */
  'workspace:removed': { readonly workspaceId: string; readonly reason: 'removed' | 'deleted' };
  /** This session was signed out; the socket disconnects next. */
  'session:revoked': { readonly reason: string };
  /** The access token expired more than a minute ago without `auth:refresh`; the socket disconnects next. */
  'auth:expired': Record<string, never>;
  /** Replay could not cover the gap: refetch these over HTTP. */
  'resync:required': { readonly scopes: readonly ResyncScope[] };
  /** This node is shutting down: reconnect after `reconnectInMs` (0–5 s, jittered). */
  'server:draining': { readonly reconnectInMs: number };
}

export type RealtimeEventType = keyof RealtimeEventMap;

export type ServerToClientEvents = { [K in RealtimeEventType]: (envelope: RealtimeEnvelope<K>) => void };

/** Every client call is acknowledged with this. */
export type WsAck<T = Record<string, never>> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly code: ApiErrorCode; readonly message?: string; readonly retryAfterMs?: number };

export interface ResumeBody {
  readonly workspaceId: string;
  /** Your newest `seq` per conversation. */
  readonly conversations: Readonly<Record<string, number>>;
  /** The newest `eventId` you applied, or `null` to skip event replay. */
  readonly lastEventId: string | null;
}

/** Per conversation: the messages after your `seq` (up to 200), or `gap` to refetch over HTTP. */
export type ResumedConversation = { readonly messages: readonly MessageView[] } | { readonly gap: true };

export interface ResumeResult {
  readonly conversations: Readonly<Record<string, ResumedConversation>>;
  /** Events re-sent (as normal events, before this ack). */
  readonly replayed: number;
}

export type Ack<T = Record<string, never>> = (response: WsAck<T>) => void;

export interface ClientToServerEvents {
  /** Makes this workspace the socket's one live workspace: joins its rooms, leaves the previous one's. */
  'workspace:subscribe': (body: { readonly workspaceId: string }, ack: Ack<{ readonly online: readonly string[] }>) => void;
  /** A fresh access token, before the current one expires (a minute of grace after). */
  'auth:refresh': (body: { readonly token: string }, ack: Ack<{ readonly expiresAt: string }>) => void;
  /** After a reconnect: missed messages by `seq`, and missed events by `eventId`. */
  'sync:resume': (body: ResumeBody, ack: Ack<ResumeResult>) => void;
  'message:send': (body: SendMessageBody & { readonly conversationId: string }, ack: Ack<SentMessage>) => void;
  'message:edit': (body: { readonly messageId: string; readonly text: string }, ack: Ack<{ readonly editedAt: string }>) => void;
  'message:delete': (body: { readonly messageId: string }, ack: Ack) => void;
  'message:react': (
    body: { readonly messageId: string; readonly emoji: string; readonly on: boolean },
    ack: Ack<{ readonly reaction: ReactionView }>,
  ) => void;
  'message:delivered': (body: { readonly conversationId: string; readonly seq: number }, ack: Ack) => void;
  'message:read': (body: { readonly conversationId: string; readonly seq: number }, ack: Ack) => void;
  /** Throttle to one every 3 seconds; typing stops by itself after 6. */
  'typing:start': (body: { readonly conversationId: string }) => void;
  'typing:stop': (body: { readonly conversationId: string }) => void;
  'presence:set': (body: { readonly presence: ManualPresence; readonly statusMessage?: string }, ack: Ack) => void;
}


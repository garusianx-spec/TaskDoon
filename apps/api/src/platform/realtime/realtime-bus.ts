import type { RealtimeEnvelope } from '@taskin/contracts';

/**
 * What processes without sockets (the REST nodes, the outbox relay, the worker) ask the WebSocket
 * nodes to do. Each is published once on the bus channel; every node applies it to its own sockets
 * (`io.local`), in order. This works with both the classic and the sharded Socket.IO adapter, and
 * carries operations the Redis emitter cannot express: re-evaluating a user's rooms after a
 * permission change needs each node to run its own queries.
 */
export type BusOperation =
  /** Emits to every local socket in any of `rooms`, except those in any of `except`. */
  | { readonly op: 'emit'; readonly rooms: readonly string[]; readonly except?: readonly string[]; readonly envelope: RealtimeEnvelope }
  /** The sockets of `userIds` whose live workspace is `workspaceId` join `rooms`. */
  | { readonly op: 'join'; readonly workspaceId: string; readonly userIds: readonly string[]; readonly rooms: readonly string[] }
  /** The sockets of `userIds` (every socket when `null`) leave `rooms`. */
  | { readonly op: 'leave'; readonly userIds: readonly string[] | null; readonly rooms: readonly string[] }
  /** Recomputes the project and conversation rooms of these users (all, when `null`) in the workspace. */
  | { readonly op: 'rescope'; readonly workspaceId: string; readonly userIds: readonly string[] | null; readonly reason: string }
  /** These users (all, when `null`) lost the workspace: tell them, and leave its rooms. */
  | { readonly op: 'evict'; readonly workspaceId: string; readonly userIds: readonly string[] | null; readonly reason: 'removed' | 'deleted' }
  /** These sessions were signed out: tell their sockets, then disconnect them. */
  | { readonly op: 'revoke'; readonly sessionIds: readonly string[]; readonly reason: string };

export const BUS_CHANNEL = 'rt:bus';

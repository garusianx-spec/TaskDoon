/**
 * Socket.IO room names (RFC §4). Every node and the relay name rooms the same way; a socket is in
 * its user and session rooms from the handshake, and in one workspace's rooms at a time.
 */
export const rooms = {
  /** Notifications, permission changes and workspace removal, from every workspace. */
  user: (userId: string) => `user:${userId}`,
  /** Forced disconnect when the session is signed out. */
  session: (sessionId: string) => `session:${sessionId}`,
  /** Members, presence, the workflow's columns. */
  workspace: (workspaceId: string) => `ws:${workspaceId}`,
  /** Board and task events of one project, for the members who can see it. */
  project: (projectId: string) => `project:${projectId}`,
  /** Messages, reactions, typing and read cursors of one conversation, for its members. */
  conversation: (conversationId: string) => `conv:${conversationId}`,
} as const;

/** The rooms that belong to the socket's live workspace (everything but user and session rooms). */
export function isWorkspaceRoom(room: string): boolean {
  return room.startsWith('ws:') || room.startsWith('project:') || room.startsWith('conv:');
}

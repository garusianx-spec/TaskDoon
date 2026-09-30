import { type SQL, sql } from 'drizzle-orm';
import type { ConversationKind, ConversationRole, MembershipMode, PostPolicy } from '@taskin/contracts';
import type { Tx } from '../../platform/db/database.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { cell } from '../rbac/ability.js';

/** The workspace matrix cells for the messages module. The owner holds every cell. */
export function messageGrant(member: MembershipContext, action: 'view' | 'create' | 'edit' | 'delete' | 'assign'): boolean {
  return member.isOwner || member.grants.includes(cell('messages', action));
}

export function requireMessageGrant(member: MembershipContext, action: 'view' | 'create' | 'edit' | 'delete' | 'assign'): void {
  if (!messageGrant(member, action)) throw ApiError.forbidden();
}

export interface ConversationRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly kind: ConversationKind;
  readonly title: string | null;
  readonly isPrivate: boolean;
  readonly postPolicy: PostPolicy;
  readonly lastSeq: number;
  readonly archived: boolean;
  /** `project_synced`: its members follow its project's; they are not changed here. */
  readonly membershipMode: MembershipMode;
}

/**
 * What the caller may do in one conversation. Conversations are private to their members: not
 * even the workspace owner reads a direct chat or private group they are not in. A public
 * channel is readable (and joinable) by every non-guest member who can view messages.
 */
export interface ConversationAccess {
  readonly conversation: ConversationRow;
  /** `null` when the caller is not (or no longer) a member. */
  readonly myRole: ConversationRole | null;
  readonly canPost: boolean;
  /** Settings and members (not for direct chats). */
  readonly canManage: boolean;
  /** Deleting other people's messages. */
  readonly canModerate: boolean;
}

export interface AccessRow extends Record<string, unknown> {
  id: string;
  workspace_id: string;
  kind: ConversationKind;
  title: string | null;
  is_private: boolean;
  post_policy: PostPolicy;
  last_seq: string | number;
  archived: boolean;
  membership_mode: MembershipMode;
  my_role: ConversationRole | null;
}

export function publicChannelVisible(member: MembershipContext): boolean {
  return member.roleKey !== 'guest' && messageGrant(member, 'view');
}

/** The row `accessFrom` decides on, as SQL (to load alone, or inside a larger statement). */
export function accessRowSql(member: MembershipContext, conversationId: string): SQL {
  return sql`
    select c.id, c.workspace_id, c.kind, c.title, c.is_private, c.post_policy, c.last_seq, c.archived_at is not null as archived, c.membership_mode,
           (select cm.role from conversation_members cm
             where cm.workspace_id = c.workspace_id and cm.conversation_id = c.id and cm.user_id = ${member.userId} and cm.left_at is null) as my_role
    from conversations c
    where c.workspace_id = ${member.workspaceId} and c.id = ${conversationId}`;
}

/** Loads the conversation as the caller sees it, or 404. `lock` serialises membership changes. */
export async function loadConversation(tx: Tx, member: MembershipContext, conversationId: string, options: { lock?: boolean } = {}): Promise<ConversationAccess> {
  const result = await tx.execute<AccessRow>(sql`${accessRowSql(member, conversationId)} ${options.lock ? sql`for update of c` : sql``}`);
  const row = result.rows[0];
  if (!row) throw ApiError.notFound('The conversation');
  return accessFrom(member, row);
}

export function accessFrom(member: MembershipContext, row: AccessRow): ConversationAccess {
  const conversation: ConversationRow = {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    title: row.title,
    isPrivate: row.is_private,
    postPolicy: row.post_policy,
    lastSeq: Number(row.last_seq),
    archived: row.archived,
    membershipMode: row.membership_mode,
  };
  const myRole = row.my_role;
  const visible =
    messageGrant(member, 'view') && (myRole !== null || (conversation.kind === 'channel' && !conversation.isPrivate && publicChannelVisible(member)));
  if (!visible) throw ApiError.notFound('The conversation');
  const leader = myRole === 'owner' || myRole === 'admin' || (myRole !== null && member.isOwner);
  return {
    conversation,
    myRole,
    canPost: myRole !== null && !conversation.archived && messageGrant(member, 'create') && (conversation.postPolicy === 'everyone' || leader),
    canManage: myRole !== null && conversation.kind !== 'direct' && leader,
    canModerate: myRole !== null && (leader || messageGrant(member, 'delete')),
  };
}

/** `minUserId:maxUserId`: the same key whoever opens the chat. */
export function directKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

const MENTION = /<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/gi;

/** The users a text mentions with `<@userId>` tokens, each once, at most 50. */
export function mentionedIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const ids = new Set<string>();
  for (const match of text.matchAll(MENTION)) {
    if (match[1]) ids.add(match[1].toLowerCase());
    if (ids.size >= 50) break;
  }
  return [...ids];
}

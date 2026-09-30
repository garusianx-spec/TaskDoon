import { sql } from 'drizzle-orm';
import type { AvatarTone, ConversationRole, ProjectRole } from '@taskin/contracts';
import type { Tx } from '../../platform/db/database.js';
import type { OutboxWriter } from '../../platform/outbox/outbox-writer.js';

/**
 * A project's own channel (Phase 3.1, RFC §4.3 `project_synced`): opened with the project, named
 * after it, private to its members, and kept in step with them in the same transaction as every
 * project membership change. These run inside the projects' units of work (the project row is
 * locked first, then its channel: the canonical lock order).
 */

/** Leads moderate the channel; the project's creator owns it. */
const channelRole = (role: ProjectRole): Exclude<ConversationRole, 'owner'> => (role === 'lead' ? 'admin' : 'member');

/** Conversation titles are 1–80 characters and topics at most 250, projects allow more. */
const title = (name: string): string => name.trim().slice(0, 80);
const topic = (description: string): string => description.trim().slice(0, 250);

export interface ProjectChannelSeed {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly color: AvatarTone;
  readonly createdBy: string;
  /** Everyone else in the project at creation, with their project role. */
  readonly members: ReadonlyArray<{ readonly userId: string; readonly role: ProjectRole }>;
}

/** Opens the project's channel with the creator as its owner and every other member in it. */
export async function openProjectChannel(tx: Tx, outbox: OutboxWriter, seed: ProjectChannelSeed): Promise<string> {
  const w = seed.workspaceId;
  const inserted = await tx.execute<{ id: string }>(sql`
    insert into conversations (workspace_id, kind, title, topic, tone, is_private, post_policy, project_id, membership_mode, created_by)
    values (${w}, 'channel', ${title(seed.name)}, ${topic(seed.description)}, ${seed.color}, true, 'everyone', ${seed.projectId}, 'project_synced', ${seed.createdBy})
    returning id`);
  const conversationId = inserted.rows[0]?.id;
  if (!conversationId) throw new Error('project channel insert returned nothing');
  const others = seed.members.filter((entry) => entry.userId !== seed.createdBy);
  const userIds = [seed.createdBy, ...others.map((entry) => entry.userId)];
  const roles: ConversationRole[] = ['owner', ...others.map((entry) => channelRole(entry.role))];
  await tx.execute(sql`
    insert into conversation_members (workspace_id, conversation_id, user_id, role)
    select ${w}, ${conversationId}, u.user_id, u.role::conversation_role
    from unnest(${sql.param(userIds)}::uuid[], ${sql.param(roles)}::text[]) as u(user_id, role)`);
  await outbox.add(tx, {
    type: 'conversation.created',
    aggregateType: 'conversation',
    aggregateId: conversationId,
    workspaceId: w,
    payload: { conversationId, kind: 'channel', memberIds: userIds },
  });
  return conversationId;
}

interface SyncedRow extends Record<string, unknown> {
  id: string;
  last_seq: string | number;
  role: ConversationRole | null;
  active: boolean | null;
}

/**
 * Brings one person's place in the project's channel in line with their project role: in (as
 * admin for a lead, else member; an owner stays owner), or out when `role` is `null`. When the
 * owner leaves, the longest-standing admin, or else member, takes over, as in any channel.
 */
export async function syncProjectChannelMember(
  tx: Tx,
  outbox: OutboxWriter,
  target: { readonly workspaceId: string; readonly projectId: string; readonly userId: string; readonly role: ProjectRole | null },
): Promise<void> {
  const w = target.workspaceId;
  const channels = await tx.execute<SyncedRow>(sql`
    select c.id, c.last_seq, cm.role, cm.left_at is null as active
    from conversations c
    left join conversation_members cm on cm.workspace_id = c.workspace_id and cm.conversation_id = c.id and cm.user_id = ${target.userId}
    where c.workspace_id = ${w} and c.project_id = ${target.projectId} and c.membership_mode = 'project_synced' and c.archived_at is null
    for update of c`);
  for (const channel of channels.rows) {
    const member = channel.role !== null && channel.active === true;
    if (target.role === null) {
      if (!member) continue;
      await tx.execute(sql`
        update conversation_members set left_at = now(), pinned_at = null
        where workspace_id = ${w} and conversation_id = ${channel.id} and user_id = ${target.userId}`);
      if (channel.role === 'owner') {
        await tx.execute(sql`
          update conversation_members set role = 'owner'
          where workspace_id = ${w} and conversation_id = ${channel.id}
            and user_id = (select n.user_id from conversation_members n
                           where n.workspace_id = ${w} and n.conversation_id = ${channel.id} and n.left_at is null
                           order by (n.role = 'admin') desc, n.joined_at, n.user_id limit 1)`);
      }
      await outbox.add(tx, {
        type: 'conversation.member.removed',
        aggregateType: 'conversation',
        aggregateId: channel.id,
        workspaceId: w,
        payload: { conversationId: channel.id, userId: target.userId },
      });
      continue;
    }
    const role: ConversationRole = member && channel.role === 'owner' ? 'owner' : channelRole(target.role);
    if (member && channel.role === role) continue;
    const lastSeq = Number(channel.last_seq);
    // A newcomer starts with nothing unread; someone coming back keeps no stale cursor.
    await tx.execute(sql`
      insert into conversation_members (workspace_id, conversation_id, user_id, role, last_read_seq, last_delivered_seq)
      values (${w}, ${channel.id}, ${target.userId}, ${role}, ${lastSeq}, ${lastSeq})
      on conflict (conversation_id, user_id) do update set
        role = excluded.role,
        joined_at = case when conversation_members.left_at is null then conversation_members.joined_at else now() end,
        last_read_seq = case when conversation_members.left_at is null then conversation_members.last_read_seq else excluded.last_read_seq end,
        last_delivered_seq = case when conversation_members.left_at is null then conversation_members.last_delivered_seq else excluded.last_delivered_seq end,
        hidden_at = null,
        left_at = null`);
    await outbox.add(tx, {
      type: 'conversation.member.added',
      aggregateType: 'conversation',
      aggregateId: channel.id,
      workspaceId: w,
      payload: { conversationId: channel.id, userId: target.userId, role },
    });
  }
}

/** The project went to the trash (`archived`) or came back: its channel goes and returns with it. */
export async function setProjectChannelsArchived(tx: Tx, outbox: OutboxWriter, workspaceId: string, projectId: string, archived: boolean): Promise<void> {
  const changed = await tx.execute<{ id: string }>(sql`
    update conversations set archived_at = ${archived ? sql`now()` : sql`null`}
    where workspace_id = ${workspaceId} and project_id = ${projectId} and membership_mode = 'project_synced'
      and (archived_at is null) = ${archived}
    returning id`);
  for (const { id } of changed.rows) {
    await outbox.add(tx, {
      type: 'conversation.updated',
      aggregateType: 'conversation',
      aggregateId: id,
      workspaceId,
      payload: { conversationId: id, fields: ['archived'] },
    });
  }
}

/** A renamed project renames its channel. */
export async function renameProjectChannels(tx: Tx, outbox: OutboxWriter, workspaceId: string, projectId: string, name: string): Promise<void> {
  const changed = await tx.execute<{ id: string }>(sql`
    update conversations set title = ${title(name)}
    where workspace_id = ${workspaceId} and project_id = ${projectId} and membership_mode = 'project_synced' and title is distinct from ${title(name)}
    returning id`);
  for (const { id } of changed.rows) {
    await outbox.add(tx, {
      type: 'conversation.updated',
      aggregateType: 'conversation',
      aggregateId: id,
      workspaceId,
      payload: { conversationId: id, fields: ['title'] },
    });
  }
}

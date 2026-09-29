import { Injectable } from '@nestjs/common';
import { type SQL, sql } from 'drizzle-orm';
import type {
  AvatarTone,
  ConversationDetail,
  ConversationKind,
  ConversationMemberView,
  ConversationRole,
  ConversationView,
  CreateConversationBody,
  MembershipMode,
  MessagePreview,
  NotificationLevel,
  PostPolicy,
  PutConversationMemberBody,
  UpdateConversationBody,
  UpdateMyConversationBody,
} from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import type { Tx } from '../../platform/db/database.js';
import { iso, isoOrNull, num } from '../../platform/db/rows.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { directKey, loadConversation, publicChannelVisible, requireMessageGrant } from './chat-access.js';

interface ConversationRow extends Record<string, unknown> {
  id: string;
  kind: ConversationKind;
  title: string | null;
  topic: string;
  tone: AvatarTone;
  is_private: boolean;
  post_policy: PostPolicy;
  project_id: string | null;
  membership_mode: MembershipMode;
  last_seq: string;
  last_message_at: string | null;
  archived_at: string | null;
  created_at: string;
  my_role: ConversationRole | null;
  pinned_at: string | null;
  muted_until: string | null;
  notification_level: NotificationLevel;
  hidden_at: string | null;
  last_read_seq: string;
  member_ids: string[];
  member_count: string;
  unread_count: string;
  last_message: (Omit<MessagePreview, 'createdAt'> & { createdAt: string }) | null;
  members?: (Omit<ConversationMemberView, 'joinedAt'> & { joinedAt: string })[] | null;
}

/** How many member ids a view carries; `memberCount` is always the true count. */
const MEMBER_IDS_MAX = 200;
const GROUP_MEMBERS_MAX = 200;

/**
 * Conversations (RFC §8, §12): direct chats (deduplicated per pair by a unique key), groups and
 * channels, their members and each member's own settings. Every change that moves people in or
 * out of rooms goes through the outbox, so every WebSocket node applies it after commit.
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly outbox: OutboxWriter,
    private readonly audit: AuditWriter,
  ) {}

  /* ================================================================== reads */

  /**
   * The sidebar (`mine`: every conversation the caller is in, pinned first, then by activity) or
   * the public channels the caller can join (`public`). One statement.
   */
  async list(member: MembershipContext, query: { scope?: 'mine' | 'public'; includeHidden?: boolean }): Promise<ConversationView[]> {
    requireMessageGrant(member, 'view');
    const w = member.workspaceId;
    let where: SQL;
    if (query.scope === 'public') {
      if (!publicChannelVisible(member)) return [];
      where = sql`c.workspace_id = ${w} and c.kind = 'channel' and not c.is_private and c.archived_at is null`;
    } else {
      where = sql`c.workspace_id = ${w} and cm.user_id is not null and c.archived_at is null ${query.includeHidden ? sql`` : sql`and cm.hidden_at is null`}`;
    }
    return this.uow.run({ workspaceId: w, userId: member.userId }, async ({ tx }) => {
      const result = await tx.execute<ConversationRow>(
        this.viewQuery(member, where, sql`cm.pinned_at desc nulls last, coalesce(c.last_message_at, c.created_at) desc, c.id`, false),
      );
      return result.rows.map((row) => this.toView(row));
    });
  }

  async get(member: MembershipContext, conversationId: string): Promise<ConversationDetail> {
    requireMessageGrant(member, 'view');
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, (unit) => this.detail(unit.tx, member, conversationId));
  }

  private async detail(tx: Tx, member: MembershipContext, conversationId: string): Promise<ConversationDetail> {
    const result = await tx.execute<ConversationRow>(this.viewQuery(member, sql`c.workspace_id = ${member.workspaceId} and c.id = ${conversationId}`, sql`c.id`, true));
    const row = result.rows[0];
    const visible = row && (row.my_role !== null || (row.kind === 'channel' && !row.is_private && publicChannelVisible(member)));
    if (!row || !visible) throw ApiError.notFound('The conversation');
    return {
      ...this.toView(row),
      members: (row.members ?? []).map((entry) => ({ ...entry, lastReadSeq: Number(entry.lastReadSeq), lastDeliveredSeq: Number(entry.lastDeliveredSeq), joinedAt: iso(entry.joinedAt) })),
    };
  }

  private viewQuery(member: MembershipContext, where: SQL, order: SQL, withMembers: boolean): SQL {
    const u = member.userId;
    return sql`
      select c.id, c.kind, c.title, c.topic, c.tone, c.is_private, c.post_policy, c.project_id, c.membership_mode, c.last_seq, c.last_message_at,
             c.archived_at, c.created_at,
             cm.role as my_role, cm.pinned_at, cm.muted_until, coalesce(cm.notification_level, 'all') as notification_level,
             cm.hidden_at, coalesce(cm.last_read_seq, 0) as last_read_seq,
             people.ids as member_ids, people.n as member_count,
             case when cm.user_id is null then 0 else (
               select count(*) from (
                 select 1 from messages x
                 where x.conversation_id = c.id and x.seq > cm.last_read_seq and x.author_id is distinct from ${u} and x.deleted_at is null
                 limit 100) unread) end as unread_count,
             (select json_build_object('id', l.id, 'seq', l.seq, 'authorId', l.author_id, 'kind', l.kind, 'text', left(l.body_text, 160),
                                       'deleted', l.deleted_at is not null, 'createdAt', l.created_at)
                from messages l where l.conversation_id = c.id and l.seq = c.last_seq and c.last_seq > 0) as last_message
             ${
               withMembers
                 ? sql`, (select json_agg(json_build_object('userId', x.user_id, 'role', x.role, 'lastReadSeq', x.last_read_seq,
                                                          'lastDeliveredSeq', x.last_delivered_seq, 'joinedAt', x.joined_at)
                                          order by x.joined_at, x.user_id)
                          from conversation_members x where x.workspace_id = c.workspace_id and x.conversation_id = c.id and x.left_at is null) as members`
                 : sql``
             }
      from conversations c
      left join conversation_members cm
        on cm.workspace_id = c.workspace_id and cm.conversation_id = c.id and cm.user_id = ${u} and cm.left_at is null
      cross join lateral (
        -- A direct chat always names both its people, one of them perhaps a former member.
        select coalesce((array_agg(p.user_id order by p.joined_at, p.user_id))[1:${MEMBER_IDS_MAX}], '{}') as ids, count(*) as n
        from conversation_members p where p.workspace_id = c.workspace_id and p.conversation_id = c.id and (p.left_at is null or c.kind = 'direct')) people
      where ${where}
      order by ${order}`;
  }

  private toView(row: ConversationRow): ConversationView {
    const last = row.last_message;
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      topic: row.topic,
      tone: row.tone,
      isPrivate: row.is_private,
      postPolicy: row.post_policy,
      projectId: row.project_id,
      membershipMode: row.membership_mode,
      memberIds: row.member_ids ?? [],
      memberCount: num(row.member_count),
      myRole: row.my_role,
      pinned: row.pinned_at !== null,
      mutedUntil: isoOrNull(row.muted_until),
      notificationLevel: row.notification_level,
      hidden: row.hidden_at !== null,
      unreadCount: num(row.unread_count),
      lastSeq: num(row.last_seq),
      lastReadSeq: num(row.last_read_seq),
      lastMessage: last ? { ...last, seq: Number(last.seq), createdAt: iso(last.createdAt) } : null,
      lastMessageAt: isoOrNull(row.last_message_at),
      archived: row.archived_at !== null,
      createdAt: iso(row.created_at),
    };
  }

  /* ================================================================== create and update */

  /** Creates a conversation; for a direct chat, returns the existing one with that person if any. */
  async create(member: MembershipContext, body: CreateConversationBody): Promise<{ conversation: ConversationDetail; created: boolean }> {
    requireMessageGrant(member, 'create');
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const w = member.workspaceId;
      let conversationId: string;
      let created = true;
      if (body.kind === 'direct') {
        if (body.userId === member.userId) throw ApiError.validation([{ field: 'userId', message: 'must be someone else' }]);
        await this.assertActive(tx, w, [body.userId], 'userId');
        const key = directKey(member.userId, body.userId);
        const inserted = await tx.execute<{ id: string }>(sql`
          insert into conversations (workspace_id, kind, direct_key, created_by)
          values (${w}, 'direct', ${key}, ${member.userId})
          on conflict (workspace_id, direct_key) where kind = 'direct' do nothing
          returning id`);
        if (inserted.rows[0]) {
          conversationId = inserted.rows[0].id;
          await tx.execute(sql`
            insert into conversation_members (workspace_id, conversation_id, user_id, role)
            values (${w}, ${conversationId}, ${member.userId}, 'member'), (${w}, ${conversationId}, ${body.userId}, 'member')`);
        } else {
          created = false;
          const existing = await tx.execute<{ id: string }>(sql`select id from conversations where workspace_id = ${w} and kind = 'direct' and direct_key = ${key}`);
          conversationId = existing.rows[0]?.id as string;
          // Opening it again brings a hidden chat back, and rejoins a person who had left the workspace and returned.
          await tx.execute(sql`
            update conversation_members set hidden_at = null, left_at = null
            where workspace_id = ${w} and conversation_id = ${conversationId} and user_id = ${member.userId}`);
        }
      } else {
        const title = body.title.trim();
        if (!title) throw ApiError.validation([{ field: 'title', message: 'is required' }]);
        const others = [...new Set(body.memberIds ?? [])].filter((id) => id !== member.userId);
        if (others.length > GROUP_MEMBERS_MAX) throw ApiError.validation([{ field: 'memberIds', message: `is at most ${GROUP_MEMBERS_MAX} people` }]);
        await this.assertActive(tx, w, others, 'memberIds');
        const isPrivate = body.kind === 'channel' ? (body.isPrivate ?? true) : true;
        const postPolicy = body.kind === 'channel' ? (body.postPolicy ?? 'everyone') : 'everyone';
        const inserted = await tx.execute<{ id: string }>(sql`
          insert into conversations (workspace_id, kind, title, topic, tone, is_private, post_policy, created_by)
          values (${w}, ${body.kind}, ${title}, ${body.topic?.trim() ?? ''}, ${body.tone ?? 'brand'}, ${isPrivate}, ${postPolicy}, ${member.userId})
          returning id`);
        conversationId = inserted.rows[0]?.id as string;
        await tx.execute(sql`
          insert into conversation_members (workspace_id, conversation_id, user_id, role)
          select ${w}, ${conversationId}, u.user_id, case when u.user_id = ${member.userId} then 'owner' else 'member' end::conversation_role
          from unnest(${sql.param([member.userId, ...others])}::uuid[]) as u(user_id)`);
      }
      if (created) {
        const memberIds = body.kind === 'direct' ? [member.userId, body.userId] : [member.userId, ...new Set((body.memberIds ?? []).filter((id) => id !== member.userId))];
        await this.outbox.add(tx, {
          type: 'conversation.created',
          aggregateType: 'conversation',
          aggregateId: conversationId,
          workspaceId: w,
          payload: { conversationId, kind: body.kind, memberIds },
        });
      }
      await this.audit.write(tx, {
        action: created ? 'conversation.create' : 'conversation.open',
        workspaceId: w,
        resourceType: 'conversation',
        resourceId: conversationId,
        changes: { after: { kind: body.kind } },
      });
      return { conversation: await this.detail(tx, member, conversationId), created };
    });
  }

  async update(member: MembershipContext, conversationId: string, body: UpdateConversationBody): Promise<ConversationDetail> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const access = await loadConversation(tx, member, conversationId, { lock: true });
      if (access.conversation.kind === 'direct') throw new ApiError('DIRECT_CONVERSATION');
      if (!access.canManage) throw ApiError.forbidden('Only the conversation\'s owners and admins can change it.');
      if (access.conversation.kind !== 'channel' && (body.isPrivate !== undefined || body.postPolicy !== undefined)) {
        throw ApiError.validation([{ field: body.isPrivate !== undefined ? 'isPrivate' : 'postPolicy', message: 'applies to channels only' }]);
      }
      const title = body.title?.trim();
      if (body.title !== undefined && !title) throw ApiError.validation([{ field: 'title', message: 'is required' }]);
      const changes: SQL[] = [];
      if (title !== undefined) changes.push(sql`title = ${title}`);
      if (body.topic !== undefined) changes.push(sql`topic = ${body.topic.trim()}`);
      if (body.tone !== undefined) changes.push(sql`tone = ${body.tone}`);
      if (body.isPrivate !== undefined) changes.push(sql`is_private = ${body.isPrivate}`);
      if (body.postPolicy !== undefined) changes.push(sql`post_policy = ${body.postPolicy}`);
      const fields = Object.keys(body).filter((key) => (body as Record<string, unknown>)[key] !== undefined);
      if (changes.length > 0) {
        await tx.execute(sql`update conversations set ${sql.join(changes, sql`, `)} where workspace_id = ${member.workspaceId} and id = ${conversationId}`);
        await this.outbox.add(tx, {
          type: 'conversation.updated',
          aggregateType: 'conversation',
          aggregateId: conversationId,
          workspaceId: member.workspaceId,
          payload: { conversationId, fields },
        });
      }
      await this.audit.write(tx, {
        action: 'conversation.update',
        workspaceId: member.workspaceId,
        resourceType: 'conversation',
        resourceId: conversationId,
        changes: { after: body },
      });
      return this.detail(tx, member, conversationId);
    });
  }

  /* ================================================================== members */

  /**
   * Adds a member or changes a member's role (owners and admins), or joins a public channel
   * (anyone who can see it, on themselves). A new member starts with nothing unread.
   */
  async putMember(member: MembershipContext, conversationId: string, userId: string, body: PutConversationMemberBody): Promise<ConversationMemberView> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const w = member.workspaceId;
      const access = await loadConversation(tx, member, conversationId, { lock: true });
      const { conversation } = access;
      if (conversation.kind === 'direct') throw new ApiError('DIRECT_CONVERSATION');
      // A project's channel has the project's members: they join and leave through the project.
      if (conversation.membershipMode === 'project_synced') throw new ApiError('PROJECT_CHANNEL');
      if (conversation.archived) throw new ApiError('CONVERSATION_ARCHIVED');
      const existing = await tx.execute<{ role: ConversationRole; active: boolean }>(sql`
        select role, left_at is null as active from conversation_members
        where workspace_id = ${w} and conversation_id = ${conversationId} and user_id = ${userId}`);
      const current = existing.rows[0]?.active ? existing.rows[0] : null;
      const selfJoin = userId === member.userId && !current;
      let role: ConversationRole = body.role ?? current?.role ?? 'member';
      if (selfJoin) {
        // Joining yourself: only a public channel, only as a plain member.
        if (!(conversation.kind === 'channel' && !conversation.isPrivate && publicChannelVisible(member))) throw ApiError.forbidden();
        requireMessageGrant(member, 'view');
        role = 'member';
      } else {
        if (!access.canManage) throw ApiError.forbidden('Only the conversation\'s owners and admins can manage its members.');
        const owner = access.myRole === 'owner' || member.isOwner;
        if (role === 'owner' && !owner) throw ApiError.forbidden('Only an owner can make another owner.');
        if (current?.role === 'owner' && !owner) throw ApiError.forbidden('Only an owner can change an owner.');
        await this.assertActive(tx, w, [userId], 'userId');
      }
      if (current && current.role === role) return this.memberView(tx, w, conversationId, userId);
      await tx.execute(sql`
        insert into conversation_members (workspace_id, conversation_id, user_id, role, last_read_seq, last_delivered_seq)
        values (${w}, ${conversationId}, ${userId}, ${role}, ${conversation.lastSeq}, ${conversation.lastSeq})
        on conflict (conversation_id, user_id) do update set
          role = excluded.role,
          joined_at = case when conversation_members.left_at is null then conversation_members.joined_at else now() end,
          last_read_seq = case when conversation_members.left_at is null then conversation_members.last_read_seq else excluded.last_read_seq end,
          last_delivered_seq = case when conversation_members.left_at is null then conversation_members.last_delivered_seq else excluded.last_delivered_seq end,
          hidden_at = null,
          left_at = null`);
      await this.outbox.add(tx, {
        type: current ? 'conversation.updated' : 'conversation.member.added',
        aggregateType: 'conversation',
        aggregateId: conversationId,
        workspaceId: w,
        payload: current ? { conversationId, fields: ['members'] } : { conversationId, userId, role },
      } as Parameters<OutboxWriter['add']>[1]);
      await this.audit.write(tx, {
        action: selfJoin ? 'conversation.join' : current ? 'conversation.member.role' : 'conversation.member.add',
        workspaceId: w,
        resourceType: 'conversation',
        resourceId: conversationId,
        changes: { before: current ? { role: current.role } : null, after: { userId, role } },
      });
      return this.memberView(tx, w, conversationId, userId);
    });
  }

  /**
   * Removes a member (owners and admins; admins cannot remove owners) or leaves (yourself). When
   * the last owner leaves, the longest-standing admin, or else member, becomes the owner; when the
   * last member leaves, the conversation is archived.
   */
  async removeMember(member: MembershipContext, conversationId: string, userId: string): Promise<void> {
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const w = member.workspaceId;
      const access = await loadConversation(tx, member, conversationId, { lock: true });
      if (access.conversation.kind === 'direct') throw new ApiError('DIRECT_CONVERSATION');
      if (access.conversation.membershipMode === 'project_synced') throw new ApiError('PROJECT_CHANNEL');
      const target = await tx.execute<{ role: ConversationRole }>(sql`
        select role from conversation_members
        where workspace_id = ${w} and conversation_id = ${conversationId} and user_id = ${userId} and left_at is null`);
      const role = target.rows[0]?.role;
      if (!role) throw ApiError.notFound('The member');
      if (userId !== member.userId) {
        if (!access.canManage) throw ApiError.forbidden('Only the conversation\'s owners and admins can remove members.');
        if (role === 'owner' && access.myRole !== 'owner' && !member.isOwner) throw ApiError.forbidden('Only an owner can remove an owner.');
      }
      await tx.execute(sql`
        update conversation_members set left_at = now(), pinned_at = null
        where workspace_id = ${w} and conversation_id = ${conversationId} and user_id = ${userId}`);
      if (role === 'owner') {
        await tx.execute(sql`
          update conversation_members set role = 'owner'
          where workspace_id = ${w} and conversation_id = ${conversationId}
            and not exists (select 1 from conversation_members o where o.workspace_id = ${w} and o.conversation_id = ${conversationId}
                              and o.role = 'owner' and o.left_at is null)
            and user_id = (select n.user_id from conversation_members n
                           where n.workspace_id = ${w} and n.conversation_id = ${conversationId} and n.left_at is null
                           order by (n.role = 'admin') desc, n.joined_at, n.user_id limit 1)`);
      }
      await tx.execute(sql`
        update conversations set archived_at = now()
        where workspace_id = ${w} and id = ${conversationId} and archived_at is null
          and not exists (select 1 from conversation_members x where x.workspace_id = ${w} and x.conversation_id = ${conversationId} and x.left_at is null)`);
      await this.outbox.add(tx, {
        type: 'conversation.member.removed',
        aggregateType: 'conversation',
        aggregateId: conversationId,
        workspaceId: w,
        payload: { conversationId, userId },
      });
      await this.audit.write(tx, {
        action: userId === member.userId ? 'conversation.leave' : 'conversation.member.remove',
        workspaceId: w,
        resourceType: 'conversation',
        resourceId: conversationId,
        changes: { before: { userId, role } },
      });
    });
  }

  /** The caller's own pin, mute, notification level and visibility for one conversation. */
  async updateMine(member: MembershipContext, conversationId: string, body: UpdateMyConversationBody): Promise<ConversationView> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const changes: SQL[] = [];
      if (body.pinned !== undefined) changes.push(body.pinned ? sql`pinned_at = coalesce(pinned_at, now())` : sql`pinned_at = null`);
      if (body.mutedUntil !== undefined) changes.push(sql`muted_until = ${body.mutedUntil}::timestamptz`);
      if (body.notificationLevel !== undefined) changes.push(sql`notification_level = ${body.notificationLevel}`);
      if (body.hidden !== undefined) changes.push(body.hidden ? sql`hidden_at = coalesce(hidden_at, now())` : sql`hidden_at = null`);
      const updated = await tx.execute(sql`
        update conversation_members set ${changes.length > 0 ? sql.join(changes, sql`, `) : sql`user_id = user_id`}
        where workspace_id = ${member.workspaceId} and conversation_id = ${conversationId} and user_id = ${member.userId} and left_at is null
        returning user_id`);
      if (updated.rows.length === 0) {
        await loadConversation(tx, member, conversationId);
        throw ApiError.forbidden('Join the conversation first.');
      }
      await this.audit.write(tx, {
        action: 'conversation.settings',
        workspaceId: member.workspaceId,
        resourceType: 'conversation',
        resourceId: conversationId,
        changes: { after: body },
      });
      const { members: _members, ...view } = await this.detail(tx, member, conversationId);
      return view;
    });
  }

  /* ================================================================== helpers */

  private async memberView(tx: Tx, workspaceId: string, conversationId: string, userId: string): Promise<ConversationMemberView> {
    const result = await tx.execute<{ role: ConversationRole; last_read_seq: string; last_delivered_seq: string; joined_at: string }>(sql`
      select role, last_read_seq, last_delivered_seq, joined_at from conversation_members
      where workspace_id = ${workspaceId} and conversation_id = ${conversationId} and user_id = ${userId}`);
    const row = result.rows[0];
    if (!row) throw ApiError.notFound('The member');
    return { userId, role: row.role, lastReadSeq: Number(row.last_read_seq), lastDeliveredSeq: Number(row.last_delivered_seq), joinedAt: iso(row.joined_at) };
  }

  /** Every id must be an active member of the workspace (422 names the first that is not). */
  private async assertActive(tx: Tx, workspaceId: string, userIds: readonly string[], field: string): Promise<void> {
    if (userIds.length === 0) return;
    const result = await tx.execute<{ user_id: string }>(sql`
      select user_id from workspace_members
      where workspace_id = ${workspaceId} and status = 'active' and user_id = any(${sql.param([...userIds])}::uuid[])`);
    const active = new Set(result.rows.map((row) => row.user_id));
    const missing = userIds.find((id) => !active.has(id));
    if (missing) throw ApiError.validation([{ field, message: `${missing} is not an active member of this workspace` }]);
  }
}

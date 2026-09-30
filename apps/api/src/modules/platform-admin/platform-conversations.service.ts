import { Injectable } from '@nestjs/common';
import { type SQL, sql } from 'drizzle-orm';
import type {
  ConversationKind,
  MembershipMode,
  PlatformAttachmentLink,
  PlatformConversationDetail,
  PlatformConversationView,
  PlatformMessagePage,
  PlatformMessageType,
} from '@taskin/contracts';
import type { Tx } from '../../platform/db/database.js';
import { isoOrNull, num } from '../../platform/db/rows.js';
import { ApiError } from '../../platform/http/api-error.js';
import { StorageService } from '../../platform/storage/storage.js';
import { type MessageRow, messagesQuery, toMessageView } from '../chat/message-queries.js';
import { PlatformAdminUnitOfWork } from './admin-unit-of-work.js';
import type { PlatformAdmin } from './platform-admin.guard.js';
import { PlatformAuditWriter } from './platform-audit.writer.js';

export interface PlatformMessageFilters {
  readonly from?: string;
  readonly to?: string;
  readonly type?: PlatformMessageType;
  readonly senderId?: string;
  readonly beforeSeq?: number;
  readonly limit?: number;
  readonly targetUserId?: string;
}

interface ConversationRow extends Record<string, unknown> {
  id: string;
  workspace_id: string;
  workspace_name: string;
  kind: ConversationKind;
  title: string;
  is_private: boolean;
  membership_mode: MembershipMode;
  project_id: string | null;
  project_name: string | null;
  member_count: string;
  message_count: string | number;
  last_message_at: string | null;
  archived: boolean;
}

interface MembershipRow extends ConversationRow {
  role: string;
  left_at: string | null;
}

/** A link to a file lives five minutes: long enough to open it, too short to pass around. */
const LINK_TTL_SECONDS = 300;
const INLINE_KINDS = new Set(['image', 'audio', 'video']);

/**
 * Columns of a conversation as the inspector lists it. Direct chats have no title: they are named
 * after their two people. `message_count` is the last sequence number (every message ever sent,
 * deleted ones included), which needs no scan.
 */
const CONVERSATION_COLUMNS = sql`
  c.id, c.workspace_id, w.name as workspace_name, c.kind,
  coalesce(c.title, (select string_agg(u.full_name, ' و ' order by u.full_name) from conversation_members x
                     join users u on u.id = x.user_id where x.conversation_id = c.id)) as title,
  c.is_private, c.membership_mode, c.project_id, p.name as project_name,
  (select count(*) from conversation_members x where x.conversation_id = c.id and x.left_at is null) as member_count,
  c.last_seq as message_count, c.last_message_at, c.archived_at is not null as archived`;

const CONVERSATION_JOINS = sql`
  join workspaces w on w.id = c.workspace_id
  left join projects p on p.workspace_id = c.workspace_id and p.id = c.project_id`;

/** The inspector's type filter, on the page query's `m` (message) and `a` (attachment). */
function typeFilter(type: PlatformMessageType): SQL {
  switch (type) {
    case 'text':
      return sql`m.kind = 'text'`;
    case 'voice':
      return sql`m.kind = 'voice'`;
    case 'image':
      return sql`m.kind = 'file' and a.kind = 'image'`;
    case 'file':
      return sql`m.kind = 'file' and a.kind <> 'image'`;
  }
}

function view(row: ConversationRow) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    kind: row.kind,
    title: row.title,
    isPrivate: row.is_private,
    membershipMode: row.membership_mode,
    projectId: row.project_id,
    projectName: row.project_name,
    memberCount: num(row.member_count),
    messageCount: num(row.message_count),
    lastMessageAt: isoOrNull(row.last_message_at),
    archived: row.archived,
  };
}

/**
 * «رصد پیام‌ها و گروه‌ها»: the conversations a person is or was in (direct chats, groups, private
 * and project channels, across every workspace), their members, and their messages with
 * filters. Deleted messages stay listed without their content, exactly as members see them.
 * Every look is written to the platform audit log before the answer leaves.
 */
@Injectable()
export class PlatformConversationsService {
  constructor(
    private readonly admins: PlatformAdminUnitOfWork,
    private readonly storage: StorageService,
    private readonly auditLog: PlatformAuditWriter,
  ) {}

  async ofUser(admin: PlatformAdmin, userId: string): Promise<PlatformConversationView[]> {
    const rows = await this.admins.read(admin, async (tx) => {
      await this.requireUser(tx, userId);
      return (
        await tx.execute<MembershipRow>(sql`
          select ${CONVERSATION_COLUMNS}, cm.role, cm.left_at
          from conversation_members cm
          join conversations c on c.workspace_id = cm.workspace_id and c.id = cm.conversation_id
          ${CONVERSATION_JOINS}
          where cm.user_id = ${userId}
          order by coalesce(c.last_message_at, c.created_at) desc, c.id
          limit 500`)
      ).rows;
    });
    await this.auditLog.record(admin, { action: 'admin.conversations.list', targetUserId: userId, resourceType: 'user', resourceId: userId, metadata: { results: rows.length } });
    return rows.map((row) => ({ ...view(row), role: row.role, leftAt: isoOrNull(row.left_at) }));
  }

  async detail(admin: PlatformAdmin, conversationId: string, targetUserId: string | undefined): Promise<PlatformConversationDetail> {
    const { conversation, members } = await this.admins.read(admin, async (tx) => {
      const found = await this.load(tx, conversationId);
      const joined = await tx.execute<{ user_id: string; full_name: string; role: string; left_at: string | null }>(sql`
        select cm.user_id, u.full_name, cm.role, cm.left_at
        from conversation_members cm join users u on u.id = cm.user_id
        where cm.conversation_id = ${conversationId}
        order by cm.left_at nulls first, cm.joined_at`);
      return { conversation: found, members: joined.rows };
    });
    await this.auditLog.record(admin, {
      action: 'admin.conversation.view',
      targetUserId: targetUserId ?? null,
      resourceType: 'conversation',
      resourceId: conversationId,
      metadata: { workspaceId: conversation.workspace_id },
    });
    return {
      ...view(conversation),
      members: members.map((row) => ({ userId: row.user_id, fullName: row.full_name, role: row.role, leftAt: isoOrNull(row.left_at) })),
    };
  }

  /** Newest first from `beforeSeq` (or the end), returned oldest first. */
  async messages(admin: PlatformAdmin, conversationId: string, filters: PlatformMessageFilters): Promise<PlatformMessagePage> {
    const limit = filters.limit ?? 50;
    const where: SQL[] = [sql`m.conversation_id = ${conversationId}`];
    if (filters.from) where.push(sql`m.created_at >= ${filters.from}::timestamptz`);
    if (filters.to) where.push(sql`m.created_at < ${filters.to}::timestamptz`);
    if (filters.type) where.push(typeFilter(filters.type));
    if (filters.senderId) where.push(sql`m.author_id = ${filters.senderId}`);
    if (filters.beforeSeq) where.push(sql`m.seq < ${filters.beforeSeq}`);

    const { conversation, rows, authors } = await this.admins.read(admin, async (tx) => {
      const found = await this.load(tx, conversationId);
      const page = (await tx.execute<MessageRow>(messagesQuery(sql.join(where, sql` and `), sql`m.seq desc`, limit + 1))).rows;
      const ids = [...new Set(page.slice(0, limit).flatMap((row) => (row.author_id ? [row.author_id] : [])))];
      const names =
        ids.length === 0
          ? []
          : (await tx.execute<{ id: string; full_name: string }>(sql`select id, full_name from users where id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`)).rows;
      return { conversation: found, rows: page, authors: names };
    });
    const page = rows.slice(0, limit);
    await this.auditLog.record(admin, {
      action: 'admin.messages.read',
      targetUserId: filters.targetUserId ?? null,
      resourceType: 'conversation',
      resourceId: conversationId,
      metadata: {
        workspaceId: conversation.workspace_id,
        filters: { from: filters.from ?? null, to: filters.to ?? null, type: filters.type ?? null, senderId: filters.senderId ?? null, beforeSeq: filters.beforeSeq ?? null },
        results: page.length,
      },
    });
    const oldest = page.at(-1);
    return {
      items: page.map(toMessageView).reverse(),
      olderBeforeSeq: rows.length > limit && oldest ? Number(oldest.seq) : null,
      authors: Object.fromEntries(authors.map((row) => [row.id, row.full_name])),
    };
  }

  /** A five-minute link to a file sent in a conversation (images, audio and video open inline). */
  async attachmentLink(admin: PlatformAdmin, attachmentId: string, targetUserId: string | undefined): Promise<PlatformAttachmentLink> {
    const file = await this.admins.read(admin, async (tx) => {
      const [row] = (
        await tx.execute<{ workspace_id: string; object_key: string; file_name: string; mime_type: string; kind: string }>(sql`
          select a.workspace_id, a.object_key, a.file_name, a.mime_type, a.kind from attachments a
          where a.id = ${attachmentId} and a.deleted_at is null and a.status = 'ready'`)
      ).rows;
      if (!row) throw ApiError.notFound('The file');
      return row;
    });
    await this.auditLog.record(admin, {
      action: 'admin.attachment.open',
      targetUserId: targetUserId ?? null,
      resourceType: 'attachment',
      resourceId: attachmentId,
      metadata: { workspaceId: file.workspace_id, kind: file.kind },
    });
    const disposition = INLINE_KINDS.has(file.kind) ? 'inline' : 'attachment';
    const url = await this.storage.presignGet(file.object_key, LINK_TTL_SECONDS, file.file_name, file.mime_type, disposition);
    return { url, expiresAt: new Date(Date.now() + LINK_TTL_SECONDS * 1000).toISOString() };
  }

  private async load(tx: Tx, conversationId: string): Promise<ConversationRow> {
    const [row] = (await tx.execute<ConversationRow>(sql`select ${CONVERSATION_COLUMNS} from conversations c ${CONVERSATION_JOINS} where c.id = ${conversationId}`)).rows;
    if (!row) throw ApiError.notFound('The conversation');
    return row;
  }

  private async requireUser(tx: Tx, userId: string): Promise<void> {
    const found = await tx.execute(sql`select 1 from users where id = ${userId}`);
    if (found.rows.length === 0) throw ApiError.notFound('The user');
  }
}


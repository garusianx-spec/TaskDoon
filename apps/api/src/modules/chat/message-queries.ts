import { type SQL, sql } from 'drizzle-orm';
import type { AttachmentView, MessageKind, MessageMeta, MessageView, ReactionView } from '@taskin/contracts';
import { iso, isoOrNull } from '../../platform/db/rows.js';

export interface MessageRow extends Record<string, unknown> {
  id: string;
  conversation_id: string;
  seq: string | number;
  author_id: string | null;
  kind: MessageKind;
  body_text: string | null;
  body_meta: Record<string, unknown> | null;
  reply_to_id: string | null;
  client_msg_id: string | null;
  edited_at: string | Date | null;
  deleted_at: string | Date | null;
  created_at: string | Date;
  attachment: Record<string, unknown> | null;
  mention_ids: string[] | null;
  reactions: { emoji: string; userIds: string[] }[] | null;
  linked_task_id: string | null;
}

/**
 * Messages the workspace's plan still shows: the free plan keeps a rolling window of history
 * (RFC §14); older messages stay stored, for an upgrade, but are not served.
 */
export function withinHistory(workspaceId: string, alias = 'm'): SQL {
  const m = sql.raw(alias);
  return sql`${m}.created_at >= coalesce(
    now() - make_interval(days => (select (pl.limits ->> 'messageHistoryDays')::int
                                   from workspaces w join plans pl on pl.id = w.plan_id where w.id = ${workspaceId})),
    '-infinity'::timestamptz)`;
}

/**
 * One statement for a page of messages: the rows (alias `m`, filtered by `where`, ordered and
 * limited) with their attachment, mentions, reactions and linked task. Per-row sub-queries are
 * fine here: a page is at most 200 messages, each probing primary-key indexes.
 */
export function messagesQuery(where: SQL, order: SQL, limit: number): SQL {
  return sql`
    select m.id, m.conversation_id, m.seq, m.author_id, m.kind, m.body_text, m.body_meta, m.reply_to_id, m.client_msg_id,
      m.edited_at, m.deleted_at, m.created_at,
      case when a.id is null then null else json_build_object(
        'id', a.id, 'name', a.file_name, 'kind', a.kind, 'mimeType', a.mime_type, 'size', a.size_bytes,
        'status', a.status, 'uploadedById', a.uploader_id, 'uploadedAt', a.created_at) end as attachment,
      (select array_agg(mm.user_id order by mm.user_id) from message_mentions mm where mm.message_id = m.id) as mention_ids,
      (select json_agg(json_build_object('emoji', r.emoji, 'userIds', r.user_ids) order by r.first_at, r.emoji)
         from (select x.emoji, array_agg(x.user_id order by x.created_at, x.user_id) as user_ids, min(x.created_at) as first_at
               from message_reactions x where x.message_id = m.id group by x.emoji) r) as reactions,
      (select t.id from tasks t where t.workspace_id = m.workspace_id and t.source_message_id = m.id and t.deleted_at is null limit 1) as linked_task_id
    from messages m
    left join attachments a on a.workspace_id = m.workspace_id and a.id = m.attachment_id and a.deleted_at is null
    where ${where}
    order by ${order}
    limit ${limit}`;
}

export function attachmentView(value: Record<string, unknown> | null): AttachmentView | null {
  if (!value) return null;
  return {
    id: String(value.id),
    name: String(value.name),
    kind: value.kind as AttachmentView['kind'],
    mimeType: String(value.mimeType),
    size: Number(value.size),
    status: value.status as AttachmentView['status'],
    uploadedById: String(value.uploadedById),
    uploadedAt: iso(String(value.uploadedAt)),
  };
}

export function toMessageView(row: MessageRow): MessageView {
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    seq: Number(row.seq),
    authorId: row.author_id,
    kind: row.kind,
    text: deleted ? null : row.body_text,
    meta: deleted ? null : ((row.body_meta as MessageMeta | null) ?? null),
    attachment: deleted ? null : attachmentView(row.attachment),
    replyToId: row.reply_to_id,
    mentionIds: deleted ? [] : (row.mention_ids ?? []),
    reactions: deleted ? [] : ((row.reactions ?? []) as ReactionView[]),
    clientMsgId: row.client_msg_id,
    editedAt: isoOrNull(row.edited_at),
    deleted,
    linkedTaskId: row.linked_task_id,
    createdAt: iso(row.created_at),
  };
}

import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type {
  MediaItem,
  MediaPage,
  MediaTab,
  MessagePage,
  MessageView,
  ReactionView,
  ResumedConversation,
  SendMessageBody,
  SentMessage,
} from '@taskin/contracts';
import { normaliseForSearch } from '@taskin/text';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { RequestContext } from '../../platform/context/request-context.js';
import { Database, type Tx } from '../../platform/db/database.js';
import { isUniqueViolation } from '../../platform/db/pg-errors.js';
import { iso } from '../../platform/db/rows.js';
import { type Unit, UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { RealtimePublisher } from '../../platform/realtime/realtime-publisher.js';
import { rooms } from '../../platform/realtime/rooms.js';
import { accessFrom, accessRowSql, loadConversation, mentionedIds, messageGrant, requireMessageGrant } from './chat-access.js';
import { attachmentView, type MessageRow, messagesQuery, toMessageView, withinHistory } from './message-queries.js';

/** RFC §11: a message can be edited for 48 hours. */
const EDIT_WINDOW_HOURS = 48;
const PAGE_MAX = 100;
/** `sync:resume` returns at most this many messages per conversation, then `gap`. */
export const RESUME_MAX = 200;
const READ_COALESCE_MS = 1_000;

interface CursorMove {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly read: number;
  readonly delivered: number;
}

export interface SendOptions {
  /** REST sends are audited like every REST mutation; the WebSocket hot path is not (RFC §4). */
  readonly audit?: boolean;
  /** The sender's socket, left out of the broadcast (its ack already says the message is stored). */
  readonly socketId?: string;
}

export interface SendResult {
  readonly sent: SentMessage;
  readonly message: MessageView;
}

interface SendRow extends Record<string, unknown> {
  inserted: { id: string; seq: number; created_at: string } | null;
  prior: { id: string; seq: number; created_at: string } | null;
  me: { role: string; post_policy: string; archived: boolean } | null;
  mention_ids: string[];
}

/** Runs a statement: the pool (one statement, autocommit) or a unit's transaction. */
type Runner = Pick<Tx, 'execute'>;

interface PreparedSend {
  readonly kind: SendMessageBody['kind'];
  readonly text: string | null;
  readonly meta: Record<string, unknown> | null;
  readonly attachment: Record<string, unknown> | null;
  readonly replyTo: { id: string; authorId: string | null } | null;
  readonly mentions: string[];
}

function plainPrepared(kind: SendMessageBody['kind'], text: string | null): PreparedSend {
  return { kind, text, meta: null, attachment: null, replyTo: null, mentions: [] };
}

/**
 * Messages (RFC §8, §4). Sending is the hot path: one statement bumps the conversation's `seq`
 * under its row lock, inserts the message, advances the sender's cursors, un-hides the chat for
 * its members and records mentions, so ordering needs no other coordination and a retry with the
 * same `clientMsgId` returns the stored message. Side effects that must survive (mention and
 * reply notifications) go through the outbox; the broadcast itself does not, and a lost
 * broadcast is repaired by the client's `seq` gap sync.
 */
@Injectable()
export class MessagesService implements OnModuleDestroy {
  private readonly logger = new Logger('MessagesService');
  /** Receipts from sockets, written and announced in the next one-second window; keyed `conversation:user`. */
  private readonly pendingCursors = new Map<string, CursorMove>();
  /** Moves already written (the REST route), waiting only to be announced. */
  private readonly pendingReads = new Map<string, CursorMove>();
  private readTimer?: NodeJS.Timeout;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly database: Database,
    private readonly context: RequestContext,
    private readonly outbox: OutboxWriter,
    private readonly audit: AuditWriter,
    private readonly publisher: RealtimePublisher,
  ) {}

  onModuleDestroy(): void {
    if (this.readTimer) clearTimeout(this.readTimer);
    void this.flushReads();
  }

  /* ================================================================== history */

  /**
   * A page of history, oldest first. One statement: the caller's access to the conversation and
   * the page are read together, and the page is dropped (404) unless the caller may see it.
   */
  async page(member: MembershipContext, conversationId: string, query: { beforeSeq?: number; afterSeq?: number; limit?: number }): Promise<MessagePage> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), PAGE_MAX);
    const newer = query.afterSeq !== undefined;
    const bound = newer ? sql` and m.seq > ${query.afterSeq}` : query.beforeSeq !== undefined ? sql` and m.seq < ${query.beforeSeq}` : sql``;
    const order = newer ? sql`m.seq asc` : sql`m.seq desc`;
    const result = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, ({ tx }) =>
      tx.execute<{ access: Parameters<typeof accessFrom>[1] | null; items: MessageRow[] }>(sql`
        with access as (${accessRowSql(member, conversationId)}),
        page as (${messagesQuery(
          sql`m.workspace_id = ${member.workspaceId} and m.conversation_id = ${conversationId} and ${withinHistory(member.workspaceId)}${bound}
              and exists (select 1 from access where access.my_role is not null or (access.kind = 'channel' and not access.is_private))`,
          order,
          limit + 1,
        )})
        select (select row_to_json(access) from access) as access,
               coalesce((select json_agg(page order by page.seq ${newer ? sql`asc` : sql`desc`}) from page), '[]') as items`),
    );
    const row = result.rows[0];
    if (!row?.access) throw ApiError.notFound('The conversation');
    accessFrom(member, row.access);
    const rows = row.items;
    if (newer) {
      const items = rows.slice(0, limit).map(toMessageView);
      return {
        items,
        olderBeforeSeq: items[0] && items[0].seq > 1 ? items[0].seq : null,
        newerAfterSeq: rows.length > limit ? (items.at(-1)?.seq ?? null) : null,
      };
    }
    const items = rows.slice(0, limit).map(toMessageView).reverse();
    return {
      items,
      olderBeforeSeq: rows.length > limit ? (items[0]?.seq ?? null) : null,
      newerAfterSeq: query.beforeSeq !== undefined && items.length > 0 ? (items.at(-1)?.seq ?? null) : null,
    };
  }


  /**
   * After a reconnect: per conversation the caller is in, the messages after `lastSeq` (up to
   * `RESUME_MAX`), or `gap` when there are more (the client then refetches the newest page).
   * Conversations the caller is not a member of are left out.
   */
  async resume(member: MembershipContext, cursors: Readonly<Record<string, number>>): Promise<Record<string, ResumedConversation>> {
    const entries = Object.entries(cursors).slice(0, 200);
    if (entries.length === 0) return {};
    const ids = entries.map(([id]) => id);
    const seqs = entries.map(([, seq]) => Math.max(0, Math.floor(seq)));
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const result = await tx.execute<MessageRow & { cursor_conversation: string }>(sql`
        with wanted as (
          select w.conversation_id, w.last_seq
          from unnest(${sql.param(ids)}::uuid[], ${sql.param(seqs)}::bigint[]) as w(conversation_id, last_seq)
          join conversation_members cm on cm.workspace_id = ${member.workspaceId} and cm.conversation_id = w.conversation_id
                                      and cm.user_id = ${member.userId} and cm.left_at is null)
        select wanted.conversation_id as cursor_conversation, page.*
        from wanted
        cross join lateral (${messagesQuery(
          sql`m.workspace_id = ${member.workspaceId} and m.conversation_id = wanted.conversation_id and m.seq > wanted.last_seq`,
          sql`m.seq asc`,
          RESUME_MAX + 1,
        )}) page`);
      const byConversation = new Map<string, MessageRow[]>();
      for (const row of result.rows) {
        const list = byConversation.get(row.cursor_conversation) ?? [];
        list.push(row);
        byConversation.set(row.cursor_conversation, list);
      }
      const members = await tx.execute<{ conversation_id: string }>(sql`
        select cm.conversation_id from conversation_members cm
        where cm.workspace_id = ${member.workspaceId} and cm.user_id = ${member.userId} and cm.left_at is null
          and cm.conversation_id = any(${sql.param(ids)}::uuid[])`);
      const out: Record<string, ResumedConversation> = {};
      for (const { conversation_id: id } of members.rows) {
        const rows = byConversation.get(id) ?? [];
        out[id] = rows.length > RESUME_MAX ? { gap: true } : { messages: rows.map(toMessageView) };
      }
      return out;
    });
  }

  /* ================================================================== send */

  async send(member: MembershipContext, conversationId: string, body: SendMessageBody, options: SendOptions = {}): Promise<SendResult> {
    requireMessageGrant(member, 'create');
    const text = body.text?.trim() ? body.text.trim() : null;
    if (body.kind === 'text' && !text) throw ApiError.validation([{ field: 'text', message: 'is required for a text message' }]);
    if (text && text.length > 8000) throw ApiError.validation([{ field: 'text', message: 'is at most 8000 characters' }]);
    if (body.kind !== 'text' && !body.attachmentId) throw ApiError.validation([{ field: 'attachmentId', message: `is required for a ${body.kind} message` }]);
    if (body.kind === 'voice' && (!body.durationSec || body.durationSec < 1 || body.durationSec > 3600)) {
      throw ApiError.validation([{ field: 'durationSec', message: 'is 1 to 3600 seconds for a voice message' }]);
    }

    const scope = { workspaceId: member.workspaceId, userId: member.userId };
    const attempt = async (runner: Runner, unit: Unit | null) => {
      const prepared = unit ? await this.prepare(unit.tx, member, conversationId, body, text) : plainPrepared(body.kind, text);
      let row: SendRow;
      try {
        row = await this.insert(runner, member, conversationId, body.clientMsgId, prepared);
      } catch (error) {
        // A concurrent retry of the same send won the race: return what it stored.
        if (!isUniqueViolation(error, 'messages_client_msg_uq')) throw error;
        throw new DuplicateSend();
      }
      if (!row.inserted && !row.prior) {
        if (!row.me) {
          // Not a member: a viewer of a public channel, or no access at all (404 either way here).
          await (unit ? loadConversation(unit.tx, member, conversationId) : this.uow.run(scope, ({ tx }) => loadConversation(tx, member, conversationId)));
          throw ApiError.forbidden('Join the channel to post.');
        }
        if (row.me.archived) throw new ApiError('CONVERSATION_ARCHIVED');
        throw new ApiError('POSTING_RESTRICTED');
      }
      const stored = (row.inserted ?? row.prior) as NonNullable<SendRow['inserted']>;
      const sent: SentMessage = { id: stored.id, seq: Number(stored.seq), createdAt: iso(stored.created_at), duplicate: !row.inserted };
      if (row.prior || !unit) return { sent, prepared, mentions: row.prior ? [] : row.mention_ids };

      const mentions = row.mention_ids.filter((id) => id !== member.userId);
      const replyToAuthorId = prepared.replyTo?.authorId && prepared.replyTo.authorId !== member.userId ? prepared.replyTo.authorId : null;
      if (mentions.length > 0 || replyToAuthorId) {
        await this.outbox.add(unit.tx, {
          type: 'message.posted',
          aggregateType: 'conversation',
          aggregateId: conversationId,
          workspaceId: member.workspaceId,
          payload: {
            conversationId,
            messageId: sent.id,
            seq: sent.seq,
            excerpt: (text ?? '').slice(0, 140),
            mentionIds: mentions,
            replyToAuthorId,
          },
        });
      }
      if (options.audit) {
        await this.audit.write(unit.tx, {
          action: 'message.send',
          workspaceId: member.workspaceId,
          resourceType: 'message',
          resourceId: sent.id,
          changes: { after: { conversationId, seq: sent.seq, kind: body.kind } },
        });
      }
      return { sent, prepared, mentions: row.mention_ids };
    };
    // Most messages are plain text: one call, one round trip, no transaction block around it.
    // Anything with a side effect to keep atomic (a notification, the audit row) or a reference
    // to check first (a file, a reply) takes a unit of work.
    const plain = !options.audit && !body.attachmentId && !body.replyToId && mentionedIds(text).length === 0;
    const result = await (plain ? attempt(this.database.db, null) : this.uow.run(scope, (unit) => attempt(unit.tx, unit))).catch(async (error: unknown) => {
      if (!(error instanceof DuplicateSend)) throw error;
      return { sent: await this.prior(member, conversationId, body.clientMsgId), prepared: null, mentions: [] as string[] };
    });

    const message: MessageView = result.prepared
      ? {
          id: result.sent.id,
          conversationId,
          seq: result.sent.seq,
          authorId: member.userId,
          kind: result.prepared.kind,
          text: result.prepared.text,
          meta: result.prepared.meta as MessageView['meta'],
          attachment: attachmentView(result.prepared.attachment),
          replyToId: result.prepared.replyTo?.id ?? null,
          mentionIds: [...result.mentions].sort(),
          reactions: [],
          clientMsgId: body.clientMsgId,
          editedAt: null,
          deleted: false,
          linkedTaskId: null,
          createdAt: result.sent.createdAt,
        }
      : await this.one(member, result.sent.id);
    if (!result.sent.duplicate) {
      await this.publisher.emit({
        type: 'message:new',
        workspaceId: member.workspaceId,
        rooms: [rooms.conversation(conversationId)],
        except: options.socketId ? [options.socketId] : undefined,
        data: message,
      });
    }
    return { sent: result.sent, message };
  }

  /** Validates what the send refers to (attachment, reply) — only when it refers to something. */
  private async prepare(tx: Tx, member: MembershipContext, conversationId: string, body: SendMessageBody, text: string | null): Promise<PreparedSend> {
    let attachment: Record<string, unknown> | null = null;
    let replyTo: PreparedSend['replyTo'] = null;
    if (body.attachmentId || body.replyToId) {
      const result = await tx.execute<{ attachment: Record<string, unknown> | null; reply: { id: string; authorId: string | null } | null }>(sql`
        select
          (select json_build_object('id', a.id, 'name', a.file_name, 'kind', a.kind, 'mimeType', a.mime_type, 'size', a.size_bytes,
                                    'status', a.status, 'uploadedById', a.uploader_id, 'uploadedAt', a.created_at)
             from attachments a
             where a.workspace_id = ${member.workspaceId} and a.id = ${body.attachmentId ?? null}::uuid and a.uploader_id = ${member.userId}
               and a.status in ('scanning', 'ready') and a.deleted_at is null) as attachment,
          (select json_build_object('id', r.id, 'authorId', r.author_id)
             from messages r where r.workspace_id = ${member.workspaceId} and r.id = ${body.replyToId ?? null}::uuid
               and r.conversation_id = ${conversationId}) as reply`);
      const row = result.rows[0];
      if (body.attachmentId) {
        attachment = row?.attachment ?? null;
        if (!attachment) throw ApiError.validation([{ field: 'attachmentId', message: 'must be a completed upload of your own' }]);
        if (body.kind === 'voice' && attachment.kind !== 'audio') throw ApiError.validation([{ field: 'attachmentId', message: 'must be an audio file' }]);
      }
      if (body.replyToId) {
        replyTo = row?.reply ?? null;
        if (!replyTo) throw ApiError.validation([{ field: 'replyToId', message: 'must be a message of this conversation' }]);
      }
    }
    const meta =
      body.kind === 'voice'
        ? { durationSec: Math.round(body.durationSec ?? 0), waveform: (body.waveform ?? []).slice(0, 64).map((value) => Math.max(0, Math.min(100, Math.round(value)))) }
        : body.kind === 'file' && body.asFile === true
          ? { asFile: true }
          : null;
    return { kind: body.kind, text, meta, attachment, replyTo, mentions: mentionedIds(text) };
  }

  /** The one statement of the hot path (`app.send_message`, migration 0007). */
  private async insert(runner: Runner, member: MembershipContext, conversationId: string, clientMsgId: string, prepared: PreparedSend): Promise<SendRow> {
    const result = await runner.execute<{ r_inserted: SendRow['inserted']; r_prior: SendRow['prior']; r_me: SendRow['me']; r_mention_ids: string[] }>(sql`
      select * from app.send_message(${member.workspaceId}, ${member.userId}, ${this.context.requestId ?? ''}, ${conversationId}, ${clientMsgId},
        ${prepared.kind}::message_kind, ${prepared.text}, ${prepared.meta ? JSON.stringify(prepared.meta) : null}::jsonb,
        ${(prepared.attachment?.id as string | undefined) ?? null}::uuid, ${prepared.replyTo?.id ?? null}::uuid,
        ${prepared.text ? normaliseForSearch(prepared.text) : null}, ${sql.param(prepared.mentions)}::uuid[])`);
    const row = result.rows[0];
    return { inserted: row?.r_inserted ?? null, prior: row?.r_prior ?? null, me: row?.r_me ?? null, mention_ids: row?.r_mention_ids ?? [] };
  }

  private async prior(member: MembershipContext, conversationId: string, clientMsgId: string): Promise<SentMessage> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const result = await tx.execute<{ id: string; seq: string; created_at: string }>(sql`
        select id, seq, created_at from messages
        where workspace_id = ${member.workspaceId} and conversation_id = ${conversationId} and author_id = ${member.userId} and client_msg_id = ${clientMsgId}`);
      const row = result.rows[0];
      if (!row) throw new ApiError('CONFLICT', 'The same message is still being sent.');
      return { id: row.id, seq: Number(row.seq), createdAt: iso(row.created_at), duplicate: true };
    });
  }

  /** One message as its conversation's members see it. */
  async one(member: MembershipContext, messageId: string): Promise<MessageView> {
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const rows = (await tx.execute<MessageRow>(messagesQuery(sql`m.workspace_id = ${member.workspaceId} and m.id = ${messageId}`, sql`m.seq`, 1))).rows;
      const row = rows[0];
      if (!row) throw ApiError.notFound('The message');
      await loadConversation(tx, member, row.conversation_id);
      return toMessageView(row);
    });
  }

  /* ================================================================== edit, delete, react */

  async edit(member: MembershipContext, messageId: string, text: string, options: { conversationId?: string } = {}): Promise<MessageView> {
    requireMessageGrant(member, 'edit');
    const body = text.trim();
    if (!body || body.length > 8000) throw ApiError.validation([{ field: 'text', message: 'is 1 to 8000 characters' }]);
    const view = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const target = await this.target(tx, member, messageId, { lock: true, conversationId: options.conversationId });
      if (target.author_id !== member.userId) throw ApiError.forbidden('Only the author can edit a message.');
      if (target.deleted) throw new ApiError('MESSAGE_GONE');
      if (target.kind !== 'text' && target.kind !== 'file') throw ApiError.validation([{ field: 'text', message: 'only text messages and captions can be edited' }]);
      if (target.age_hours > EDIT_WINDOW_HOURS) throw new ApiError('EDIT_WINDOW_CLOSED');
      await tx.execute(sql`
        update messages set body_text = ${body}, search_text = ${normaliseForSearch(body)}, edited_at = now()
        where workspace_id = ${member.workspaceId} and id = ${messageId}`);
      // Mentions follow the text; editing does not notify again.
      await tx.execute(sql`delete from message_mentions where workspace_id = ${member.workspaceId} and message_id = ${messageId}`);
      const mentions = mentionedIds(body);
      if (mentions.length > 0) {
        await tx.execute(sql`
          insert into message_mentions (workspace_id, message_id, user_id)
          select ${member.workspaceId}, ${messageId}, cm.user_id from conversation_members cm
          where cm.workspace_id = ${member.workspaceId} and cm.conversation_id = ${target.conversation_id} and cm.left_at is null
            and cm.user_id = any(${sql.param(mentions)}::uuid[])`);
      }
      await this.audit.write(tx, {
        action: 'message.edit',
        workspaceId: member.workspaceId,
        resourceType: 'message',
        resourceId: messageId,
        changes: { before: { length: target.length }, after: { length: body.length } },
      });
      const rows = (await tx.execute<MessageRow>(messagesQuery(sql`m.workspace_id = ${member.workspaceId} and m.id = ${messageId}`, sql`m.seq`, 1))).rows;
      return toMessageView(rows[0] as MessageRow);
    });
    await this.publisher.emit({
      type: 'message:updated',
      workspaceId: member.workspaceId,
      rooms: [rooms.conversation(view.conversationId)],
      data: view,
      durable: true,
    });
    return view;
  }

  /** Soft delete: the `seq` stays taken, the content goes. The author always may; moderators too. */
  async remove(member: MembershipContext, messageId: string, options: { conversationId?: string } = {}): Promise<void> {
    const removed = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const target = await this.target(tx, member, messageId, { lock: true, conversationId: options.conversationId });
      if (target.deleted) return null;
      if (target.author_id !== member.userId && !target.access.canModerate) throw ApiError.forbidden();
      await tx.execute(sql`
        update messages set deleted_at = now(), body_text = null, body_meta = null, search_text = null, attachment_id = null
        where workspace_id = ${member.workspaceId} and id = ${messageId}`);
      await tx.execute(sql`delete from message_reactions where workspace_id = ${member.workspaceId} and message_id = ${messageId}`);
      await tx.execute(sql`delete from message_mentions where workspace_id = ${member.workspaceId} and message_id = ${messageId}`);
      await this.audit.write(tx, {
        action: target.author_id === member.userId ? 'message.delete' : 'message.moderate',
        workspaceId: member.workspaceId,
        resourceType: 'message',
        resourceId: messageId,
        changes: { before: { conversationId: target.conversation_id, seq: Number(target.seq), authorId: target.author_id } },
      });
      return { conversationId: target.conversation_id, seq: Number(target.seq) };
    });
    if (!removed) return;
    await this.publisher.emit({
      type: 'message:deleted',
      workspaceId: member.workspaceId,
      rooms: [rooms.conversation(removed.conversationId)],
      data: { conversationId: removed.conversationId, messageId, seq: removed.seq },
      durable: true,
    });
  }

  async react(
    member: MembershipContext,
    messageId: string,
    emoji: string,
    on: boolean,
    options: { audit?: boolean; conversationId?: string } = {},
  ): Promise<ReactionView> {
    requireMessageGrant(member, 'create');
    if (!/^[^\s\p{Cc}]{1,16}$/u.test(emoji) || Buffer.byteLength(emoji) > 32) throw ApiError.validation([{ field: 'emoji', message: 'must be one emoji' }]);
    const outcome = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const target = await this.target(tx, member, messageId, { conversationId: options.conversationId });
      if (target.deleted) throw new ApiError('MESSAGE_GONE');
      if (target.access.myRole === null) throw ApiError.forbidden('Join the channel to react.');
      if (on) {
        await tx.execute(sql`
          insert into message_reactions (workspace_id, message_id, user_id, emoji) values (${member.workspaceId}, ${messageId}, ${member.userId}, ${emoji})
          on conflict do nothing`);
      } else {
        await tx.execute(sql`
          delete from message_reactions where workspace_id = ${member.workspaceId} and message_id = ${messageId} and user_id = ${member.userId} and emoji = ${emoji}`);
      }
      const result = await tx.execute<{ user_ids: string[] | null }>(sql`
        select array_agg(user_id order by created_at, user_id) as user_ids from message_reactions
        where workspace_id = ${member.workspaceId} and message_id = ${messageId} and emoji = ${emoji}`);
      if (options.audit) {
        await this.audit.write(tx, {
          action: on ? 'message.react' : 'message.unreact',
          workspaceId: member.workspaceId,
          resourceType: 'message',
          resourceId: messageId,
          changes: { after: { emoji } },
        });
      }
      return { conversationId: target.conversation_id, userIds: result.rows[0]?.user_ids ?? [] };
    });
    const reaction: ReactionView = { emoji, userIds: outcome.userIds };
    await this.publisher.emit({
      type: 'reaction:updated',
      workspaceId: member.workspaceId,
      rooms: [rooms.conversation(outcome.conversationId)],
      data: { conversationId: outcome.conversationId, messageId, ...reaction },
      durable: true,
    });
    return reaction;
  }

  /** The message and the caller's access to its conversation; 404 when it is in another conversation than `conversationId`. */
  private async target(tx: Tx, member: MembershipContext, messageId: string, options: { lock?: boolean; conversationId?: string } = {}) {
    const result = await tx.execute<{
      conversation_id: string;
      author_id: string | null;
      kind: string;
      seq: string;
      deleted: boolean;
      age_hours: number;
      length: number;
      c_id: string;
      workspace_id: string;
      c_kind: 'direct' | 'group' | 'channel';
      title: string | null;
      is_private: boolean;
      post_policy: 'everyone' | 'admins';
      last_seq: string;
      archived: boolean;
      my_role: 'owner' | 'admin' | 'member' | null;
    }>(sql`
      select m.conversation_id, m.author_id, m.kind, m.seq, m.deleted_at is not null as deleted,
             extract(epoch from now() - m.created_at) / 3600 as age_hours, coalesce(char_length(m.body_text), 0) as length,
             c.id as c_id, c.workspace_id, c.kind as c_kind, c.title, c.is_private, c.post_policy, c.last_seq, c.archived_at is not null as archived,
             (select cm.role from conversation_members cm
               where cm.workspace_id = c.workspace_id and cm.conversation_id = c.id and cm.user_id = ${member.userId} and cm.left_at is null) as my_role
      from messages m
      join conversations c on c.workspace_id = m.workspace_id and c.id = m.conversation_id
      where m.workspace_id = ${member.workspaceId} and m.id = ${messageId}
      ${options.lock ? sql`for update of m` : sql``}`);
    const row = result.rows[0];
    if (!row || (options.conversationId !== undefined && row.conversation_id !== options.conversationId)) throw ApiError.notFound('The message');
    const access = accessFrom(member, {
      id: row.c_id,
      workspace_id: row.workspace_id,
      kind: row.c_kind,
      title: row.title,
      is_private: row.is_private,
      post_policy: row.post_policy,
      last_seq: row.last_seq,
      archived: row.archived,
      my_role: row.my_role,
    });
    return { ...row, age_hours: Number(row.age_hours), access };
  }

  /* ================================================================== cursors */

  /**
   * Moves the caller's read and/or delivered cursor forward (never back, never past the newest
   * message). Returns whether anything moved; `read:updated` goes out coalesced, at most once a
   * second per member and conversation.
   */
  async advance(member: MembershipContext, conversationId: string, cursors: { read?: number; delivered?: number }, options: { audit?: boolean } = {}): Promise<boolean> {
    if (!messageGrant(member, 'view')) throw ApiError.forbidden();
    const read = cursors.read !== undefined ? Math.max(0, Math.floor(cursors.read)) : null;
    const delivered = Math.max(read ?? 0, cursors.delivered !== undefined ? Math.max(0, Math.floor(cursors.delivered)) : 0);
    const moved = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const result = await tx.execute<{ last_read_seq: string; last_delivered_seq: string }>(sql`
        update conversation_members cm set
          last_read_seq = greatest(cm.last_read_seq, least(${read ?? 0}::bigint, c.last_seq)),
          last_delivered_seq = greatest(cm.last_delivered_seq, least(${delivered}::bigint, c.last_seq))
        from conversations c
        where cm.workspace_id = ${member.workspaceId} and cm.conversation_id = ${conversationId} and cm.user_id = ${member.userId}
          and cm.left_at is null and c.workspace_id = cm.workspace_id and c.id = cm.conversation_id
          and (cm.last_read_seq < least(${read ?? 0}::bigint, c.last_seq) or cm.last_delivered_seq < least(${delivered}::bigint, c.last_seq))
        returning cm.last_read_seq, cm.last_delivered_seq`);
      const row = result.rows[0];
      if (options.audit) {
        await this.audit.write(tx, {
          action: 'conversation.read',
          workspaceId: member.workspaceId,
          resourceType: 'conversation',
          resourceId: conversationId,
          changes: { after: { read, delivered } },
        });
      }
      if (!row) {
        // Nothing moved: either already there, or not a member (tell those apart for the caller).
        const exists = await tx.execute(sql`
          select 1 from conversation_members where workspace_id = ${member.workspaceId} and conversation_id = ${conversationId}
            and user_id = ${member.userId} and left_at is null`);
        if (exists.rows.length === 0) throw ApiError.notFound('The conversation');
        return null;
      }
      return { read: Number(row.last_read_seq), delivered: Number(row.last_delivered_seq) };
    });
    if (!moved) return false;
    this.queueRead({ workspaceId: member.workspaceId, conversationId, userId: member.userId, read: moved.read, delivered: moved.delivered });
    return true;
  }

  /**
   * The socket path for read and delivery receipts: the move joins the next batch (at most a
   * second away) instead of taking a transaction of its own, which is what keeps receipts cheap
   * at hundreds a second. The caller has checked membership (the socket is in the conversation's
   * room); the batch checks it again, and announces only what moved. A node that dies loses at
   * most a second of receipts, which the clients send again with their next read.
   */
  queueCursor(member: MembershipContext, conversationId: string, cursors: { read?: number; delivered?: number }): void {
    if (!messageGrant(member, 'view')) throw ApiError.forbidden();
    const read = cursors.read !== undefined ? Math.max(0, Math.floor(cursors.read)) : 0;
    const delivered = Math.max(read, cursors.delivered !== undefined ? Math.max(0, Math.floor(cursors.delivered)) : 0);
    this.coalesce(this.pendingCursors, { workspaceId: member.workspaceId, conversationId, userId: member.userId, read, delivered });
  }

  private queueRead(entry: CursorMove): void {
    this.coalesce(this.pendingReads, entry);
  }

  private coalesce(into: Map<string, CursorMove>, entry: CursorMove): void {
    const key = `${entry.conversationId}:${entry.userId}`;
    const current = into.get(key);
    into.set(key, current ? { ...entry, read: Math.max(current.read, entry.read), delivered: Math.max(current.delivered, entry.delivered) } : entry);
    if (!this.readTimer) {
      this.readTimer = setTimeout(() => void this.flushReads(), READ_COALESCE_MS);
      this.readTimer.unref();
    }
  }

  /** Writes the queued socket receipts in one statement, then announces every move of the window. */
  async flushReads(): Promise<void> {
    this.readTimer = undefined;
    const writes = [...this.pendingCursors.values()];
    this.pendingCursors.clear();
    const moved = new Map(this.pendingReads);
    this.pendingReads.clear();
    if (writes.length > 0) {
      try {
        const result = await this.uow.run({ workspaceId: null, userId: null }, ({ tx }) =>
          tx.execute<{ workspace_id: string; conversation_id: string; user_id: string; last_read_seq: string; last_delivered_seq: string; skipped: boolean }>(sql`
            select * from app.advance_cursors(
              ${sql.param(writes.map((entry) => entry.workspaceId))}::uuid[], ${sql.param(writes.map((entry) => entry.conversationId))}::uuid[],
              ${sql.param(writes.map((entry) => entry.userId))}::uuid[], ${sql.param(writes.map((entry) => entry.read))}::bigint[],
              ${sql.param(writes.map((entry) => entry.delivered))}::bigint[])`),
        );
        for (const row of result.rows) {
          const entry = { workspaceId: row.workspace_id, conversationId: row.conversation_id, userId: row.user_id, read: Number(row.last_read_seq), delivered: Number(row.last_delivered_seq) };
          // A send held the row: the receipt waits for the next window instead of for the send.
          if (row.skipped) {
            this.coalesce(this.pendingCursors, entry);
            continue;
          }
          const key = `${entry.conversationId}:${entry.userId}`;
          const current = moved.get(key);
          moved.set(key, current ? { ...entry, read: Math.max(current.read, entry.read), delivered: Math.max(current.delivered, entry.delivered) } : entry);
        }
      } catch (error) {
        this.logger.warn({ error: error instanceof Error ? error.message : String(error), receipts: writes.length }, 'read receipts not written');
      }
    }
    if (moved.size === 0) return;
    await this.publisher.emit(
      ...[...moved.values()].map((entry) => ({
        type: 'read:updated' as const,
        workspaceId: entry.workspaceId,
        rooms: [rooms.conversation(entry.conversationId)],
        actorId: entry.userId,
        data: { conversationId: entry.conversationId, userId: entry.userId, lastReadSeq: entry.read, lastDeliveredSeq: entry.delivered },
      })),
    );
  }

  /* ================================================================== shared media */

  async media(member: MembershipContext, conversationId: string, query: { tab: MediaTab; cursor?: string; limit?: number }): Promise<MediaPage> {
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 100);
    const before = query.cursor !== undefined ? Number.parseInt(query.cursor, 10) : null;
    if (before !== null && (!Number.isFinite(before) || before < 1)) throw ApiError.validation([{ field: 'cursor', message: 'is not a cursor this API issued' }]);
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      await loadConversation(tx, member, conversationId);
      const scope = sql`m.workspace_id = ${member.workspaceId} and m.conversation_id = ${conversationId} and m.deleted_at is null
        and ${withinHistory(member.workspaceId)} ${before !== null ? sql`and m.seq < ${before}` : sql``}`;
      if (query.tab === 'links') {
        const result = await tx.execute<{ id: string; seq: string; author_id: string | null; created_at: string; url: string }>(sql`
          select m.id, m.seq, m.author_id, m.created_at, link.url
          from (select m.* from messages m where ${scope} and m.body_text ~* 'https?://' order by m.seq desc limit ${limit + 1}) m
          cross join lateral (select (regexp_matches(m.body_text, ${'https?://[^\\s<>"\']+'}, 'gi'))[1] as url) link
          order by m.seq desc`);
        const seqs = [...new Set(result.rows.map((row) => Number(row.seq)))];
        const kept = new Set(seqs.slice(0, limit));
        const items: MediaItem[] = result.rows
          .filter((row) => kept.has(Number(row.seq)))
          .map((row) => ({ messageId: row.id, seq: Number(row.seq), authorId: row.author_id, createdAt: iso(row.created_at), attachment: null, durationSec: null, url: row.url }));
        return { items, nextCursor: seqs.length > limit ? String(seqs[limit - 1]) : null };
      }
      const kinds =
        query.tab === 'files' ? sql`a.kind in ('document', 'sheet', 'archive')` : query.tab === 'media' ? sql`a.kind in ('image', 'video')` : sql`(m.kind = 'voice' or a.kind = 'audio')`;
      const result = await tx.execute<{ id: string; seq: string; author_id: string | null; created_at: string; attachment: Record<string, unknown>; meta: Record<string, unknown> | null }>(sql`
        select m.id, m.seq, m.author_id, m.created_at, m.body_meta as meta,
               json_build_object('id', a.id, 'name', a.file_name, 'kind', a.kind, 'mimeType', a.mime_type, 'size', a.size_bytes,
                                 'status', a.status, 'uploadedById', a.uploader_id, 'uploadedAt', a.created_at) as attachment
        from messages m
        join attachments a on a.workspace_id = m.workspace_id and a.id = m.attachment_id and a.deleted_at is null
        where ${scope} and m.attachment_id is not null and ${kinds}
        order by m.seq desc
        limit ${limit + 1}`);
      const rows = result.rows.slice(0, limit);
      return {
        items: rows.map((row) => ({
          messageId: row.id,
          seq: Number(row.seq),
          authorId: row.author_id,
          createdAt: iso(row.created_at),
          attachment: attachmentView(row.attachment),
          durationSec: typeof row.meta?.durationSec === 'number' ? row.meta.durationSec : null,
          url: null,
        })),
        nextCursor: result.rows.length > limit ? String(rows.at(-1)?.seq) : null,
      };
    });
  }
}

/** Internal signal: the unique index caught a concurrent retry; re-read outside the failed unit. */
class DuplicateSend extends Error {}

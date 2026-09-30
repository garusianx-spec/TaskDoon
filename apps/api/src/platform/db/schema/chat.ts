import { sql } from 'drizzle-orm';
import { bigint, boolean, check, foreignKey, index, jsonb, pgTable, primaryKey, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, updatedAt, uuidPk } from './columns.js';
import {
  avatarTone,
  conversationKind,
  conversationRole,
  membershipMode,
  messageKind,
  notificationLevel,
  postPolicy,
  scheduledMessageStatus,
} from './enums.js';
import { attachments } from './content.js';
import { workspaceMembers, workspaces } from './tenancy.js';

/**
 * Chat (RFC §8): conversations, their members with per-member read cursors, messages numbered by
 * a per-conversation `seq`, reactions and mentions. Every table is tenant-scoped with row-level
 * security; `messages.reply_to_id` and `conversations.project_id` use column-list SET NULL
 * foreign keys declared in SQL (0007), like the M2 references.
 */

const tenant = () =>
  uuid()
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' });

/** A `(workspace_id, user_id)` reference to a workspace member. */
const member = (name: string, columns: Parameters<typeof foreignKey>[0]['columns']) =>
  foreignKey({ name, columns, foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId] });

export const conversations = pgTable(
  'conversations',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    kind: conversationKind().notNull(),
    /** `null` for direct chats, which the client names after the other person. */
    title: text(),
    topic: text().notNull().default(''),
    tone: avatarTone().notNull().default('brand'),
    /** `minUserId:maxUserId` for direct chats: the unique key that makes "open a DM" race-safe. */
    directKey: text(),
    /** Channels only: a public channel can be found and joined by any non-guest member. */
    isPrivate: boolean().notNull().default(true),
    postPolicy: postPolicy().notNull().default('everyone'),
    projectId: uuid(),
    membershipMode: membershipMode().notNull().default('manual'),
    /** The newest message's `seq`; bumped under the row lock, so numbers never repeat or skip. */
    lastSeq: bigint({ mode: 'number' }).notNull().default(0),
    lastMessageAt: instant(),
    createdBy: uuid().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: instant(),
  },
  (t) => [
    unique('conversations_ws_id_uq').on(t.workspaceId, t.id),
    uniqueIndex('conversations_direct_uq').on(t.workspaceId, t.directKey).where(sql`${t.kind} = 'direct'`),
    index('conversations_project_idx').on(t.workspaceId, t.projectId).where(sql`${t.projectId} is not null`),
    // Browsing the public channels of a workspace.
    index('conversations_public_idx')
      .on(t.workspaceId, t.createdAt)
      .where(sql`${t.kind} = 'channel' and not ${t.isPrivate} and ${t.archivedAt} is null`),
    member('conversations_created_by_fk', [t.workspaceId, t.createdBy]),
    check('conversations_title', sql`${t.kind} = 'direct' or char_length(${t.title}) between 1 and 80`),
    check('conversations_topic_len', sql`char_length(${t.topic}) <= 250`),
    check('conversations_direct_key', sql`(${t.kind} = 'direct') = (${t.directKey} is not null)`),
    check('conversations_direct_shape', sql`${t.kind} <> 'direct' or (${t.isPrivate} and ${t.postPolicy} = 'everyone')`),
  ],
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    workspaceId: tenant(),
    conversationId: uuid().notNull(),
    userId: uuid().notNull(),
    role: conversationRole().notNull().default('member'),
    /** Read receipts are cursors, not rows per message: "read up to here". */
    lastReadSeq: bigint({ mode: 'number' }).notNull().default(0),
    lastDeliveredSeq: bigint({ mode: 'number' }).notNull().default(0),
    pinnedAt: instant(),
    mutedUntil: instant(),
    notificationLevel: notificationLevel().notNull().default('all'),
    /** A hidden direct chat reappears with its next message. */
    hiddenAt: instant(),
    joinedAt: createdAt(),
    /** Left members keep their row (their messages stay attributed); rejoining clears it. */
    leftAt: instant(),
  },
  (t) => [
    primaryKey({ name: 'conversation_members_pk', columns: [t.conversationId, t.userId] }),
    foreignKey({
      name: 'conversation_members_conversation_fk',
      columns: [t.workspaceId, t.conversationId],
      foreignColumns: [conversations.workspaceId, conversations.id],
    }).onDelete('cascade'),
    member('conversation_members_user_fk', [t.workspaceId, t.userId]),
    // The sidebar: my conversations in this workspace.
    index('conversation_members_user_idx').on(t.workspaceId, t.userId).where(sql`${t.leftAt} is null`),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    conversationId: uuid().notNull(),
    seq: bigint({ mode: 'number' }).notNull(),
    /** `null` for system messages. */
    authorId: uuid(),
    kind: messageKind().notNull(),
    /** Mentions are `<@userId>` tokens, rendered by the client. `null` once deleted. */
    bodyText: text(),
    /** Voice: `{durationSec, waveform}`. System: `{type, params}`. */
    bodyMeta: jsonb().$type<Record<string, unknown>>(),
    attachmentId: uuid(),
    replyToId: uuid(),
    /** The sender's retry key: a resend with the same id returns the stored message. */
    clientMsgId: uuid(),
    /** For messages the system writes from outbox events: at most one per event. */
    sourceEventId: bigint({ mode: 'number' }),
    searchText: text(),
    editedAt: instant(),
    deletedAt: instant(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('messages_ws_id_uq').on(t.workspaceId, t.id),
    // Paging, gap sync and every per-conversation scan run on this index.
    unique('messages_conversation_seq_uq').on(t.conversationId, t.seq),
    uniqueIndex('messages_client_msg_uq').on(t.conversationId, t.authorId, t.clientMsgId).where(sql`${t.clientMsgId} is not null`),
    uniqueIndex('messages_source_event_uq').on(t.conversationId, t.sourceEventId).where(sql`${t.sourceEventId} is not null`),
    foreignKey({
      name: 'messages_conversation_fk',
      columns: [t.workspaceId, t.conversationId],
      foreignColumns: [conversations.workspaceId, conversations.id],
    }).onDelete('cascade'),
    member('messages_author_fk', [t.workspaceId, t.authorId]),
    foreignKey({ name: 'messages_attachment_fk', columns: [t.workspaceId, t.attachmentId], foreignColumns: [attachments.workspaceId, attachments.id] }),
    // Shared media: the files and the links of a conversation, newest first, without a full scan.
    index('messages_attachment_idx').on(t.conversationId, t.seq).where(sql`${t.attachmentId} is not null and ${t.deletedAt} is null`),
    index('messages_links_idx').on(t.conversationId, t.seq).where(sql`${t.bodyText} ~* 'https?://' and ${t.deletedAt} is null`),
    // Garbage collection asks whether any message still links a file.
    index('messages_attachment_ref_idx').on(t.attachmentId).where(sql`${t.attachmentId} is not null`),
    index('messages_search_idx').using('gin', t.workspaceId, t.searchText.op('gin_trgm_ops')).where(sql`${t.deletedAt} is null`),
    check('messages_seq_positive', sql`${t.seq} > 0`),
    check('messages_body_len', sql`char_length(${t.bodyText}) <= 8000`),
    check('messages_author', sql`(${t.kind} = 'system') = (${t.authorId} is null)`),
  ],
);

export const messageReactions = pgTable(
  'message_reactions',
  {
    workspaceId: tenant(),
    messageId: uuid().notNull(),
    userId: uuid().notNull(),
    emoji: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'message_reactions_pk', columns: [t.messageId, t.userId, t.emoji] }),
    foreignKey({
      name: 'message_reactions_message_fk',
      columns: [t.workspaceId, t.messageId],
      foreignColumns: [messages.workspaceId, messages.id],
    }).onDelete('cascade'),
    member('message_reactions_user_fk', [t.workspaceId, t.userId]),
    check('message_reactions_emoji_len', sql`octet_length(${t.emoji}) between 1 and 32`),
  ],
);

export const messageMentions = pgTable(
  'message_mentions',
  {
    workspaceId: tenant(),
    messageId: uuid().notNull(),
    userId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ name: 'message_mentions_pk', columns: [t.messageId, t.userId] }),
    foreignKey({
      name: 'message_mentions_message_fk',
      columns: [t.workspaceId, t.messageId],
      foreignColumns: [messages.workspaceId, messages.id],
    }).onDelete('cascade'),
    member('message_mentions_user_fk', [t.workspaceId, t.userId]),
    index('message_mentions_user_idx').on(t.workspaceId, t.userId),
  ],
);

/* ---------------------------------------------------------------- Phase 3.2 */

/**
 * Messages waiting for their time. Private to their author (row-level security narrows them to
 * `app.user_id`, like notes) until the worker sends them as the author; the sent message takes
 * the same `client_msg_id`, so a dispatch retried after a crash still stores it once. A
 * dispatcher holds `claimed_at` while it sends; a claim older than two minutes is abandoned and
 * taken over. `reply_to_id` and `message_id` are column-list SET NULL references in SQL (0013).
 */
export const scheduledMessages = pgTable(
  'scheduled_messages',
  {
    id: uuidPk(),
    workspaceId: tenant(),
    conversationId: uuid().notNull(),
    authorId: uuid().notNull(),
    kind: messageKind().notNull(),
    bodyText: text(),
    /** Voice: `{durationSec, waveform}`. Files: `{asFile}`. */
    bodyMeta: jsonb().$type<Record<string, unknown>>(),
    attachmentId: uuid(),
    replyToId: uuid(),
    clientMsgId: uuid().notNull(),
    scheduledAt: instant().notNull(),
    status: scheduledMessageStatus().notNull().default('pending'),
    claimedAt: instant(),
    /** The message it became. */
    messageId: uuid(),
    /** The API error code that kept it from going out. */
    failureCode: text(),
    sentAt: instant(),
    cancelledAt: instant(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('scheduled_messages_ws_id_uq').on(t.workspaceId, t.id),
    // A retried schedule returns the first one; the sent message reuses the id.
    uniqueIndex('scheduled_messages_client_msg_uq').on(t.conversationId, t.authorId, t.clientMsgId),
    foreignKey({
      name: 'scheduled_messages_conversation_fk',
      columns: [t.workspaceId, t.conversationId],
      foreignColumns: [conversations.workspaceId, conversations.id],
    }).onDelete('cascade'),
    member('scheduled_messages_author_fk', [t.workspaceId, t.authorId]),
    foreignKey({ name: 'scheduled_messages_attachment_fk', columns: [t.workspaceId, t.attachmentId], foreignColumns: [attachments.workspaceId, attachments.id] }),
    // The author's list in one conversation (the bar above the composer), soonest first.
    index('scheduled_messages_author_idx').on(t.workspaceId, t.authorId, t.conversationId, t.scheduledAt).where(sql`${t.status} = 'pending'`),
    // The worker's sweep for anything due that its delayed job missed.
    index('scheduled_messages_due_idx').on(t.scheduledAt).where(sql`${t.status} = 'pending'`),
    // Garbage collection asks whether a pending schedule still needs a file.
    index('scheduled_messages_attachment_idx').on(t.attachmentId).where(sql`${t.attachmentId} is not null and ${t.status} = 'pending'`),
    check('scheduled_messages_kind', sql`${t.kind} <> 'system'`),
    check('scheduled_messages_body_len', sql`char_length(${t.bodyText}) <= 8000`),
    check('scheduled_messages_sent', sql`(${t.status} = 'sent') = (${t.sentAt} is not null)`),
  ],
);

/**
 * A member's working hours in one workspace and their out-of-office auto-reply (Phase 3.2).
 * Hours are `HH:mm` wall-clock times read in the workspace's zone; an end before the start runs
 * past midnight. No row means the defaults, with the auto-reply off.
 */
export const memberWorkingHours = pgTable(
  'member_working_hours',
  {
    workspaceId: tenant(),
    userId: uuid().notNull(),
    autoReplyEnabled: boolean().notNull().default(false),
    days: text().array().notNull(),
    startTime: text().notNull(),
    endTime: text().notNull(),
    message: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'member_working_hours_pk', columns: [t.workspaceId, t.userId] }),
    member('member_working_hours_user_fk', [t.workspaceId, t.userId]).onDelete('cascade'),
    // Who in a workspace answers automatically (the per-node cache reads this).
    index('member_working_hours_enabled_idx').on(t.workspaceId).where(sql`${t.autoReplyEnabled}`),
    check(
      'member_working_hours_days',
      sql`${t.days} <@ array['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']::text[]`,
    ),
    check('member_working_hours_start', sql`${t.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check('member_working_hours_end', sql`${t.endTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check('member_working_hours_window', sql`${t.startTime} <> ${t.endTime}`),
    check('member_working_hours_message_len', sql`char_length(${t.message}) between 1 and 500`),
  ],
);

/**
 * When a member's auto-reply last answered each person (Phase 3.2): at most once in 24 hours per
 * pair, so two people who are both away cannot answer each other in a loop.
 */
export const autoReplyLog = pgTable(
  'auto_reply_log',
  {
    workspaceId: tenant(),
    /** The member who is away. */
    userId: uuid().notNull(),
    /** The person whose direct message was answered. */
    senderId: uuid().notNull(),
    repliedAt: instant().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'auto_reply_log_pk', columns: [t.workspaceId, t.userId, t.senderId] }),
    member('auto_reply_log_user_fk', [t.workspaceId, t.userId]).onDelete('cascade'),
    member('auto_reply_log_sender_fk', [t.workspaceId, t.senderId]).onDelete('cascade'),
  ],
);

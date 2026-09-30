import type { AvatarTone, ConversationKind } from '../domain.js';
import type { TaskPriority } from '../domain.js';
import type { ApiErrorCode } from './errors.js';
import type { AttachmentView, TaskDetail } from './work.js';
import type { WeekDay } from './workspaces.js';

/* ============================================================== conversations */

/** A member's role inside one conversation (not the workspace role). */
export type ConversationRole = 'owner' | 'admin' | 'member';

/** Who may post: everyone, or only the conversation's owners and admins (announcement channels). */
export type PostPolicy = 'everyone' | 'admins';

/** `project_synced`: the channel's members follow its project's members. */
export type MembershipMode = 'manual' | 'project_synced';

/** What a member hears about: every message, only mentions and replies, or nothing. */
export type NotificationLevel = 'all' | 'mentions' | 'none';

export type MessageKind = 'text' | 'voice' | 'file' | 'system';

/** The newest message, for the sidebar. `text` is cut to 160 characters. */
export interface MessagePreview {
  readonly id: string;
  readonly seq: number;
  readonly authorId: string | null;
  readonly kind: MessageKind;
  readonly text: string | null;
  readonly deleted: boolean;
  readonly createdAt: string;
}

/** One conversation as the signed-in member sees it (the sidebar row). */
export interface ConversationView {
  readonly id: string;
  readonly kind: ConversationKind;
  /** `null` for direct chats: the client names them after the other member. */
  readonly title: string | null;
  readonly topic: string;
  readonly tone: AvatarTone;
  /** Channels only: `false` means any workspace member (not a guest) can find and join it. */
  readonly isPrivate: boolean;
  readonly postPolicy: PostPolicy;
  readonly projectId: string | null;
  /**
   * `project_synced`: a project's own channel. Its members are the project's members, kept in step
   * with them; people are added and removed through the project, not the channel.
   */
  readonly membershipMode: MembershipMode;
  readonly memberIds: readonly string[];
  readonly memberCount: number;
  /** `null` when the caller is not a member (a public channel they can join). */
  readonly myRole: ConversationRole | null;
  readonly pinned: boolean;
  readonly mutedUntil: string | null;
  readonly notificationLevel: NotificationLevel;
  readonly hidden: boolean;
  /** Messages after the caller's read cursor, not their own, capped at 100 (show "99+"). */
  readonly unreadCount: number;
  /** Every message has a `seq`, 1, 2, 3 … with no gaps; this is the newest. */
  readonly lastSeq: number;
  readonly lastReadSeq: number;
  readonly lastMessage: MessagePreview | null;
  readonly lastMessageAt: string | null;
  readonly archived: boolean;
  readonly createdAt: string;
}

export interface ConversationMemberView {
  readonly userId: string;
  readonly role: ConversationRole;
  /** Read receipts derive from cursors: a member has read message n when `lastReadSeq >= n`. */
  readonly lastReadSeq: number;
  readonly lastDeliveredSeq: number;
  readonly joinedAt: string;
}

export interface ConversationDetail extends ConversationView {
  readonly members: readonly ConversationMemberView[];
}

export type CreateConversationBody =
  /** Returns the existing direct chat with that person when there is one. */
  | { readonly kind: 'direct'; readonly userId: string }
  | {
      readonly kind: 'group';
      readonly title: string;
      readonly topic?: string;
      readonly tone?: AvatarTone;
      readonly memberIds: readonly string[];
    }
  | {
      readonly kind: 'channel';
      readonly title: string;
      readonly topic?: string;
      readonly tone?: AvatarTone;
      readonly isPrivate?: boolean;
      readonly postPolicy?: PostPolicy;
      readonly memberIds?: readonly string[];
    };

export interface UpdateConversationBody {
  readonly title?: string;
  readonly topic?: string;
  readonly tone?: AvatarTone;
  readonly isPrivate?: boolean;
  readonly postPolicy?: PostPolicy;
}

/** Adds a member, changes a member's role, or (for a public channel, on yourself) joins. */
export interface PutConversationMemberBody {
  readonly role?: ConversationRole;
}

/** The caller's own settings for one conversation. */
export interface UpdateMyConversationBody {
  readonly pinned?: boolean;
  /** An instant; `null` unmutes. */
  readonly mutedUntil?: string | null;
  readonly notificationLevel?: NotificationLevel;
  /** Hides a direct chat until its next message. */
  readonly hidden?: boolean;
}

/* ============================================================== messages */

export interface ReactionView {
  readonly emoji: string;
  readonly userIds: readonly string[];
}

/**
 * Voice notes: duration and a 64-sample waveform (0–100). System messages: a type and its params.
 * Files: `asFile` when a picture was sent as a document rather than a photo. `autoReply`: the
 * author's out-of-office answer, posted for them outside their working hours.
 */
export type MessageMeta =
  | { readonly durationSec: number; readonly waveform: readonly number[] }
  | { readonly type: string; readonly params: Readonly<Record<string, string>> }
  | { readonly asFile: true }
  | { readonly autoReply: true };

export interface MessageView {
  readonly id: string;
  readonly conversationId: string;
  readonly seq: number;
  /** `null` for system messages. */
  readonly authorId: string | null;
  readonly kind: MessageKind;
  /** Mentions are `<@userId>` tokens; the client renders the names. `null` once deleted. */
  readonly text: string | null;
  readonly meta: MessageMeta | null;
  readonly attachment: AttachmentView | null;
  readonly replyToId: string | null;
  readonly mentionIds: readonly string[];
  readonly reactions: readonly ReactionView[];
  readonly clientMsgId: string | null;
  readonly editedAt: string | null;
  readonly deleted: boolean;
  /** The live task made from this message, if any. */
  readonly linkedTaskId: string | null;
  readonly createdAt: string;
}

/** A page of history, oldest first. */
export interface MessagePage {
  readonly items: readonly MessageView[];
  /** Pass as `beforeSeq` for older messages; `null` at the start (or the plan's history limit). */
  readonly olderBeforeSeq: number | null;
  /** Pass as `afterSeq` for newer messages; `null` when this page reaches the newest. */
  readonly newerAfterSeq: number | null;
}

export interface SendMessageBody {
  /** Chosen by the client (UUID); a retry with the same id returns the first message. */
  readonly clientMsgId: string;
  readonly kind: 'text' | 'voice' | 'file';
  readonly text?: string;
  /** Voice notes and files: an upload of the sender's own. */
  readonly attachmentId?: string;
  readonly replyToId?: string;
  /** Voice notes only. */
  readonly durationSec?: number;
  readonly waveform?: readonly number[];
  /** Files only: a picture sent as a document (its original bytes, shown as a download card). */
  readonly asFile?: boolean;
}

/** The ack of a send: persisted, with its place in the conversation. */
export interface SentMessage {
  readonly id: string;
  readonly seq: number;
  readonly createdAt: string;
  /** `true` when this was a retry and the first attempt had already been stored. */
  readonly duplicate: boolean;
}

export interface EditMessageBody {
  readonly text: string;
}

/** Advances the caller's read (and delivered) cursor; it never moves backwards. */
export interface ReadCursorBody {
  readonly seq: number;
}

/* ============================================================== shared media */

export type MediaTab = 'files' | 'media' | 'audio' | 'links';

export interface MediaItem {
  readonly messageId: string;
  readonly seq: number;
  readonly authorId: string | null;
  readonly createdAt: string;
  /** Files, media and audio tabs. */
  readonly attachment: AttachmentView | null;
  /** Voice notes in the audio tab. */
  readonly durationSec: number | null;
  /** Links tab: one entry per link in the message. */
  readonly url: string | null;
}

export interface MediaPage {
  readonly items: readonly MediaItem[];
  readonly nextCursor: string | null;
}

/* ============================================================== message → task */

/**
 * «تبدیل پیام به وظیفه»: a task made from a message, linked to it for good. The title and the
 * rest are the composer's; files can only be the message's own.
 */
export interface ConvertMessageBody {
  readonly projectId: string;
  readonly title: string;
  readonly description?: string;
  readonly columnId?: string | null;
  readonly priority?: TaskPriority;
  readonly assigneeIds?: readonly string[];
  readonly dueDate?: string | null;
  readonly subtasks?: readonly string[];
  /** Must be the message's attachment; nothing else can be linked through this route. */
  readonly attachmentIds?: readonly string[];
}

export interface ConvertMessageResult {
  readonly task: TaskDetail;
  /** `true` when the message already had a live task: that task is returned. */
  readonly existing: boolean;
}

/* ============================================================== scheduled messages */

/**
 * `pending` until it goes out; `sent` once it is a message of the conversation; `cancelled` by its
 * author; `failed` when it could not go out when it was due (`failureCode` says why: the author
 * left or may no longer post there, the conversation was archived, the file or the message it
 * replied to is gone).
 */
export type ScheduledMessageStatus = 'pending' | 'sent' | 'cancelled' | 'failed';

/** A message that waits for `scheduledAt`. Until it is sent, only its author sees it. */
export interface ScheduledMessageView {
  readonly id: string;
  readonly conversationId: string;
  readonly authorId: string;
  readonly kind: 'text' | 'voice' | 'file';
  readonly text: string | null;
  readonly meta: MessageMeta | null;
  readonly attachment: AttachmentView | null;
  readonly replyToId: string | null;
  /** The sent message's client id as well: its `message:new` carries the same one. */
  readonly clientMsgId: string;
  readonly scheduledAt: string;
  readonly status: ScheduledMessageStatus;
  /** The message it became (`sent`). */
  readonly messageId: string | null;
  /** Why it could not go out (`failed`). */
  readonly failureCode: ApiErrorCode | null;
  readonly createdAt: string;
}

/**
 * What `POST …/messages` takes, plus when to send it. A retry with the same `clientMsgId` returns
 * the message already scheduled.
 */
export interface ScheduleMessageBody extends SendMessageBody {
  /** An instant at least ten seconds ahead and at most a year away. */
  readonly scheduledAt: string;
}

/* ============================================================== working hours and auto-reply */

/**
 * A member's working hours in one workspace, read in the workspace's time zone, and their
 * out-of-office auto-reply: a direct message that arrives outside these hours is answered with
 * `message` on their behalf, at most once a day for each person who writes. Groups, channels and
 * project channels are never answered.
 */
export interface WorkingHoursView {
  readonly autoReplyEnabled: boolean;
  /** Working days. None at all means away all week (on leave). */
  readonly days: readonly WeekDay[];
  /** `HH:mm`. An end before the start is a shift that runs past midnight. */
  readonly start: string;
  readonly end: string;
  readonly message: string;
  /** The workspace's zone, which the hours are read in. */
  readonly timeZone: string;
  /** `null` until first saved: the view shows the defaults. */
  readonly updatedAt: string | null;
}

export interface UpdateWorkingHoursBody {
  readonly autoReplyEnabled: boolean;
  readonly days: readonly WeekDay[];
  readonly start: string;
  readonly end: string;
  readonly message: string;
}

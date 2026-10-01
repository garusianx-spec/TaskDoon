/**
 * Domain model for Taskin.
 *
 * Every union below is closed and exhaustively switched on at the call sites, so adding a
 * member surfaces as a compile error rather than a runtime fallthrough. There is no `any`
 * in this file or anywhere downstream of it.
 */

/* ============================== Identity & people ============================== */

export type RoleId = 'owner' | 'admin' | 'manager' | 'member' | 'guest';

export type PresenceState = 'online' | 'busy' | 'away' | 'offline';

export type DepartmentId =
  | 'engineering'
  | 'product'
  | 'design'
  | 'marketing'
  | 'finance'
  | 'operations';

export interface Department {
  readonly id: DepartmentId;
  readonly name: string;
  readonly memberCount: number;
}

export interface User {
  readonly id: string;
  readonly fullName: string;
  readonly initials: string;
  readonly jobTitle: string;
  readonly role: RoleId;
  readonly department: DepartmentId;
  readonly presence: PresenceState;
  /** Deterministic avatar tint index (0–5) — avoids shipping binary avatars in the repo. */
  readonly avatarTone: AvatarTone;
  readonly email: string;
  readonly phone: string;
}

export type AvatarTone = 'brand' | 'teal' | 'violet' | 'amber' | 'rose' | 'slate';

/* ============================== Role & permission (RBAC) ============================== */

export type PermissionModuleId = 'messages' | 'boards' | 'files' | 'reports' | 'members';

export type PermissionActionId = 'view' | 'create' | 'edit' | 'delete' | 'assign';

export type ModulePermissions = Readonly<Record<PermissionActionId, boolean>>;

export type RolePermissions = Readonly<Record<PermissionModuleId, ModulePermissions>>;

export type PermissionMatrix = Readonly<Record<RoleId, RolePermissions>>;

export interface RoleDescriptor {
  readonly id: RoleId;
  readonly name: string;
  readonly description: string;
  /** Owner is immutable by design — its switches render locked. */
  readonly locked: boolean;
  readonly memberCount: number;
  /** Lower number == more authority. Drives the hierarchy ordering in the UI. */
  readonly rank: number;
}

export interface PermissionModuleDescriptor {
  readonly id: PermissionModuleId;
  readonly name: string;
  readonly description: string;
}

export interface PermissionActionDescriptor {
  readonly id: PermissionActionId;
  readonly name: string;
  readonly shortName: string;
}

/* ============================== Projects & tasks ============================== */

export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done';

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

export type SemanticTone = 'done' | 'progress' | 'blocked' | 'todo' | 'review';

export interface Subtask {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
  readonly assigneeId: string | null;
}

export type AttachmentKind = 'image' | 'document' | 'sheet' | 'archive' | 'audio' | 'link';

export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly kind: AttachmentKind;
  /** Bytes. Formatted for display by `formatFileSize`. */
  readonly size: number;
  readonly uploadedAt: string;
  readonly uploadedById: string;
}

export interface TaskComment {
  readonly id: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: string;
  readonly replyToId: string | null;
}

/* ------------------------------ Reminders ------------------------------ */

/** How far ahead of the due date the reminder fires. */
export type ReminderOffsetId = '15m' | '30m' | '1h' | '1d' | 'custom';

export interface TaskReminder {
  readonly offset: ReminderOffsetId;
  /**
   * Only meaningful when `offset` is `'custom'`: an explicit ISO-8601 instant chosen with
   * the Jalali date/time picker. Null for the preset offsets, which are derived from the
   * due date at read time so that moving the deadline moves the reminder with it.
   */
  readonly customAt: string | null;
}

/* ------------------------------ Recurrence ------------------------------ */

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** When the series stops generating occurrences. */
export type RecurrenceEnd =
  | { readonly kind: 'never' }
  | { readonly kind: 'on-date'; readonly date: string }
  | { readonly kind: 'after-count'; readonly count: number };

export interface TaskRecurrence {
  readonly frequency: RecurrenceFrequency;
  /** Repeat every N periods — "هر ۲ هفته یک‌بار" is `weekly` with an interval of 2. */
  readonly interval: number;
  readonly end: RecurrenceEnd;
}

export interface Task {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  /** Which board column the card sits in. Defaults to the column whose id is `status`. */
  readonly columnId: string;
  readonly priority: TaskPriority;
  readonly projectId: string;
  readonly assigneeIds: readonly string[];
  readonly reviewerId: string | null;
  /** ISO-8601 Gregorian; rendered as Jalali everywhere in the UI. */
  readonly startDate: string;
  readonly dueDate: string;
  readonly createdAt: string;
  readonly subtasks: readonly Subtask[];
  readonly attachments: readonly Attachment[];
  readonly comments: readonly TaskComment[];
  readonly labels: readonly string[];
  readonly starred: boolean;
  /** Set when the task was created from a chat message via "تبدیل به وظیفه". */
  readonly sourceMessageId: string | null;
  /** Null when no reminder is configured. */
  readonly reminder: TaskReminder | null;
  /** Null for a one-off task; present turns the card into a series. */
  readonly recurrence: TaskRecurrence | null;
}

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly departmentId: DepartmentId;
  readonly color: AvatarTone;
  readonly starred: boolean;
  readonly parentId: string | null;
  readonly memberIds: readonly string[];
  /** Conversation spawned alongside the project; null for projects created before linkage. */
  readonly conversationId: string | null;
}

/**
 * A Kanban column.
 *
 * Columns are data so workspaces can add their own, but `status` stays a closed union:
 * every column maps onto one of the four canonical workflow statuses. That keeps filters,
 * smart views, the Gantt and the calendar working off an exhaustively-switched type while
 * the board renders whatever columns the project defines.
 */
export interface BoardColumn {
  readonly id: string;
  readonly title: string;
  readonly tone: SemanticTone;
  /** Which canonical status a card takes on when it lands in this column. */
  readonly mapsTo: TaskStatus;
  /** Built-in columns cannot be deleted; custom ones can. */
  readonly custom: boolean;
}

export type TaskViewMode = 'board' | 'list' | 'gantt';

/** Smart views resolve to a predicate over the task list rather than a stored query. */
export type SmartViewId = 'my-tasks' | 'starred' | 'due-soon' | 'all';

/* ============================== Chat ============================== */

export type ConversationKind = 'direct' | 'group' | 'channel';

export type MessageBody =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'voice'; readonly durationSec: number; readonly waveform: readonly number[]; readonly src: string | null }
  | { readonly kind: 'file'; readonly attachment: Attachment; readonly caption: string | null }
  | { readonly kind: 'system'; readonly text: string };

export interface MessageReaction {
  readonly emoji: string;
  readonly userIds: readonly string[];
}

/** Provenance stamped onto a message that was forwarded out of another conversation. */
export interface ForwardOrigin {
  readonly authorId: string;
  /** Null when the source conversation is no longer visible to the current user. */
  readonly conversationId: string | null;
  readonly originalMessageId: string;
  readonly sentAt: string;
}

export interface Message {
  readonly id: string;
  readonly conversationId: string;
  readonly authorId: string;
  readonly sentAt: string;
  readonly body: MessageBody;
  readonly replyToId: string | null;
  readonly reactions: readonly MessageReaction[];
  readonly edited: boolean;
  /** Populated once the message has been promoted to a task. */
  readonly linkedTaskId: string | null;
  readonly readByIds: readonly string[];
  /** Pinned messages surface in the sticky banner at the top of the conversation. */
  readonly pinned: boolean;
  /** Non-null when this message was forwarded from elsewhere. */
  readonly forwardedFrom: ForwardOrigin | null;
}

/**
 * A place a message can be forwarded to. Boards are included because forwarding into a
 * project board creates a task rather than a message, which the reducer handles separately.
 */
export type ForwardTargetKind = 'direct' | 'channel' | 'board';

export interface ForwardTarget {
  readonly id: string;
  readonly kind: ForwardTargetKind;
  readonly title: string;
  readonly subtitle: string;
  readonly tone: AvatarTone;
  readonly initials: string;
}

export interface Conversation {
  readonly id: string;
  readonly kind: ConversationKind;
  readonly title: string;
  readonly memberIds: readonly string[];
  readonly pinned: boolean;
  readonly muted: boolean;
  readonly unreadCount: number;
  readonly tone: AvatarTone;
  readonly topic: string;
  /** Set on channels auto-created for a project, enabling the cross-module jump. */
  readonly projectId: string | null;
}

export type ChatFilterId = 'all' | 'direct' | 'groups' | 'unread';

/** Tabs of the shared-media drawer. */
export type SharedMediaTab = 'media' | 'docs' | 'voice' | 'links';

/** A URL extracted from a message body, with whatever metadata we can derive. */
export interface LinkPreview {
  readonly url: string;
  readonly host: string;
  readonly title: string;
  readonly messageId: string;
  readonly sharedAt: string;
  readonly sharedById: string;
}

/* ============================== Calendar & notes ============================== */

export type AgendaEntryKind = 'task' | 'meeting' | 'note' | 'reminder';

export interface AgendaEntry {
  readonly id: string;
  readonly kind: AgendaEntryKind;
  readonly title: string;
  readonly date: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly relatedTaskId: string | null;
  readonly tone: SemanticTone;
}

/* ============================== Activity feed ============================== */

export type ActivityKind =
  | 'task-assigned'
  | 'task-completed'
  | 'task-commented'
  | 'message-mention'
  | 'file-shared'
  | 'member-joined';

export interface ActivityItem {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly actorId: string;
  readonly createdAt: string;
  readonly targetTitle: string;
  readonly targetId: string;
  readonly context: string;
}

/* ============================== Theme ============================== */

export type ThemeMode = 'system' | 'light' | 'dark';

/** The resolved mode actually written to `data-theme`. */
export type ResolvedThemeMode = 'light' | 'dark';

export type AccentId = 'indigo' | 'teal' | 'violet' | 'amber';

export interface AccentDescriptor {
  readonly id: AccentId;
  readonly name: string;
  readonly subtitle: string;
  /** Preview swatch only — rendered as an inline style, never as a Tailwind class. */
  readonly swatch: readonly [string, string, string];
}

export interface ThemeConfig {
  readonly mode: ThemeMode;
  readonly accent: AccentId;
}

/* ============================== Navigation ============================== */

export type ModuleId = 'feed' | 'chats' | 'tasks' | 'calendar' | 'directory';

export interface ModuleDescriptor {
  readonly id: ModuleId;
  readonly label: string;
  readonly href: string;
}

/** Editable slice of the signed-in user's profile. */
export interface ProfileDraft {
  readonly fullName: string;
  readonly jobTitle: string;
  readonly initials: string;
  readonly avatarTone: AvatarTone;
  readonly presence: PresenceState;
}

/** A device/browser holding a live session, listed in the security dialog. */
export interface ActiveSession {
  readonly id: string;
  readonly device: string;
  readonly location: string;
  readonly lastActiveAt: string;
  readonly current: boolean;
}

/** What the right-hand inspector is currently bound to. */
export type InspectorTarget =
  | { readonly kind: 'none' }
  | { readonly kind: 'task'; readonly taskId: string }
  | { readonly kind: 'conversation'; readonly conversationId: string };

/** Draft handed to the project composer. */
export interface ProjectDraft {
  readonly name: string;
  readonly departmentId: DepartmentId;
  readonly color: AvatarTone;
  readonly memberIds: readonly string[];
  /** Spawns a linked chat channel named after the project. */
  readonly createGroup: boolean;
}

/** Draft handed to the task composer when promoting a chat message. */
export interface TaskDraft {
  readonly title: string;
  readonly description: string;
  readonly projectId: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assigneeIds: readonly string[];
  readonly dueDate: string | null;
  readonly sourceMessageId: string | null;
  readonly attachments: readonly Attachment[];
  /** Checklist built inside the composer before the task exists. */
  readonly subtasks: readonly Subtask[];
  readonly reminder: TaskReminder | null;
  readonly recurrence: TaskRecurrence | null;
}

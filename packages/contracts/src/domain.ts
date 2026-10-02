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
  /** Removed from the workspace: still named on what they wrote, shown as a former member. */
  readonly former?: boolean;
}

export type AvatarTone = 'brand' | 'teal' | 'violet' | 'amber' | 'rose' | 'slate';

/* ============================== Workspaces ============================== */

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Two-letter fallback shown when there is no uploaded icon. */
  readonly initials: string;
  readonly tone: AvatarTone;
  /** Uploaded icon as a data URL (kept client-side in this front end), or `null`. */
  readonly iconUrl: string | null;
  readonly plan: string;
  /** How many projects the plan allows; `null` (or absent) when it sets no limit. */
  readonly projectLimit?: number | null;
  readonly memberCount: number;
  /** The Owner — the only member who may delete the workspace. */
  readonly ownerId: string;
  /** Suspended by the platform's administrators: listed, but it cannot be opened. */
  readonly suspended?: boolean;
}

export interface WorkspaceDraft {
  readonly name: string;
  readonly description: string;
  readonly tone: AvatarTone;
  readonly iconUrl: string | null;
}

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

/** Agile tracking: what kind of work a task is. Every task that predates it is a `task`. */
export type IssueType = 'task' | 'bug' | 'feature';

/** How badly a bug hurts; set on bugs only. */
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

/** `A blocks B` and `B blocked_by A` are the same edge; `relates_to` never blocks. */
export type TaskDependencyType = 'blocks' | 'blocked_by' | 'relates_to';

export type SemanticTone = 'done' | 'progress' | 'blocked' | 'todo' | 'review';

export interface Subtask {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
  readonly assigneeId: string | null;
}

export type AttachmentKind = 'image' | 'video' | 'document' | 'sheet' | 'archive' | 'audio' | 'link';

export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly kind: AttachmentKind;
  /** Bytes. Formatted for display by `formatFileSize`. */
  readonly size: number;
  readonly uploadedAt: string;
  readonly uploadedById: string;
  /** Where the bytes live once uploaded; `null` for fixtures, which ship no binaries. */
  readonly url: string | null;
}

export interface TaskSourceRef {
  readonly accessible: boolean;
  readonly conversationId: string | null;
  readonly authorId: string | null;
  readonly excerpt: string | null;
  readonly deleted: boolean;
}

export interface TaskComment {
  readonly id: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: string;
  readonly replyToId: string | null;
}

export interface Task {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
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
  /**
   * Where that message is, for the "پیام مبدأ" link, when the server said (the message itself may
   * not be loaded). `accessible` is false for people outside its conversation.
   */
  readonly sourceMessage?: TaskSourceRef;
  /**
   * Custom board column the card sits in. `null` places it in the built-in column for its
   * `status`, which is where every seeded task starts.
   */
  readonly boardColumnId: string | null;
  /**
   * Where the task was when it last entered "done", so the quick-complete checkbox can put it
   * back on uncheck. `null` whenever the task is not done, or was created done.
   */
  readonly reopenTo: TaskPlacement | null;
  /**
   * Counts from a list page, set while the arrays above are not loaded yet (a card knows how many
   * subtasks it has before its detail is fetched). Absent when the arrays are complete.
   */
  readonly summary?: TaskSummary;
  /*
   * Agile tracking. Optional so tasks written before it (fixtures, drafts) stay valid: absent
   * means a plain `task` on the board with no estimate, no time logged and no blockers.
   */
  readonly type?: IssueType;
  /** Bugs only. */
  readonly severity?: IssueSeverity | null;
  readonly estimatedMinutes?: number | null;
  /** Total of the task's worklogs, in minutes. */
  readonly spentMinutes?: number;
  /** In the backlog: left off the board (and its list and Gantt views) until moved back. */
  readonly isBacklog?: boolean;
  /** Tasks that block this one; it is blocked while any of them is not done. */
  readonly blockedByIds?: readonly string[];
}

/** One stretch of logged work on a task. */
export interface Worklog {
  readonly id: string;
  readonly userId: string;
  readonly minutes: number;
  readonly note: string;
  readonly loggedAt: string;
}

/** A dependency as seen from one of its two tasks. */
export interface TaskLink {
  readonly id: string;
  /** From this task's side: `blocks` means this task blocks `taskId`. */
  readonly kind: TaskDependencyType;
  readonly taskId: string;
  /** The other task's code and title when known (it may not be loaded). */
  readonly code: string;
  readonly title: string;
  readonly status: TaskStatus;
}

export interface TaskSummary {
  readonly subtasks: number;
  readonly subtasksDone: number;
  readonly comments: number;
  readonly attachments: number;
}

/** A task's position on the board: its workflow status plus an optional custom column. */
export interface TaskPlacement {
  readonly status: TaskStatus;
  readonly boardColumnId: string | null;
}

/**
 * Fixed accent set shared by user-defined surfaces — custom board columns and note colour
 * tags. Unlike the brand ramp these never move with the workspace accent, so a "red" column
 * stays red whichever palette the organisation picks.
 */
export type TagTone = 'gray' | 'blue' | 'teal' | 'green' | 'amber' | 'red' | 'pink' | 'violet';

export interface BoardColumn {
  readonly id: string;
  readonly title: string;
  /** Workflow status a task takes when it lands in this column. */
  readonly status: TaskStatus;
  /** Custom columns paint with a picked tag tone; built-ins (`null`) use their status tone. */
  readonly tone: TagTone | null;
  readonly custom: boolean;
  /**
   * The project whose board this column is on: every project has columns of its own. Absent on
   * the four status columns that views across projects («همه وظایف») group tasks by.
   */
  readonly projectId?: string;
}

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly departmentId: DepartmentId;
  readonly color: AvatarTone;
  readonly starred: boolean;
  /** Always `null`: projects are flat (Phase 3.1). */
  readonly parentId: string | null;
  readonly memberIds: readonly string[];
}

export type TaskViewMode = 'board' | 'list' | 'gantt' | 'backlog';

/** Smart views resolve to a predicate over the task list rather than a stored query. */
export type SmartViewId = 'my-tasks' | 'starred' | 'due-soon' | 'all';

/* ============================== Chat ============================== */

export type ConversationKind = 'direct' | 'group' | 'channel';

export type MessageBody =
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'voice';
      readonly durationSec: number;
      readonly waveform: readonly number[];
      readonly src: string | null;
      /** The stored recording, when it lives on the server (the player asks for a link). */
      readonly attachmentId?: string;
    }
  | {
      readonly kind: 'file';
      readonly attachment: Attachment;
      readonly caption: string | null;
      /** A picture sent as a document: a download card, never shown inline as a photo. */
      readonly asFile?: boolean;
    }
  | { readonly kind: 'system'; readonly text: string };

export interface MessageReaction {
  readonly emoji: string;
  readonly userIds: readonly string[];
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
  /** The sender's own copy of a message that did not reach the server; it can be sent again. */
  readonly failed?: boolean;
  /** The author's out-of-office answer (Phase 3.2), posted for them outside their working hours. */
  readonly autoReply?: boolean;
}

/** A message waiting for `scheduledAt` (Phase 3.2). Until it is sent, only its author sees it. */
export interface ScheduledMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly authorId: string;
  readonly text: string;
  readonly replyToId: string | null;
  /** An ISO instant. */
  readonly scheduledAt: string;
  /** The file it will send, by name (schedules made through the API can carry one). */
  readonly attachmentName?: string | null;
  /** Live: the client id its message will carry, so the sent message can be matched to it. */
  readonly clientMsgId?: string;
}

/** Working days, in the order the week starts in Iran. */
export type WorkDay = 'saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';

/**
 * A member's working hours in a workspace and their out-of-office auto-reply (Phase 3.2): outside
 * these hours a direct message is answered with `message`, once a day per person.
 */
export interface WorkingHours {
  readonly autoReplyEnabled: boolean;
  /** None: away all week (on leave). */
  readonly days: readonly WorkDay[];
  /** `HH:mm`; an end before the start runs past midnight. */
  readonly start: string;
  readonly end: string;
  readonly message: string;
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
  /** A project's own channel: its members follow the project's (added and removed there). */
  readonly projectId?: string | null;
}

export type ChatFilterId = 'all' | 'direct' | 'groups' | 'unread';

/* ============================== Calendar ============================== */

/**
 * Scheduled items that are not tasks. Task deadlines are never stored here: the calendar
 * derives them from the live task list, so completing or rescheduling a task moves its
 * calendar badge with no second source of truth to keep in sync.
 */
export type CalendarEventKind = 'meeting' | 'reminder' | 'milestone';

export interface CalendarEvent {
  readonly id: string;
  readonly kind: CalendarEventKind;
  readonly title: string;
  /** Local `YYYY-MM-DD`; rendered as Jalali. */
  readonly date: string;
  /** 24-hour `HH:mm` in ASCII digits; rendered with Persian digits. */
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly projectId: string | null;
  readonly attendeeIds: readonly string[];
  readonly description: string;
}

export interface CalendarEventDraft {
  readonly kind: CalendarEventKind;
  readonly title: string;
  readonly date: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly projectId: string | null;
  readonly attendeeIds: readonly string[];
  readonly description: string;
}

/* ============================== Notes ============================== */

/**
 * A note category ("دفترچه"). The four built-ins ship with every workspace and teams add their
 * own; any of them can be deleted, and its notes stay, filed in no notebook.
 */
export interface NoteCategory {
  readonly id: string;
  readonly label: string;
  readonly builtIn: boolean;
}

export interface Note {
  readonly id: string;
  /** `null`: filed in no notebook (its notebook was deleted); it still shows under «همه یادداشت‌ها». */
  readonly categoryId: string | null;
  readonly title: string;
  /** Markdown subset: headings, emphasis, bullet lists and `- [ ]` checklists. */
  readonly body: string;
  readonly colors: readonly TagTone[];
  readonly pinned: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Set once the note has been promoted with "تبدیل یادداشت به وظیفه". */
  readonly linkedTaskId: string | null;
}

export interface NotePatch {
  readonly title?: string;
  readonly body?: string;
  readonly categoryId?: string | null;
  readonly colors?: readonly TagTone[];
  readonly pinned?: boolean;
}

/* ============================== Notifications ============================== */

/** What happened. Mentions and replies are the two kinds the "اشاره‌ها" tab collects. */
export type NotificationEvent =
  | { readonly kind: 'task-assigned' }
  | { readonly kind: 'status-changed'; readonly from: TaskStatus; readonly to: TaskStatus }
  | { readonly kind: 'comment'; readonly excerpt: string }
  | { readonly kind: 'mention'; readonly excerpt: string }
  | { readonly kind: 'reply'; readonly excerpt: string };

export type NotificationTarget =
  | { readonly kind: 'task'; readonly taskId: string }
  | { readonly kind: 'conversation'; readonly conversationId: string };

export interface AppNotification {
  readonly id: string;
  readonly actorId: string;
  readonly createdAt: string;
  readonly read: boolean;
  readonly event: NotificationEvent;
  /** Title of the task or conversation the event happened in. */
  readonly subject: string;
  readonly target: NotificationTarget;
}

export type NotificationFilterId = 'all' | 'unread' | 'mentions';

/* ============================== Account & security ============================== */

/** How an invitation reaches its recipient: by email, or by SMS to an Iranian mobile number. */
export type InvitationChannel = 'email' | 'sms';

export interface InvitationRecipient {
  /** A lower-cased email address, or a mobile number normalised to `09xxxxxxxxx`. */
  readonly address: string;
  readonly channel: InvitationChannel;
}

export interface Invitation extends InvitationRecipient {
  readonly id: string;
  readonly role: RoleId;
  readonly department: DepartmentId;
  readonly message: string;
  readonly invitedAt: string;
  readonly invitedById: string;
}

export interface LoginSession {
  readonly id: string;
  readonly device: string;
  readonly location: string;
  readonly lastActiveAt: string;
  /** The browser this app is running in — it cannot revoke itself from the list. */
  readonly current: boolean;
}

/** The parts of the signed-in member's profile they can change themselves. */
export interface ProfileSettings {
  readonly presence: PresenceState;
  readonly statusMessage: string;
}

export type SessionStatus = 'active' | 'signed-out';

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

export type AccentId = 'indigo' | 'teal' | 'violet' | 'rose' | 'amber' | 'ocean';

export interface AccentDescriptor {
  readonly id: AccentId;
  readonly name: string;
  readonly subtitle: string;
  /** Preview swatch only — rendered as an inline style, never as a Tailwind class. */
  readonly swatch: readonly [string, string, string];
  /** The palette's 600 step, shown as the hex a brand team would recognise. */
  readonly primaryHex: string;
}

export interface ThemeConfig {
  readonly mode: ThemeMode;
  readonly accent: AccentId;
}

/* ============================== Navigation ============================== */

export type ModuleId = 'feed' | 'chats' | 'tasks' | 'calendar' | 'notes' | 'directory';

export interface ModuleDescriptor {
  readonly id: ModuleId;
  readonly label: string;
  readonly href: string;
}

/** What the right-hand inspector is currently bound to. */
export type InspectorTarget =
  | { readonly kind: 'none' }
  | { readonly kind: 'task'; readonly taskId: string }
  | { readonly kind: 'conversation'; readonly conversationId: string };

/** Draft handed to the task composer, blank or pre-filled from a message, note or date. */
export interface TaskDraft {
  readonly title: string;
  readonly description: string;
  readonly projectId: string;
  readonly status: TaskStatus;
  /** Custom board column to land in; `null` means the built-in column for `status`. */
  readonly boardColumnId: string | null;
  readonly priority: TaskPriority;
  readonly assigneeIds: readonly string[];
  readonly dueDate: string | null;
  readonly sourceMessageId: string | null;
  readonly sourceNoteId: string | null;
  /** Checklist items carried over from a note; each becomes a subtask. */
  readonly subtaskTitles: readonly string[];
  readonly attachments: readonly Attachment[];
  /** Agile tracking; absent means a plain task on the board. */
  readonly type?: IssueType;
  readonly severity?: IssueSeverity | null;
  readonly isBacklog?: boolean;
}

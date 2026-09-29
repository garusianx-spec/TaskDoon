import type { ActivityKind, CalendarEventKind, TagTone, TaskPriority, TaskStatus } from '../domain.js';
import type { AttachmentView, TaskDetail } from './work.js';

/* ============================== Files ============================== */

export interface CreateUploadBody {
  /** As the user named it; bidi control characters are stripped. */
  readonly fileName: string;
  /** Exact size in bytes; the storage policy refuses anything larger. */
  readonly size: number;
  /** What the browser claims. The bytes are sniffed on completion and must agree. */
  readonly contentType: string;
}

/**
 * How the browser sends the bytes: one presigned POST up to 16 MB, or presigned parts of a
 * multipart upload above that (each part but the last exactly `partSize` bytes).
 */
export type UploadPlan =
  | { readonly kind: 'post'; readonly url: string; readonly fields: Readonly<Record<string, string>> }
  | { readonly kind: 'multipart'; readonly partSize: number; readonly parts: readonly { readonly partNumber: number; readonly url: string }[] };

export interface UploadView {
  readonly attachment: AttachmentView;
  readonly plan: UploadPlan;
  readonly expiresInSeconds: number;
}

export interface CompleteUploadBody {
  /** Multipart uploads only: the ETag S3 returned for each part. */
  readonly parts?: readonly { readonly partNumber: number; readonly etag: string }[];
}

/* ============================== Notes ============================== */

export interface NoteCategoryView {
  readonly id: string;
  /** `personal`, `work`, `ideas` or `meetings` for the four built-ins, else `null`. */
  readonly key: string | null;
  readonly label: string;
  readonly builtIn: boolean;
  readonly position: number;
  readonly noteCount: number;
}

export interface CreateNoteCategoryBody {
  readonly label: string;
}

export interface UpdateNoteCategoryBody {
  readonly label?: string;
  readonly position?: number;
}

export interface NoteView {
  readonly id: string;
  /** `null` when the note's notebook was deleted: the note is kept, without a category. */
  readonly categoryId: string | null;
  readonly title: string;
  readonly body: string;
  readonly colors: readonly TagTone[];
  readonly pinned: boolean;
  readonly linkedTaskId: string | null;
  /** Echo as `If-Match` when saving. */
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NotePage {
  readonly items: readonly NoteView[];
  readonly nextCursor: string | null;
}

export interface CreateNoteBody {
  /** Defaults to the `personal` category while it exists; `null` files the note nowhere. */
  readonly categoryId?: string | null;
  readonly title?: string;
  readonly body?: string;
  readonly colors?: readonly TagTone[];
  readonly pinned?: boolean;
}

export interface UpdateNoteBody {
  /** `null` takes the note out of every notebook. */
  readonly categoryId?: string | null;
  readonly title?: string;
  readonly body?: string;
  readonly colors?: readonly TagTone[];
  readonly pinned?: boolean;
}

/** "تبدیل یادداشت به وظیفه": open checklist items become subtasks. */
export interface ConvertNoteBody {
  readonly projectId: string;
  readonly columnId?: string | null;
  readonly priority?: TaskPriority;
  readonly assigneeIds?: readonly string[];
  readonly dueDate?: string | null;
}

export interface ConvertNoteResult {
  readonly task: TaskDetail;
  /** `true` when the note had already been converted; the existing task is returned. */
  readonly existing: boolean;
}

/* ============================== Calendar ============================== */

export interface CalendarEventView {
  readonly id: string;
  readonly kind: CalendarEventKind;
  readonly title: string;
  readonly description: string;
  /** `YYYY-MM-DD` in the workspace time zone. */
  readonly date: string;
  /** Last day of a multi-day all-day event, else `null`. */
  readonly endDate: string | null;
  /** `HH:mm` in the workspace time zone; `null` for all-day events and milestones. */
  readonly startTime: string | null;
  readonly endTime: string | null;
  /** The instant, for timed events. */
  readonly startsAt: string | null;
  readonly projectId: string | null;
  readonly attendeeIds: readonly string[];
  readonly createdById: string;
  readonly version: number;
}

/** A task deadline shown on the calendar; derived from the task, never stored twice. */
export interface DeadlineView {
  readonly taskId: string;
  readonly code: string;
  readonly title: string;
  readonly dueDate: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly projectId: string;
}

export interface CalendarView {
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
  readonly events: readonly CalendarEventView[];
  readonly deadlines: readonly DeadlineView[];
}

export interface CreateCalendarEventBody {
  readonly kind: CalendarEventKind;
  readonly title: string;
  readonly description?: string;
  readonly date: string;
  readonly endDate?: string | null;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  /** Project events follow the project's permissions; personal ones are yours and your attendees'. */
  readonly projectId?: string | null;
  readonly attendeeIds?: readonly string[];
}

export interface UpdateCalendarEventBody {
  readonly kind?: CalendarEventKind;
  readonly title?: string;
  readonly description?: string;
  readonly date?: string;
  readonly endDate?: string | null;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly attendeeIds?: readonly string[];
}

/* ============================== Notifications & activity ============================== */

export type NotificationKind =
  | 'task-assigned'
  | 'status-changed'
  | 'comment'
  | 'mention'
  | 'reply'
  | 'invitation'
  | 'event-reminder'
  | 'member-joined';

export type NotificationTargetType = 'task' | 'conversation' | 'message' | 'event' | 'workspace';

export interface NotificationView {
  readonly id: string;
  readonly workspaceId: string;
  readonly kind: NotificationKind;
  readonly actorId: string | null;
  /** Title of the task, event or conversation when it happened. */
  readonly subject: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly targetType: NotificationTargetType;
  readonly targetId: string;
  readonly read: boolean;
  readonly createdAt: string;
}

export type NotificationFilter = 'all' | 'unread' | 'mentions';

export interface NotificationPage {
  readonly items: readonly NotificationView[];
  readonly nextCursor: string | null;
  /** Unread across the inbox (or the one workspace asked for). */
  readonly unreadCount: number;
}

export interface MarkNotificationsReadBody {
  readonly ids?: readonly string[];
  /** Marks everything unread as read, optionally only in `workspaceId`. */
  readonly all?: boolean;
  readonly workspaceId?: string;
}

export interface ActivityView {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly actorId: string | null;
  readonly targetType: NotificationTargetType;
  readonly targetId: string;
  readonly targetTitle: string;
  readonly context: string;
  readonly projectId: string | null;
  readonly createdAt: string;
}

export interface ActivityPage {
  readonly items: readonly ActivityView[];
  readonly nextCursor: string | null;
}

/* ============================== Reports ============================== */

export interface JalaliMonthCount {
  /** 1 (Farvardin) to 12 (Esfand). */
  readonly month: number;
  readonly name: string;
  readonly created: number;
  readonly completed: number;
}

/** Tasks created and completed per Jalali month, counted by the workspace-zone date. */
export interface MonthlyTaskReport {
  readonly jalaliYear: number;
  readonly timeZone: string;
  readonly months: readonly JalaliMonthCount[];
}

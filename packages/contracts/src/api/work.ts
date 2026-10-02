import type {
  AttachmentKind,
  AvatarTone,
  IssueSeverity,
  IssueType,
  PermissionActionId,
  SmartViewId,
  TagTone,
  TaskDependencyType,
  TaskPriority,
  TaskStatus,
} from '../domain.js';

/* ============================== Projects ============================== */

/**
 * A member's role inside one project. It replaces their workspace role there: `lead` may do
 * everything, `contributor` view, create, edit and assign, `viewer` only look. Guests are capped
 * at `contributor`.
 */
export type ProjectRole = 'lead' | 'contributor' | 'viewer';

/** `private` projects are invisible to anyone who is not a member (the owner excepted). */
export type ProjectVisibility = 'workspace' | 'private';

export interface ProjectView {
  readonly id: string;
  /** Upper-case prefix of task codes, e.g. `CRM` in `CRM-104`. */
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly departmentId: string | null;
  readonly color: AvatarTone;
  /** Always `null`: projects are flat (Phase 3.1). Kept so older clients still read the view. */
  readonly parentId: string | null;
  readonly visibility: ProjectVisibility;
  readonly archived: boolean;
  /** Per user: each member stars their own projects. */
  readonly starred: boolean;
  /** `null` when the caller reaches the project through their workspace role. */
  readonly myRole: ProjectRole | null;
  /** What the caller may do with the project's tasks; the UI gates its controls with it. */
  readonly myActions: readonly PermissionActionId[];
  readonly memberIds: readonly string[];
  readonly taskCount: number;
  readonly openTaskCount: number;
  readonly createdAt: string;
}

export interface CreateProjectBody {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly departmentId?: string | null;
  readonly color?: AvatarTone;
  readonly visibility?: ProjectVisibility;
  /**
   * Members besides the creator (who leads it), as contributors. The project's chat channel
   * starts with all of them.
   */
  readonly memberIds?: readonly string[];
}

export interface UpdateProjectBody {
  readonly name?: string;
  readonly description?: string;
  readonly departmentId?: string | null;
  readonly color?: AvatarTone;
  readonly visibility?: ProjectVisibility;
  readonly archived?: boolean;
}

/**
 * A project in the trash: deleted by the workspace owner, hidden everywhere, and restorable until
 * `purgeAt` (40 days after deletion), when it and its tasks are removed for good.
 */
export interface TrashedProjectView {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly color: AvatarTone;
  readonly departmentId: string | null;
  readonly taskCount: number;
  readonly deletedAt: string;
  readonly deletedBy: string | null;
  readonly purgeAt: string;
}

export interface ProjectMemberView {
  readonly userId: string;
  readonly role: ProjectRole;
  readonly addedAt: string;
}

export interface PutProjectMemberBody {
  readonly role: ProjectRole;
}

/* ============================== Board ============================== */

export interface ColumnView {
  readonly id: string;
  readonly title: string;
  /** The status a card takes when it lands here. */
  readonly status: TaskStatus;
  /** Custom columns paint with a tag tone; built-ins (`null`) use their status tone. */
  readonly tone: TagTone | null;
  readonly builtIn: boolean;
  /** Fractional index; columns sort by it, start to end. */
  readonly position: string;
}

/** A project's board columns: every project has a workflow of its own. */
export interface WorkflowView {
  readonly id: string;
  /** The project the workflow belongs to. */
  readonly projectId: string;
  /** Bumped by every column change; a board is stale when its version is older. */
  readonly version: number;
  readonly columns: readonly ColumnView[];
}

export interface CreateColumnBody {
  /** The project whose board gets the column; no other project's board changes. */
  readonly projectId: string;
  readonly title: string;
  readonly tone?: TagTone | null;
  /** Defaults to `in-progress`, the status of the stages between picked up and finished. */
  readonly status?: TaskStatus;
  /** Insert after this column; omitted or `null` appends at the end. */
  readonly afterColumnId?: string | null;
}

export interface UpdateColumnBody {
  readonly title?: string;
  readonly tone?: TagTone | null;
  /** Moves the column: after this one, or first when `null`. Omit to leave it in place. */
  readonly afterColumnId?: string | null;
}

/** What happens to the cards of a column being deleted. */
export type ColumnDisposition =
  | { readonly kind: 'migrate'; readonly targetColumnId: string }
  | { readonly kind: 'archive' };

export interface DeleteColumnBody {
  /** Required unless the column is empty. */
  readonly disposition?: ColumnDisposition;
}

/* ============================== Tasks ============================== */

/** One card: enough for the board, lists, "my tasks" and the Gantt chart. */
export interface TaskCard {
  readonly id: string;
  /** `project.key-number`, e.g. `CRM-104`. */
  readonly code: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly columnId: string;
  readonly position: string;
  readonly assigneeIds: readonly string[];
  readonly reviewerId: string | null;
  /** `YYYY-MM-DD` in the workspace time zone. */
  readonly startDate: string;
  readonly dueDate: string | null;
  readonly labelIds: readonly string[];
  readonly starred: boolean;
  readonly subtaskCount: number;
  readonly subtaskDoneCount: number;
  readonly commentCount: number;
  readonly attachmentCount: number;
  readonly completedAt: string | null;
  readonly archived: boolean;
  readonly sourceMessageId: string | null;
  readonly sourceNoteId: string | null;
  /** Echo as `If-Match` (or `expectedVersion`) when changing the task. */
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Agile tracking: `task` for everything created before it. */
  readonly type: IssueType;
  /** Bugs only; `null` otherwise. */
  readonly severity: IssueSeverity | null;
  readonly estimatedMinutes: number | null;
  /** The sum of the task's worklogs. */
  readonly spentMinutes: number;
  /** Backlog items are left off the board until moved back (`isBacklog: false`). */
  readonly isBacklog: boolean;
  /**
   * Live, unarchived tasks that block this one, whatever their status: the task is blocked while
   * any of them is not done (clients compare with the statuses they hold).
   */
  readonly blockedByIds: readonly string[];
}

export interface SubtaskView {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
  readonly assigneeId: string | null;
  readonly position: string;
}

export interface TaskCommentView {
  readonly id: string;
  readonly authorId: string;
  readonly body: string;
  readonly replyToId: string | null;
  readonly createdAt: string;
  readonly editedAt: string | null;
}

export type AttachmentStatus = 'pending' | 'scanning' | 'ready' | 'rejected' | 'deleted';

export type FileKind = Exclude<AttachmentKind, 'link'>;

export interface AttachmentView {
  readonly id: string;
  readonly name: string;
  readonly kind: FileKind;
  /** Sniffed from the bytes, never taken from the client. */
  readonly mimeType: string;
  readonly size: number;
  readonly status: AttachmentStatus;
  readonly uploadedById: string;
  readonly uploadedAt: string;
}

/**
 * A short-lived link to a file's bytes. `attachment` always downloads; `inline` (images, audio
 * and video only) lets the browser show or play it. Other kinds are served as `attachment`.
 */
export interface FileLink {
  readonly url: string;
  readonly disposition: 'attachment' | 'inline';
  readonly expiresAt: string;
}

/** One entry of a task's timeline. */
export interface TaskEventView {
  readonly id: string;
  readonly actorId: string | null;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

/**
 * The chat message a task was made from. Everyone who can see the task learns that it came from a
 * message; only members of that conversation get where it is and what it said.
 */
export interface TaskSourceMessage {
  readonly messageId: string;
  /** `false` when the caller cannot see the conversation: the fields below are then `null`. */
  readonly accessible: boolean;
  readonly conversationId: string | null;
  readonly authorId: string | null;
  /** The message's text, cut to 140 characters; `null` for a file or voice note, or once deleted. */
  readonly excerpt: string | null;
  readonly kind: 'text' | 'voice' | 'file' | 'system' | null;
  readonly sentAt: string | null;
  readonly deleted: boolean;
}

export interface TaskDetail extends TaskCard {
  readonly description: string;
  readonly createdById: string;
  /** Where "reopen" puts the task back, while it is done. */
  readonly reopenColumnId: string | null;
  readonly subtasks: readonly SubtaskView[];
  readonly comments: readonly TaskCommentView[];
  readonly attachments: readonly AttachmentView[];
  /** The latest 50 timeline entries, newest first. */
  readonly timeline: readonly TaskEventView[];
  readonly myActions: readonly PermissionActionId[];
  /** Set when the task was converted from a chat message (`sourceMessageId`). */
  readonly sourceMessage: TaskSourceMessage | null;
}

export interface BoardView {
  readonly workflowId: string;
  readonly workflowVersion: number;
  readonly columns: readonly ColumnView[];
  /** Every live, unarchived task of the project (and its sub-projects) the caller can see. */
  readonly tasks: readonly TaskCard[];
}

export type SmartView = SmartViewId;

export interface TaskPage {
  readonly items: readonly TaskCard[];
  /** Opaque; pass back as `cursor` for the next page, `null` at the end. */
  readonly nextCursor: string | null;
}

export interface CreateTaskBody {
  readonly projectId: string;
  readonly title: string;
  readonly description?: string;
  /** A column of the workflow; defaults to the first column with `status` (default `todo`). */
  readonly columnId?: string | null;
  readonly status?: TaskStatus;
  readonly priority?: TaskPriority;
  readonly assigneeIds?: readonly string[];
  readonly reviewerId?: string | null;
  /** Defaults to today in the workspace time zone. */
  readonly startDate?: string;
  readonly dueDate?: string | null;
  readonly labelIds?: readonly string[];
  /** Subtask titles, in order. */
  readonly subtasks?: readonly string[];
  /** Ready files the caller uploaded, linked to the new task. */
  readonly attachmentIds?: readonly string[];
  /** Defaults to `task`. */
  readonly type?: IssueType;
  /** Bugs only. */
  readonly severity?: IssueSeverity | null;
  readonly estimatedMinutes?: number | null;
  /** Create straight into the backlog (default `false`). */
  readonly isBacklog?: boolean;
}

export interface UpdateTaskBody {
  readonly title?: string;
  readonly description?: string;
  readonly priority?: TaskPriority;
  readonly startDate?: string;
  readonly dueDate?: string | null;
  /** Assignees, reviewer and moves need the `assign` permission; the rest need `edit`. */
  readonly reviewerId?: string | null;
  readonly assigneeIds?: readonly string[];
  readonly labelIds?: readonly string[];
  /** Changing away from `bug` clears the severity. */
  readonly type?: IssueType;
  readonly severity?: IssueSeverity | null;
  readonly estimatedMinutes?: number | null;
  /** Moves the task to (`true`) or back from (`false`) the backlog; needs `assign`, like a move. */
  readonly isBacklog?: boolean;
}

export interface MoveTaskBody {
  readonly columnId: string;
  /** The card that should end up just before this one; omit both to append at the end. */
  readonly afterId?: string | null;
  /** The card that should end up just after this one. */
  readonly beforeId?: string | null;
  readonly expectedVersion: number;
}

export interface CompleteTaskBody {
  readonly completed: boolean;
  readonly expectedVersion?: number;
}

export interface CreateSubtaskBody {
  readonly title: string;
  readonly assigneeId?: string | null;
}

/**
 * Reorders a subtask among its siblings, like a card on the board: name the subtask that should
 * end up just before it, or just after it, or both. Omit both to move it to the end.
 */
export interface MoveSubtaskBody {
  readonly afterId?: string | null;
  readonly beforeId?: string | null;
}

export interface UpdateSubtaskBody {
  readonly title?: string;
  readonly done?: boolean;
  readonly assigneeId?: string | null;
}

export interface CreateCommentBody {
  readonly body: string;
  readonly replyToId?: string | null;
}

export interface UpdateCommentBody {
  readonly body: string;
}

export interface AttachFileBody {
  readonly attachmentId: string;
}

export interface LabelView {
  readonly id: string;
  readonly name: string;
  readonly tone: TagTone;
}

export interface CreateLabelBody {
  readonly name: string;
  readonly tone?: TagTone;
}

/**
 * What a chat member may learn about a linked task. Without access to its project they see the
 * code only; the title and status stay hidden.
 */
export interface TaskPreview {
  readonly id: string;
  readonly code: string;
  readonly accessible: boolean;
  readonly title: string | null;
  readonly status: TaskStatus | null;
  readonly projectId: string | null;
}

/* ============================== Agile tracking ============================== */

/** One stretch of logged work. */
export interface WorklogView {
  readonly id: string;
  readonly taskId: string;
  readonly userId: string;
  readonly durationMinutes: number;
  readonly description: string;
  readonly loggedAt: string;
  readonly createdAt: string;
}

export interface WorklogList {
  /** Newest first (by `loggedAt`), at most 500. */
  readonly items: readonly WorklogView[];
  /** Every worklog of the task, not only the listed ones. */
  readonly totalMinutes: number;
  readonly estimatedMinutes: number | null;
}

export interface CreateWorklogBody {
  /** 1 to 1440 (one day). */
  readonly durationMinutes: number;
  readonly description?: string;
  /** When the work happened; defaults to now. */
  readonly loggedAt?: string;
}

/** The other end of a link, as far as the caller may see it. */
export interface LinkedTaskView {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly status: TaskStatus;
}

export interface TaskDependencyView {
  readonly id: string;
  /** From the requested task's side: `blocks` means it blocks `task`. */
  readonly type: TaskDependencyType;
  readonly task: LinkedTaskView;
  readonly createdAt: string;
}

export interface CreateDependencyBody {
  /** Another task of the same project. */
  readonly targetTaskId: string;
  /** How the task in the path relates to the target: `blocks` means it blocks the target. */
  readonly type: TaskDependencyType;
}

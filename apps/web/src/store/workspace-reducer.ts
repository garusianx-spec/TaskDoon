import type {
  ActivityItem,
  Attachment,
  AppNotification,
  AvatarTone,
  BoardColumn,
  CalendarEvent,
  CalendarEventDraft,
  ChatFilterId,
  Conversation,
  DepartmentId,
  InspectorTarget,
  Invitation,
  InvitationRecipient,
  LoginSession,
  Message,
  Note,
  NoteCategory,
  NotePatch,
  PermissionActionId,
  PermissionMatrix,
  PermissionModuleId,
  PresenceState,
  ProfileSettings,
  Project,
  RoleId,
  ScheduledMessage,
  SessionStatus,
  SmartViewId,
  TagTone,
  Task,
  TaskDraft,
  TaskPlacement,
  TaskStatus,
  TaskViewMode,
  User,
  Workspace,
  WorkspaceDraft,
  WorkingHours,
} from '@taskin/contracts';
import {
  BUILT_IN_COLUMNS,
  builtInColumnsFor,
  CUSTOM_COLUMN_STATUS,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  statusLabel,
} from '@/data/reference';
import { toPersianDigits } from '@taskin/jalali';
import { attachmentKindOf } from '@/lib/attachments';
import { AUTO_REPLY_WINDOW_MS, isWorkingTime } from '@/lib/working-hours';
import { columnForTask, projectColumns } from './selectors';
import { nextLocalId as nextId } from './ids';
import { INITIAL_WORKSPACE_STATE } from './initial-state';
import { EMPTY_SCOPE, scopeOf, type WorkspaceScope } from './workspace-scope';
import { monogram } from '@taskin/text';

export interface WorkspaceState {
  readonly session: SessionStatus;
  /** The signed-in member. */
  readonly meId: string;
  /** Everyone in the active workspace (the directory), and its projects. */
  readonly users: readonly User[];
  readonly projects: readonly Project[];
  /**
   * People removed from the workspace (Phase 3.1): out of the directory and every picker, yet still
   * named — as former members — on the messages, tasks and activity they left behind.
   */
  readonly formerUsers: readonly User[];
  /** Deleted projects, restorable by the workspace owner until `purgeAt` (40 days). */
  readonly projectTrash: readonly TrashedProject[];
  /** Who is typing where right now; cleared by the server's stop or after a few seconds. */
  readonly typingByConversation: Readonly<Record<string, readonly string[]>>;
  /** A message to scroll to and highlight once its conversation is on screen (the task's «پیام مبدأ»). */
  readonly focusedMessageId: string | null;
  readonly workspaces: readonly Workspace[];
  readonly activeWorkspaceId: string;
  /** Scoped data of the workspaces not on screen, restored when switched back to. */
  readonly parkedWorkspaces: Readonly<Record<string, WorkspaceScope>>;
  readonly activity: readonly ActivityItem[];
  readonly tasks: readonly Task[];
  /** Cards archived when their column was deleted. Out of every view; kept, not destroyed. */
  readonly archivedTasks: readonly Task[];
  readonly boardColumns: readonly BoardColumn[];
  readonly conversations: readonly Conversation[];
  readonly messages: readonly Message[];
  readonly calendarEvents: readonly CalendarEvent[];
  /** Date the calendar should open on after an event is created elsewhere; cleared on read. */
  readonly calendarFocusDate: string | null;
  readonly notes: readonly Note[];
  readonly noteCategories: readonly NoteCategory[];
  readonly notifications: readonly AppNotification[];
  readonly invitations: readonly Invitation[];
  readonly loginSessions: readonly LoginSession[];
  readonly twoFactorEnabled: boolean;
  readonly passwordChangedAt: string;
  readonly profile: ProfileSettings;
  readonly permissions: PermissionMatrix;
  readonly pinnedConversationIds: readonly string[];
  readonly mutedConversationIds: readonly string[];
  readonly unreadByConversation: Readonly<Record<string, number>>;
  readonly activeConversationId: string;
  readonly inspector: InspectorTarget;
  readonly taskView: TaskViewMode;
  readonly chatFilter: ChatFilterId;
  readonly smartView: SmartViewId;
  readonly projectFilterId: string | null;
  readonly chatSearch: string;
  readonly taskSearch: string;
  /** Text pushed to the shell's `aria-live` region after a non-visual state change. */
  readonly announcement: string;
  /** This member's messages waiting to be sent, soonest first (Phase 3.2). Nobody else sees them. */
  readonly scheduledMessages: readonly ScheduledMessage[];
  /** This member's working hours and out-of-office auto-reply in the active workspace. */
  readonly workingHours: WorkingHours;
  /**
   * Demo only: teammates' working hours, so that a direct message to one who is away gets their
   * auto-reply, and when each of them last answered whom (`responderId:senderId`). The live app
   * answers on the server.
   */
  readonly teammateHours: Readonly<Record<string, WorkingHours>>;
  readonly autoRepliedAt: Readonly<Record<string, string>>;
}

export type WorkspaceAction =
  | { readonly type: 'select-conversation'; readonly conversationId: string }
  | { readonly type: 'open-task'; readonly taskId: string }
  | { readonly type: 'open-conversation-details'; readonly conversationId: string }
  | { readonly type: 'close-inspector' }
  | { readonly type: 'set-task-view'; readonly view: TaskViewMode }
  | { readonly type: 'set-chat-filter'; readonly filter: ChatFilterId }
  | { readonly type: 'set-smart-view'; readonly view: SmartViewId }
  | { readonly type: 'set-project-filter'; readonly projectId: string | null }
  | { readonly type: 'set-chat-search'; readonly query: string }
  | { readonly type: 'set-task-search'; readonly query: string }
  | { readonly type: 'move-task'; readonly taskId: string; readonly status: TaskStatus }
  | { readonly type: 'move-task-to-column'; readonly taskId: string; readonly columnId: string }
  | { readonly type: 'set-task-completed'; readonly taskId: string; readonly completed: boolean }
  /** Adds a column to one project's board; no other board changes. */
  | { readonly type: 'add-board-column'; readonly projectId: string; readonly title: string; readonly tone: TagTone }
  | { readonly type: 'rename-board-column'; readonly columnId: string; readonly title: string }
  | { readonly type: 'remove-board-column'; readonly columnId: string; readonly disposition: ColumnDisposition }
  | { readonly type: 'patch-task'; readonly taskId: string; readonly patch: TaskPatch }
  | { readonly type: 'toggle-task-star'; readonly taskId: string }
  | { readonly type: 'toggle-subtask'; readonly taskId: string; readonly subtaskId: string }
  | { readonly type: 'add-subtask'; readonly taskId: string; readonly title: string }
  | { readonly type: 'remove-subtask'; readonly taskId: string; readonly subtaskId: string }
  | { readonly type: 'move-subtask'; readonly taskId: string; readonly subtaskId: string; readonly delta: number }
  | { readonly type: 'attach-task-files'; readonly taskId: string; readonly authorId: string; readonly files: readonly PickedFile[] }
  | { readonly type: 'remove-task-attachment'; readonly taskId: string; readonly attachmentId: string }
  | { readonly type: 'add-task-comment'; readonly taskId: string; readonly authorId: string; readonly body: string; readonly replyToId: string | null }
  | { readonly type: 'create-task'; readonly draft: TaskDraft; readonly authorId: string }
  | { readonly type: 'create-conversation'; readonly draft: ConversationDraft; readonly authorId: string }
  | { readonly type: 'send-message'; readonly conversationId: string; readonly authorId: string; readonly text: string; readonly replyToId: string | null }
  | {
      readonly type: 'send-file';
      readonly conversationId: string;
      readonly authorId: string;
      readonly messageId: string;
      readonly picked: PickedFile;
      readonly caption: string | null;
      readonly replyToId: string | null;
      /** A picture sent as a document: its own bytes, shown as a download card. */
      readonly asFile?: boolean;
    }
  | {
      readonly type: 'send-voice';
      readonly conversationId: string;
      readonly authorId: string;
      readonly messageId: string;
      readonly recording: VoiceRecording;
    }
  /** An unsent message of this member's: try it again (the same send), or let it go. */
  | { readonly type: 'resend-message'; readonly messageId: string }
  | { readonly type: 'discard-message'; readonly messageId: string }
  | { readonly type: 'focus-message'; readonly conversationId: string; readonly messageId: string }
  | { readonly type: 'clear-message-focus' }
  /** Phase 3.2: a message to send later («زمان‌بندی ارسال»), and what becomes of it. */
  | {
      readonly type: 'schedule-message';
      readonly scheduledId: string;
      readonly conversationId: string;
      readonly authorId: string;
      readonly text: string;
      readonly replyToId: string | null;
      readonly scheduledAt: string;
    }
  | { readonly type: 'cancel-scheduled-message'; readonly scheduledId: string }
  /** «ارسال فوری»: it goes out now, as `messageId` until the server's id replaces it. */
  | { readonly type: 'send-scheduled-now'; readonly scheduledId: string; readonly messageId: string }
  /** Demo only: the schedules whose time has come go out (in the live app, the server's worker sends them). */
  | { readonly type: 'deliver-due-scheduled'; readonly now: string }
  | { readonly type: 'update-working-hours'; readonly hours: WorkingHours }
  | { readonly type: 'toggle-reaction'; readonly messageId: string; readonly emoji: string; readonly userId: string }
  | { readonly type: 'mark-conversation-read'; readonly conversationId: string }
  | { readonly type: 'toggle-conversation-pin'; readonly conversationId: string }
  | { readonly type: 'toggle-conversation-mute'; readonly conversationId: string }
  | { readonly type: 'create-calendar-event'; readonly draft: CalendarEventDraft }
  | { readonly type: 'clear-calendar-focus' }
  /** `categoryId: null` files the note in no notebook. */
  | { readonly type: 'create-note'; readonly noteId: string; readonly categoryId: string | null }
  | { readonly type: 'create-note-category'; readonly categoryId: string; readonly label: string }
  | { readonly type: 'create-project'; readonly projectId: string; readonly draft: ProjectDraft; readonly ownerId: string }
  /** Workspace owner only: to the trash, restorable for 40 days. */
  | { readonly type: 'delete-project'; readonly projectId: string }
  | { readonly type: 'restore-project'; readonly projectId: string }
  /** The trash view opened: the live app reads it from the server. */
  | { readonly type: 'load-project-trash' }
  /** Out of the workspace; what they wrote stays. `password`: the owner's or admin's step-up (live). */
  | { readonly type: 'remove-member'; readonly userId: string; readonly password?: string }
  | { readonly type: 'delete-note-category'; readonly categoryId: string }
  | { readonly type: 'update-note'; readonly noteId: string; readonly patch: NotePatch }
  | { readonly type: 'delete-note'; readonly noteId: string }
  /** A new note left blank: it goes quietly, as if it had never been started. */
  | { readonly type: 'discard-note'; readonly noteId: string }
  | { readonly type: 'mark-notification-read'; readonly notificationId: string }
  | { readonly type: 'mark-all-notifications-read' }
  | { readonly type: 'invite-members'; readonly draft: InvitationDraft; readonly invitedById: string }
  | { readonly type: 'revoke-invitation'; readonly invitationId: string }
  | { readonly type: 'update-profile'; readonly profile: ProfileSettings }
  | { readonly type: 'set-two-factor'; readonly enabled: boolean }
  | { readonly type: 'record-password-change' }
  | { readonly type: 'revoke-login-session'; readonly sessionId: string }
  | { readonly type: 'revoke-other-login-sessions' }
  | { readonly type: 'switch-workspace'; readonly workspaceId: string }
  | {
      readonly type: 'create-workspace';
      readonly workspaceId: string;
      readonly draft: WorkspaceDraft;
      readonly ownerId: string;
      /** Live only: an owner's admin password, set before the workspace is created when there is none yet. */
      readonly adminPassword?: string;
    }
  | {
      readonly type: 'delete-workspace';
      readonly workspaceId: string;
      readonly actorId: string;
      /** Live only: the admin password that re-verifies the owner (step-up) before deleting. */
      readonly password?: string;
    }
  | { readonly type: 'sign-out' }
  | { readonly type: 'sign-in' }
  | { readonly type: 'set-permission'; readonly role: RoleId; readonly module: PermissionModuleId; readonly action: PermissionActionId; readonly value: boolean }
  | { readonly type: 'set-module-permissions'; readonly role: RoleId; readonly module: PermissionModuleId; readonly value: boolean }
  | { readonly type: 'set-action-permissions'; readonly role: RoleId; readonly action: PermissionActionId; readonly value: boolean }
  | { readonly type: 'set-role-permissions'; readonly role: RoleId; readonly value: boolean }
  | { readonly type: 'replace-permissions'; readonly permissions: PermissionMatrix }
  | { readonly type: 'announce'; readonly message: string }
  | SyncAction;

/**
 * What the server says, applied as it arrives: API responses replacing optimistic entries (a local
 * id swapped for the server's), and realtime events from everyone else. Never sent to the API.
 */
export type SyncAction =
  | { readonly type: 'sync/merge'; readonly patch: Partial<WorkspaceState> }
  | { readonly type: 'sync/upsert-task'; readonly task: Task; readonly replaceId?: string }
  | { readonly type: 'sync/remove-task'; readonly taskId: string }
  | { readonly type: 'sync/upsert-conversation'; readonly conversation: Conversation; readonly replaceId?: string; readonly select?: boolean }
  | { readonly type: 'sync/remove-conversation'; readonly conversationId: string }
  | { readonly type: 'sync/upsert-messages'; readonly messages: readonly Message[]; readonly replaceId?: string }
  | { readonly type: 'sync/remove-message'; readonly messageId: string }
  | { readonly type: 'sync/upsert-scheduled'; readonly scheduled: ScheduledMessage; readonly replaceId?: string }
  | { readonly type: 'sync/remove-scheduled'; readonly scheduledId: string }
  | { readonly type: 'sync/project-trash'; readonly entries: readonly TrashedProject[] }
  | { readonly type: 'sync/message-failed'; readonly messageId: string }
  | { readonly type: 'sync/reaction'; readonly messageId: string; readonly emoji: string; readonly userIds: readonly string[] }
  | { readonly type: 'sync/read'; readonly userId: string; readonly messageIds: readonly string[] }
  | { readonly type: 'sync/unread'; readonly conversationId: string; readonly count: number }
  | { readonly type: 'sync/typing'; readonly conversationId: string; readonly userId: string; readonly typing: boolean }
  | { readonly type: 'sync/message-linked'; readonly messageId: string; readonly taskId: string }
  | { readonly type: 'sync/upsert-notification'; readonly notification: AppNotification }
  | { readonly type: 'sync/upsert-event'; readonly event: CalendarEvent; readonly replaceId?: string }
  | { readonly type: 'sync/upsert-note'; readonly note: Note; readonly replaceId?: string }
  | { readonly type: 'sync/upsert-note-category'; readonly category: NoteCategory; readonly replaceId?: string }
  | { readonly type: 'sync/upsert-project'; readonly project: Project; readonly replaceId?: string }
  | { readonly type: 'sync/presence'; readonly userId: string; readonly presence: PresenceState };

/** What happens to the cards of a column being deleted. Irrelevant when it is empty. */
export type ColumnDisposition =
  | { readonly kind: 'migrate'; readonly targetColumnId: string }
  | { readonly kind: 'archive' };

export interface ConversationDraft {
  readonly kind: 'direct' | 'group';
  readonly title: string;
  readonly topic: string;
  /** Every member, the author included. */
  readonly memberIds: readonly string[];
  readonly tone: AvatarTone;
}

/**
 * A file the person picked, before it is stored: the bytes (for the upload) and a local preview
 * URL (so it shows at once). `attachmentId` is the local id it has until the server's replaces it.
 */
export interface PickedFile {
  readonly attachmentId: string;
  readonly file: Blob;
  readonly name: string;
  readonly previewUrl: string;
}

/** A voice note just recorded in the composer. */
export interface VoiceRecording {
  readonly blob: Blob;
  readonly durationSec: number;
  /** 64 samples, 0–100. */
  readonly waveform: readonly number[];
  readonly previewUrl: string;
}

/** Days a deleted project stays restorable (the API purges it after them). */
export const PROJECT_TRASH_DAYS = 40;

/** A project in the trash, as «آرشیو / سطل زباله» lists it. */
export interface TrashedProject {
  readonly project: Project;
  readonly deletedAt: string;
  readonly purgeAt: string;
  readonly taskCount: number;
  /**
   * The demo keeps what went with the project here and puts it back on «بازیابی»; the live app
   * reloads it from the server instead.
   */
  readonly stash?: {
    readonly tasks: readonly Task[];
    readonly boardColumns: readonly BoardColumn[];
    readonly conversations: readonly Conversation[];
  };
}

export interface ProjectDraft {
  readonly name: string;
  /** Short Latin key, the prefix of the project's task codes (`CRM-104`). */
  readonly key: string;
  readonly color: AvatarTone;
  readonly departmentId: DepartmentId;
  readonly description: string;
}

export interface InvitationDraft {
  readonly recipients: readonly InvitationRecipient[];
  readonly role: RoleId;
  readonly department: DepartmentId;
  readonly message: string;
}

/**
 * Field edits. Status is deliberately absent: it is part of a task's board placement and
 * only changes through `move-task`, `move-task-to-column` or `set-task-completed`, which keep
 * the custom column and the reopen target consistent with it.
 */
export interface TaskPatch {
  readonly priority?: Task['priority'];
  readonly assigneeIds?: readonly string[];
  readonly reviewerId?: string | null;
  readonly dueDate?: string;
  readonly startDate?: string;
  readonly title?: string;
  readonly description?: string;
}

const LOCKED_ROLES: readonly RoleId[] = ['owner'];

const isLocked = (role: RoleId): boolean => LOCKED_ROLES.includes(role);

const mapTask = (
  tasks: readonly Task[],
  taskId: string,
  update: (task: Task) => Task,
): readonly Task[] => tasks.map((task) => (task.id === taskId ? update(task) : task));

const nowIso = (): string => new Date().toISOString();

/** The attachment a picked file shows as until it is stored: its local preview is its URL. */
function pickedAttachment(picked: PickedFile, uploadedById: string): Attachment {
  return {
    id: picked.attachmentId,
    name: picked.name,
    kind: attachmentKindOf(picked.file.type, picked.name),
    size: picked.file.size,
    uploadedAt: nowIso(),
    uploadedById,
    url: picked.previewUrl,
  };
}

/**
 * The one place a task changes status. Entering "done" from anywhere else records where the
 * task came from, so unchecking it later returns it there; any other move clears that record.
 */
function placeTask(task: Task, next: TaskPlacement): Task {
  if (task.status === next.status && task.boardColumnId === next.boardColumnId) return task;
  const enteringDone = next.status === 'done' && task.status !== 'done';
  return {
    ...task,
    status: next.status,
    boardColumnId: next.boardColumnId,
    reopenTo: enteringDone
      ? { status: task.status, boardColumnId: task.boardColumnId }
      : next.status === 'done'
        ? task.reopenTo
        : null,
  };
}

/** Resolves a column id to the placement a task takes when it lands there. */
function placementForColumn(columns: readonly BoardColumn[], columnId: string): TaskPlacement | null {
  const column = columns.find((entry) => entry.id === columnId);
  if (!column) return null;
  return { status: column.status, boardColumnId: column.custom ? column.id : null };
}

function columnTitle(columns: readonly BoardColumn[], placement: TaskPlacement): string {
  const id = placement.boardColumnId ?? placement.status;
  return columns.find((column) => column.id === id)?.title ?? statusLabel(placement.status);
}

/**
 * Swaps the scoped slices to `targetId`'s and resets per-screen view state (inspector,
 * filters, searches) that would otherwise point into the previous workspace's data.
 * `park` is false when the outgoing workspace is being deleted and its data discarded.
 */
function activateWorkspace(state: WorkspaceState, targetId: string, park: boolean): WorkspaceState {
  const { [targetId]: incoming = EMPTY_SCOPE, ...others } = state.parkedWorkspaces;
  return {
    ...state,
    ...incoming,
    activeWorkspaceId: targetId,
    parkedWorkspaces: park ? { ...others, [state.activeWorkspaceId]: scopeOf(state) } : others,
    inspector: { kind: 'none' },
    calendarFocusDate: null,
    smartView: 'all',
    projectFilterId: null,
    taskSearch: '',
    chatSearch: '',
  };
}

const sameMembers = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'select-conversation':
      return {
        ...state,
        activeConversationId: action.conversationId,
        unreadByConversation: { ...state.unreadByConversation, [action.conversationId]: 0 },
        inspector:
          state.inspector.kind === 'conversation'
            ? { kind: 'conversation', conversationId: action.conversationId }
            : state.inspector,
      };

    case 'open-task':
      return { ...state, inspector: { kind: 'task', taskId: action.taskId } };

    case 'open-conversation-details':
      return { ...state, inspector: { kind: 'conversation', conversationId: action.conversationId } };

    case 'close-inspector':
      return { ...state, inspector: { kind: 'none' } };

    case 'set-task-view':
      return { ...state, taskView: action.view };

    case 'set-chat-filter':
      return { ...state, chatFilter: action.filter };

    case 'set-smart-view':
      return { ...state, smartView: action.view, projectFilterId: null };

    case 'set-project-filter':
      return { ...state, projectFilterId: action.projectId, smartView: 'all' };

    case 'set-chat-search':
      return { ...state, chatSearch: action.query };

    case 'set-task-search':
      return { ...state, taskSearch: action.query };

    case 'move-task':
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (task) =>
          placeTask(task, { status: action.status, boardColumnId: null }),
        ),
      };

    case 'move-task-to-column': {
      // The status columns of views across projects count as targets too.
      const target = [...state.boardColumns, ...BUILT_IN_COLUMNS].find((column) => column.id === action.columnId);
      const placement = placementForColumn([...state.boardColumns, ...BUILT_IN_COLUMNS], action.columnId);
      if (!target || !placement) return state;
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (task) =>
          // Another project's column (a sub-project's card on its parent's board) only lends its
          // status: the card lands in its own project's column for that status.
          placeTask(task, target.projectId === undefined || target.projectId === task.projectId ? placement : { status: target.status, boardColumnId: null }),
        ),
      };
    }

    case 'set-task-completed': {
      const task = state.tasks.find((entry) => entry.id === action.taskId);
      if (!task || (task.status === 'done') === action.completed) return state;

      if (action.completed) {
        return {
          ...state,
          tasks: mapTask(state.tasks, action.taskId, (entry) =>
            placeTask(entry, { status: 'done', boardColumnId: null }),
          ),
          announcement: `وظیفه «${task.title}» انجام شد.`,
        };
      }

      // Back to where it was — unless that custom column has since been removed, in which
      // case the task falls back to the built-in column for the same status.
      const remembered = task.reopenTo;
      const rememberedColumnId = remembered?.boardColumnId ?? null;
      const columnStillExists =
        rememberedColumnId === null ||
        state.boardColumns.some((column) => column.id === rememberedColumnId);
      const target: TaskPlacement =
        remembered && remembered.status !== 'done'
          ? columnStillExists
            ? remembered
            : { status: remembered.status, boardColumnId: null }
          : { status: 'todo', boardColumnId: null };

      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (entry) => placeTask(entry, target)),
        announcement: `وظیفه «${task.title}» به ستون ${columnTitle(projectColumns(state.boardColumns, task.projectId), target)} بازگشت.`,
      };
    }

    case 'add-board-column': {
      const title = action.title.trim();
      if (!title) return state;
      const column: BoardColumn = {
        id: nextId('col'),
        title,
        status: CUSTOM_COLUMN_STATUS,
        tone: action.tone,
        custom: true,
        projectId: action.projectId,
      };
      return {
        ...state,
        boardColumns: [...state.boardColumns, column],
        announcement: `ستون «${title}» به بورد اضافه شد.`,
      };
    }

    case 'rename-board-column': {
      const title = action.title.trim();
      const column = state.boardColumns.find((entry) => entry.id === action.columnId);
      if (!column || !title || title === column.title) return state;
      // Names are unique per board: another project may use the same one.
      const taken = state.boardColumns.some((entry) => entry.id !== column.id && entry.projectId === column.projectId && entry.title.trim() === title);
      if (taken) return state;
      return {
        ...state,
        boardColumns: state.boardColumns.map((entry) => (entry.id === column.id ? { ...entry, title } : entry)),
        announcement: `ستون «${column.title}» به «${title}» تغییر نام داد.`,
      };
    }

    case 'remove-board-column': {
      const column = state.boardColumns.find((entry) => entry.id === action.columnId);
      const board = column ? state.boardColumns.filter((entry) => entry.projectId === column.projectId) : [];
      // The board always keeps one column, so every card keeps somewhere to render.
      if (!column || board.length <= 1) return state;

      // Only the project's own cards can be in its column.
      const inColumn = new Set(
        state.tasks
          .filter((task) => task.projectId === column.projectId && columnForTask(board, task)?.id === column.id)
          .map((task) => task.id),
      );
      const remaining = state.boardColumns.filter((entry) => entry.id !== column.id);
      const forget = (task: Task): Task =>
        task.reopenTo?.boardColumnId === column.id
          ? { ...task, reopenTo: { ...task.reopenTo, boardColumnId: null } }
          : task;

      if (inColumn.size === 0) {
        return {
          ...state,
          boardColumns: remaining,
          tasks: state.tasks.map(forget),
          announcement: `ستون «${column.title}» حذف شد.`,
        };
      }

      if (action.disposition.kind === 'archive') {
        const archived = state.tasks.filter((task) => inColumn.has(task.id));
        const inspectedArchived = state.inspector.kind === 'task' && inColumn.has(state.inspector.taskId);
        return {
          ...state,
          boardColumns: remaining,
          tasks: state.tasks.filter((task) => !inColumn.has(task.id)).map(forget),
          archivedTasks: [...archived, ...state.archivedTasks],
          inspector: inspectedArchived ? { kind: 'none' } : state.inspector,
          announcement: `ستون «${column.title}» حذف شد و ${toPersianDigits(archived.length)} وظیفه بایگانی شد.`,
        };
      }

      const { targetColumnId } = action.disposition;
      const target = remaining.find((entry) => entry.id === targetColumnId);
      const placement = target ? placementForColumn(remaining, target.id) : null;
      if (!target || !placement) return state;
      return {
        ...state,
        boardColumns: remaining,
        tasks: state.tasks.map((task) => forget(inColumn.has(task.id) ? placeTask(task, placement) : task)),
        announcement: `ستون «${column.title}» حذف شد و ${toPersianDigits(inColumn.size)} وظیفه به ستون «${target.title}» منتقل شد.`,
      };
    }

    case 'patch-task':
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (task) => ({ ...task, ...action.patch })),
      };

    case 'toggle-task-star':
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (task) => ({ ...task, starred: !task.starred })),
      };

    case 'toggle-subtask':
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (task) => ({
          ...task,
          subtasks: task.subtasks.map((subtask) =>
            subtask.id === action.subtaskId ? { ...subtask, done: !subtask.done } : subtask,
          ),
        })),
      };

    case 'add-subtask':
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (task) => ({
          ...task,
          subtasks: [
            ...task.subtasks,
            { id: nextId('s'), title: action.title, done: false, assigneeId: null },
          ],
        })),
      };

    case 'remove-subtask':
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (task) => ({
          ...task,
          subtasks: task.subtasks.filter((subtask) => subtask.id !== action.subtaskId),
        })),
      };

    case 'move-subtask':
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (task) => {
          const index = task.subtasks.findIndex((subtask) => subtask.id === action.subtaskId);
          const target = index + action.delta;
          if (index === -1 || target < 0 || target >= task.subtasks.length) return task;
          const next = [...task.subtasks];
          const [moved] = next.splice(index, 1);
          if (!moved) return task;
          next.splice(target, 0, moved);
          return { ...task, subtasks: next };
        }),
      };

    case 'add-task-comment':
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (task) => ({
          ...task,
          comments: [
            ...task.comments,
            {
              id: nextId('c'),
              authorId: action.authorId,
              body: action.body,
              createdAt: new Date().toISOString(),
              replyToId: action.replyToId,
            },
          ],
        })),
      };

    case 'create-task': {
      const { draft } = action;
      const id = nextId('t');
      const today = new Date();
      const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const placement: TaskPlacement = (draft.boardColumnId
        ? placementForColumn(state.boardColumns, draft.boardColumnId)
        : null) ?? { status: draft.status, boardColumnId: null };
      const task: Task = {
        id,
        code: `NEW-${state.tasks.length + 1}`,
        title: draft.title,
        description: draft.description,
        status: placement.status,
        priority: draft.priority,
        projectId: draft.projectId,
        assigneeIds: draft.assigneeIds,
        reviewerId: null,
        startDate,
        dueDate: draft.dueDate ?? startDate,
        createdAt: nowIso(),
        subtasks: draft.subtaskTitles.map((title) => ({
          id: nextId('s'),
          title,
          done: false,
          assigneeId: null,
        })),
        attachments: draft.attachments,
        comments: [],
        labels: [],
        starred: false,
        sourceMessageId: draft.sourceMessageId,
        boardColumnId: placement.boardColumnId,
        reopenTo: null,
      };

      return {
        ...state,
        tasks: [task, ...state.tasks],
        inspector: { kind: 'task', taskId: id },
        messages: draft.sourceMessageId
          ? state.messages.map((message) =>
              message.id === draft.sourceMessageId ? { ...message, linkedTaskId: id } : message,
            )
          : state.messages,
        notes: draft.sourceNoteId
          ? state.notes.map((note) =>
              note.id === draft.sourceNoteId ? { ...note, linkedTaskId: id } : note,
            )
          : state.notes,
        announcement: `وظیفه «${draft.title}» ایجاد شد.`,
      };
    }

    case 'create-conversation': {
      const { draft } = action;
      if (draft.kind === 'direct') {
        const existing = state.conversations.find(
          (conversation) =>
            conversation.kind === 'direct' && sameMembers(conversation.memberIds, draft.memberIds),
        );
        if (existing) {
          return {
            ...state,
            activeConversationId: existing.id,
            unreadByConversation: { ...state.unreadByConversation, [existing.id]: 0 },
            announcement: `گفتگو با ${existing.title} از قبل وجود داشت و باز شد.`,
          };
        }
      }

      const conversation: Conversation = {
        id: nextId('conv'),
        kind: draft.kind,
        title: draft.title,
        memberIds: draft.memberIds,
        pinned: false,
        muted: false,
        unreadCount: 0,
        tone: draft.tone,
        topic: draft.topic || (draft.kind === 'direct' ? 'گفتگوی مستقیم' : 'گروه تیمی'),
      };
      const opener: Message | null =
        draft.kind === 'group'
          ? {
              id: nextId('m'),
              conversationId: conversation.id,
              authorId: action.authorId,
              sentAt: nowIso(),
              body: { kind: 'system', text: `گروه «${draft.title}» ایجاد شد.` },
              replyToId: null,
              reactions: [],
              edited: false,
              linkedTaskId: null,
              readByIds: [],
            }
          : null;

      return {
        ...state,
        conversations: [conversation, ...state.conversations],
        messages: opener ? [...state.messages, opener] : state.messages,
        unreadByConversation: { ...state.unreadByConversation, [conversation.id]: 0 },
        activeConversationId: conversation.id,
        announcement:
          draft.kind === 'direct'
            ? `گفتگو با ${draft.title} ایجاد شد.`
            : `گروه «${draft.title}» ایجاد شد.`,
      };
    }

    case 'send-message': {
      const message: Message = {
        id: nextId('m'),
        conversationId: action.conversationId,
        authorId: action.authorId,
        sentAt: new Date().toISOString(),
        body: { kind: 'text', text: action.text },
        replyToId: action.replyToId,
        reactions: [],
        edited: false,
        linkedTaskId: null,
        readByIds: [],
      };
      return answerIfAway({ ...state, messages: [...state.messages, message] }, message);
    }

    case 'send-file': {
      const { picked } = action;
      const message: Message = {
        id: action.messageId,
        conversationId: action.conversationId,
        authorId: action.authorId,
        sentAt: nowIso(),
        body: { kind: 'file', attachment: pickedAttachment(picked, action.authorId), caption: action.caption, ...(action.asFile ? { asFile: true } : {}) },
        replyToId: action.replyToId,
        reactions: [],
        edited: false,
        linkedTaskId: null,
        readByIds: [],
      };
      return { ...state, messages: [...state.messages, message] };
    }

    case 'send-voice': {
      const { recording } = action;
      const message: Message = {
        id: action.messageId,
        conversationId: action.conversationId,
        authorId: action.authorId,
        sentAt: nowIso(),
        body: { kind: 'voice', durationSec: recording.durationSec, waveform: recording.waveform, src: recording.previewUrl },
        replyToId: null,
        reactions: [],
        edited: false,
        linkedTaskId: null,
        readByIds: [],
      };
      return { ...state, messages: [...state.messages, message] };
    }

    case 'resend-message':
      return { ...state, messages: state.messages.map((message) => (message.id === action.messageId ? { ...message, failed: false } : message)) };

    case 'discard-message':
      return { ...state, messages: state.messages.filter((message) => message.id !== action.messageId) };

    case 'schedule-message': {
      const scheduled: ScheduledMessage = {
        id: action.scheduledId,
        conversationId: action.conversationId,
        authorId: action.authorId,
        text: action.text,
        replyToId: action.replyToId,
        scheduledAt: action.scheduledAt,
      };
      return {
        ...state,
        scheduledMessages: [...state.scheduledMessages, scheduled].sort(bySchedule),
        announcement: 'پیام زمان‌بندی شد و در زمان انتخاب‌شده ارسال می‌شود.',
      };
    }

    case 'cancel-scheduled-message':
      return {
        ...state,
        scheduledMessages: state.scheduledMessages.filter((entry) => entry.id !== action.scheduledId),
        announcement: 'پیام زمان‌بندی‌شده لغو شد.',
      };

    case 'send-scheduled-now': {
      const scheduled = state.scheduledMessages.find((entry) => entry.id === action.scheduledId);
      if (!scheduled) return state;
      const rest = { ...state, scheduledMessages: state.scheduledMessages.filter((entry) => entry.id !== scheduled.id) };
      return deliverScheduled(rest, scheduled, action.messageId, new Date());
    }

    case 'deliver-due-scheduled': {
      const due = state.scheduledMessages.filter((entry) => entry.scheduledAt <= action.now);
      if (due.length === 0) return state;
      let next: WorkspaceState = { ...state, scheduledMessages: state.scheduledMessages.filter((entry) => entry.scheduledAt > action.now) };
      for (const scheduled of due) next = deliverScheduled(next, scheduled, nextId('m'), new Date(action.now));
      return next;
    }

    case 'update-working-hours':
      return { ...state, workingHours: action.hours, announcement: 'ساعات کاری و پاسخ خودکار ذخیره شد.' };

    case 'focus-message':
      return { ...state, activeConversationId: action.conversationId, focusedMessageId: action.messageId, inspector: { kind: 'none' } };

    case 'clear-message-focus':
      return state.focusedMessageId === null ? state : { ...state, focusedMessageId: null };

    case 'attach-task-files':
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (task) => ({
          ...task,
          attachments: [...task.attachments, ...action.files.map((picked) => pickedAttachment(picked, action.authorId))],
        })),
        announcement: `${toPersianDigits(action.files.length)} فایل پیوست شد.`,
      };

    case 'remove-task-attachment':
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (task) => ({
          ...task,
          attachments: task.attachments.filter((attachment) => attachment.id !== action.attachmentId),
        })),
      };

    case 'toggle-reaction':
      return {
        ...state,
        messages: state.messages.map((message) => {
          if (message.id !== action.messageId) return message;
          const existing = message.reactions.find((reaction) => reaction.emoji === action.emoji);

          if (!existing) {
            return {
              ...message,
              reactions: [...message.reactions, { emoji: action.emoji, userIds: [action.userId] }],
            };
          }

          const hasReacted = existing.userIds.includes(action.userId);
          const nextUserIds = hasReacted
            ? existing.userIds.filter((id) => id !== action.userId)
            : [...existing.userIds, action.userId];

          return {
            ...message,
            reactions: nextUserIds.length
              ? message.reactions.map((reaction) =>
                  reaction.emoji === action.emoji ? { ...reaction, userIds: nextUserIds } : reaction,
                )
              : message.reactions.filter((reaction) => reaction.emoji !== action.emoji),
          };
        }),
      };

    case 'mark-conversation-read':
      return {
        ...state,
        unreadByConversation: { ...state.unreadByConversation, [action.conversationId]: 0 },
      };

    case 'toggle-conversation-pin':
      return {
        ...state,
        pinnedConversationIds: state.pinnedConversationIds.includes(action.conversationId)
          ? state.pinnedConversationIds.filter((id) => id !== action.conversationId)
          : [...state.pinnedConversationIds, action.conversationId],
      };

    case 'toggle-conversation-mute':
      return {
        ...state,
        mutedConversationIds: state.mutedConversationIds.includes(action.conversationId)
          ? state.mutedConversationIds.filter((id) => id !== action.conversationId)
          : [...state.mutedConversationIds, action.conversationId],
      };

    case 'create-calendar-event': {
      const event: CalendarEvent = { id: nextId('ev'), ...action.draft };
      return {
        ...state,
        calendarEvents: [...state.calendarEvents, event],
        calendarFocusDate: event.date,
        announcement: `«${event.title}» در تقویم ثبت شد.`,
      };
    }

    case 'clear-calendar-focus':
      return state.calendarFocusDate === null ? state : { ...state, calendarFocusDate: null };

    case 'create-note': {
      const timestamp = nowIso();
      const note: Note = {
        id: action.noteId,
        categoryId: action.categoryId,
        title: '',
        body: '',
        colors: [],
        pinned: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        linkedTaskId: null,
      };
      return { ...state, notes: [note, ...state.notes] };
    }

    case 'create-project': {
      const name = action.draft.name.trim();
      if (!name) return state;
      const project: Project = {
        id: action.projectId,
        name,
        departmentId: action.draft.departmentId,
        color: action.draft.color,
        starred: false,
        parentId: null,
        memberIds: [action.ownerId],
      };
      // …and its own chat channel, whose members follow the project's (the live app gets it from the API).
      const channel: Conversation = {
        id: nextId('conv'),
        kind: 'channel',
        title: name,
        memberIds: [action.ownerId],
        pinned: false,
        muted: false,
        unreadCount: 0,
        tone: action.draft.color,
        topic: 'کانال پروژه',
        projectId: project.id,
      };
      return {
        ...state,
        projects: [...state.projects, project],
        // Every project starts with a board of its own: its copy of the four built-in columns.
        boardColumns: [...state.boardColumns, ...builtInColumnsFor(project.id)],
        conversations: [...state.conversations, channel],
        announcement: `پروژه «${name}» ایجاد شد.`,
      };
    }

    case 'delete-project': {
      const project = state.projects.find((entry) => entry.id === action.projectId);
      if (!project) return state;
      const deletedAt = new Date();
      const tasks = state.tasks.filter((task) => task.projectId === project.id);
      const taskIds = new Set(tasks.map((task) => task.id));
      const channels = state.conversations.filter((conversation) => conversation.projectId === project.id);
      const entry: TrashedProject = {
        project,
        deletedAt: deletedAt.toISOString(),
        purgeAt: new Date(deletedAt.getTime() + PROJECT_TRASH_DAYS * 86_400_000).toISOString(),
        taskCount: tasks.length,
        stash: { tasks, boardColumns: state.boardColumns.filter((column) => column.projectId === project.id), conversations: channels },
      };
      return {
        ...state,
        projects: state.projects.filter((entry) => entry.id !== project.id),
        tasks: state.tasks.filter((task) => !taskIds.has(task.id)),
        boardColumns: state.boardColumns.filter((column) => column.projectId !== project.id),
        conversations: state.conversations.filter((conversation) => conversation.projectId !== project.id),
        activeConversationId: channels.some((channel) => channel.id === state.activeConversationId) ? '' : state.activeConversationId,
        projectTrash: [entry, ...state.projectTrash.filter((trashed) => trashed.project.id !== project.id)],
        projectFilterId: state.projectFilterId === project.id ? null : state.projectFilterId,
        inspector: state.inspector.kind === 'task' && taskIds.has(state.inspector.taskId) ? { kind: 'none' } : state.inspector,
        announcement: `پروژه «${project.name}» به سطل زباله رفت و تا ${toPersianDigits(PROJECT_TRASH_DAYS)} روز بازیابی‌پذیر است.`,
      };
    }

    case 'restore-project': {
      const entry = state.projectTrash.find((trashed) => trashed.project.id === action.projectId);
      if (!entry) return state;
      const { stash } = entry;
      return {
        ...state,
        projects: [...state.projects.filter((project) => project.id !== entry.project.id), entry.project],
        tasks: stash ? [...state.tasks, ...stash.tasks] : state.tasks,
        boardColumns: stash ? [...state.boardColumns, ...stash.boardColumns] : state.boardColumns,
        conversations: stash ? [...state.conversations, ...stash.conversations] : state.conversations,
        projectTrash: state.projectTrash.filter((trashed) => trashed !== entry),
        announcement: `پروژه «${entry.project.name}» بازیابی شد.`,
      };
    }

    case 'load-project-trash':
      return state;

    case 'remove-member': {
      const user = state.users.find((entry) => entry.id === action.userId);
      if (!user || user.id === state.meId) return state;
      return {
        ...state,
        users: state.users.filter((entry) => entry.id !== user.id),
        formerUsers: [...state.formerUsers.filter((entry) => entry.id !== user.id), { ...user, former: true, presence: 'offline' }],
        // Out of every group and channel; a direct chat keeps naming both people.
        conversations: state.conversations.map((conversation) =>
          conversation.kind !== 'direct' && conversation.memberIds.includes(user.id)
            ? { ...conversation, memberIds: conversation.memberIds.filter((id) => id !== user.id) }
            : conversation,
        ),
        projects: state.projects.map((project) =>
          project.memberIds.includes(user.id) ? { ...project, memberIds: project.memberIds.filter((id) => id !== user.id) } : project,
        ),
        announcement: `${user.fullName} از فضای کاری حذف شد؛ پیام‌ها و کارهایش می‌ماند.`,
      };
    }

    case 'create-note-category': {
      const label = action.label.trim();
      if (!label || state.noteCategories.some((category) => category.label.trim() === label)) return state;
      return {
        ...state,
        noteCategories: [...state.noteCategories, { id: action.categoryId, label, builtIn: false }],
        announcement: `دسته «${label}» ایجاد شد.`,
      };
    }

    case 'delete-note-category': {
      const category = state.noteCategories.find((entry) => entry.id === action.categoryId);
      if (!category) return state;
      // Any notebook can go, built-ins included; its notes stay, filed in no notebook.
      const released = state.notes.filter((note) => note.categoryId === category.id).length;
      return {
        ...state,
        noteCategories: state.noteCategories.filter((entry) => entry.id !== category.id),
        notes: state.notes.map((note) => (note.categoryId === category.id ? { ...note, categoryId: null } : note)),
        announcement:
          released > 0
            ? `دسته «${category.label}» حذف شد و ${toPersianDigits(released)} یادداشت آن بدون دسته ماند.`
            : `دسته «${category.label}» حذف شد.`,
      };
    }

    case 'update-note':
      return {
        ...state,
        notes: state.notes.map((note) =>
          note.id === action.noteId ? { ...note, ...action.patch, updatedAt: nowIso() } : note,
        ),
      };

    case 'delete-note': {
      const note = state.notes.find((entry) => entry.id === action.noteId);
      if (!note) return state;
      return {
        ...state,
        notes: state.notes.filter((entry) => entry.id !== action.noteId),
        announcement: `یادداشت «${note.title || 'بدون عنوان'}» حذف شد.`,
      };
    }

    case 'discard-note':
      return { ...state, notes: state.notes.filter((entry) => entry.id !== action.noteId) };

    case 'mark-notification-read':
      return {
        ...state,
        notifications: state.notifications.map((notification) =>
          notification.id === action.notificationId && !notification.read
            ? { ...notification, read: true }
            : notification,
        ),
      };

    case 'mark-all-notifications-read':
      return {
        ...state,
        notifications: state.notifications.map((notification) =>
          notification.read ? notification : { ...notification, read: true },
        ),
        announcement: 'همه اعلان‌ها خوانده‌شده علامت خوردند.',
      };

    case 'invite-members': {
      const { draft } = action;
      // Skip anyone already invited, and repeats within the batch itself.
      const seen = new Set(state.invitations.map((invitation) => invitation.address));
      const fresh: InvitationRecipient[] = [];
      for (const recipient of draft.recipients) {
        if (seen.has(recipient.address)) continue;
        seen.add(recipient.address);
        fresh.push(recipient);
      }
      if (fresh.length === 0) return state;
      const invitedAt = nowIso();
      const created: Invitation[] = fresh.map(({ address, channel }) => ({
        id: nextId('inv'),
        address,
        channel,
        role: draft.role,
        department: draft.department,
        message: draft.message,
        invitedAt,
        invitedById: action.invitedById,
      }));
      return {
        ...state,
        invitations: [...created, ...state.invitations],
        announcement: `${toPersianDigits(created.length)} دعوت‌نامه ارسال شد.`,
      };
    }

    case 'revoke-invitation':
      return {
        ...state,
        invitations: state.invitations.filter((invitation) => invitation.id !== action.invitationId),
      };

    case 'update-profile':
      return { ...state, profile: action.profile, announcement: 'پروفایل شما به‌روزرسانی شد.' };

    case 'set-two-factor':
      return {
        ...state,
        twoFactorEnabled: action.enabled,
        announcement: action.enabled ? 'ورود دومرحله‌ای فعال شد.' : 'ورود دومرحله‌ای غیرفعال شد.',
      };

    case 'record-password-change':
      return { ...state, passwordChangedAt: nowIso(), announcement: 'رمز عبور تغییر کرد.' };

    case 'revoke-login-session':
      return {
        ...state,
        loginSessions: state.loginSessions.filter(
          (session) => session.current || session.id !== action.sessionId,
        ),
      };

    case 'revoke-other-login-sessions':
      return {
        ...state,
        loginSessions: state.loginSessions.filter((session) => session.current),
        announcement: 'از همه نشست‌های دیگر خارج شدید.',
      };

    case 'switch-workspace': {
      const target = state.workspaces.find((workspace) => workspace.id === action.workspaceId);
      if (!target || target.id === state.activeWorkspaceId) return state;
      return { ...activateWorkspace(state, target.id, true), announcement: `فضای کاری «${target.name}» فعال شد.` };
    }

    case 'create-workspace': {
      const name = action.draft.name.trim();
      if (!name) return state;
      const workspace: Workspace = {
        id: action.workspaceId,
        name,
        description: action.draft.description.trim(),
        initials: monogram(name),
        tone: action.draft.tone,
        iconUrl: action.draft.iconUrl,
        plan: 'رایگان',
        memberCount: 1,
        ownerId: action.ownerId,
      };
      return {
        ...activateWorkspace({ ...state, workspaces: [...state.workspaces, workspace] }, workspace.id, true),
        announcement: `فضای کاری «${name}» ایجاد و فعال شد.`,
      };
    }

    case 'delete-workspace': {
      const workspace = state.workspaces.find((entry) => entry.id === action.workspaceId);
      // Owner only, and never the last workspace — the app always has somewhere to stand.
      if (!workspace || workspace.ownerId !== action.actorId || state.workspaces.length <= 1) return state;
      const workspaces = state.workspaces.filter((entry) => entry.id !== workspace.id);
      const announcement = `فضای کاری «${workspace.name}» برای همیشه حذف شد.`;
      if (workspace.id !== state.activeWorkspaceId) {
        const parked = Object.fromEntries(
          Object.entries(state.parkedWorkspaces).filter(([id]) => id !== workspace.id),
        );
        return { ...state, workspaces, parkedWorkspaces: parked, announcement };
      }
      const fallback = workspaces[0];
      if (!fallback) return state;
      return { ...activateWorkspace({ ...state, workspaces }, fallback.id, false), announcement };
    }

    case 'sign-out':
      // Everything the member did this session is dropped; only the theme (stored by the
      // ThemeProvider, not here) survives, because it is a device preference.
      return { ...INITIAL_WORKSPACE_STATE, session: 'signed-out' };

    case 'sign-in':
      return INITIAL_WORKSPACE_STATE;

    case 'set-permission': {
      if (isLocked(action.role)) return state;
      const role = state.permissions[action.role];
      const permissionModule = role[action.module];
      return {
        ...state,
        permissions: {
          ...state.permissions,
          [action.role]: {
            ...role,
            [action.module]: { ...permissionModule, [action.action]: action.value },
          },
        },
      };
    }

    case 'set-module-permissions': {
      if (isLocked(action.role)) return state;
      const role = state.permissions[action.role];
      const filled = Object.fromEntries(
        PERMISSION_ACTIONS.map((entry) => [entry.id, action.value]),
      ) as Readonly<Record<PermissionActionId, boolean>>;
      return {
        ...state,
        permissions: { ...state.permissions, [action.role]: { ...role, [action.module]: filled } },
      };
    }

    case 'set-action-permissions': {
      if (isLocked(action.role)) return state;
      const role = state.permissions[action.role];
      const nextRole = Object.fromEntries(
        PERMISSION_MODULES.map((entry) => [
          entry.id,
          { ...role[entry.id], [action.action]: action.value },
        ]),
      ) as PermissionMatrix[RoleId];
      return { ...state, permissions: { ...state.permissions, [action.role]: nextRole } };
    }

    case 'set-role-permissions': {
      if (isLocked(action.role)) return state;
      const filled = Object.fromEntries(
        PERMISSION_ACTIONS.map((entry) => [entry.id, action.value]),
      ) as Readonly<Record<PermissionActionId, boolean>>;
      const nextRole = Object.fromEntries(
        PERMISSION_MODULES.map((entry) => [entry.id, filled]),
      ) as PermissionMatrix[RoleId];
      return { ...state, permissions: { ...state.permissions, [action.role]: nextRole } };
    }

    case 'replace-permissions':
      return { ...state, permissions: action.permissions };

    case 'announce':
      return { ...state, announcement: action.message };

    case 'sync/merge':
    case 'sync/upsert-task':
    case 'sync/remove-task':
    case 'sync/upsert-conversation':
    case 'sync/remove-conversation':
    case 'sync/upsert-messages':
    case 'sync/remove-message':
    case 'sync/upsert-scheduled':
    case 'sync/remove-scheduled':
    case 'sync/project-trash':
    case 'sync/message-failed':
    case 'sync/reaction':
    case 'sync/read':
    case 'sync/unread':
    case 'sync/typing':
    case 'sync/message-linked':
    case 'sync/upsert-notification':
    case 'sync/upsert-event':
    case 'sync/upsert-note':
    case 'sync/upsert-note-category':
    case 'sync/upsert-project':
    case 'sync/presence':
      return syncReducer(state, action);

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/** Replaces the entry with `replaceId` (or the same id), or adds it to the front. */
function upsert<T extends { readonly id: string }>(items: readonly T[], item: T, replaceId?: string, atEnd = false): readonly T[] {
  const matchId = replaceId ?? item.id;
  let found = false;
  const next: T[] = [];
  for (const entry of items) {
    if (entry.id === matchId || entry.id === item.id) {
      if (!found) next.push(item);
      found = true;
    } else {
      next.push(entry);
    }
  }
  if (found) return next;
  return atEnd ? [...items, item] : [item, ...items];
}

const byTime = (a: Message, b: Message): number => a.sentAt.localeCompare(b.sentAt);

const bySchedule = (a: ScheduledMessage, b: ScheduledMessage): number => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id);

/** A scheduled message going out: a plain message of its author's, now. */
function deliverScheduled(state: WorkspaceState, scheduled: ScheduledMessage, messageId: string, at: Date): WorkspaceState {
  const message: Message = {
    id: messageId,
    conversationId: scheduled.conversationId,
    authorId: scheduled.authorId,
    sentAt: at.toISOString(),
    body: { kind: 'text', text: scheduled.text },
    replyToId: scheduled.replyToId,
    reactions: [],
    edited: false,
    linkedTaskId: null,
    readByIds: [],
  };
  return answerIfAway({ ...state, messages: [...state.messages, message] }, message);
}

/**
 * Demo only (the live app answers on the server): a direct message to a teammate who is away gets
 * their auto-reply, at most once a day per person who writes. Groups and channels never do.
 */
function answerIfAway(state: WorkspaceState, message: Message): WorkspaceState {
  const conversation = state.conversations.find((entry) => entry.id === message.conversationId);
  if (conversation?.kind !== 'direct') return state;
  const responderId = conversation.memberIds.find((id) => id !== message.authorId);
  const hours = responderId ? state.teammateHours[responderId] : undefined;
  const at = new Date(message.sentAt);
  if (!responderId || !hours?.autoReplyEnabled || isWorkingTime(hours, at)) return state;
  const key = `${responderId}:${message.authorId}`;
  const last = state.autoRepliedAt[key];
  if (last && at.getTime() - Date.parse(last) < AUTO_REPLY_WINDOW_MS) return state;
  const reply: Message = {
    id: nextId('m'),
    conversationId: conversation.id,
    authorId: responderId,
    sentAt: new Date(at.getTime() + 1).toISOString(),
    body: { kind: 'text', text: hours.message },
    replyToId: null,
    reactions: [],
    edited: false,
    linkedTaskId: null,
    readByIds: [],
    autoReply: true,
  };
  return { ...state, messages: [...state.messages, reply], autoRepliedAt: { ...state.autoRepliedAt, [key]: at.toISOString() } };
}

function syncReducer(state: WorkspaceState, action: SyncAction): WorkspaceState {
  switch (action.type) {
    case 'sync/merge':
      return { ...state, ...action.patch };

    case 'sync/upsert-task': {
      const { task, replaceId } = action;
      const swap = (id: string): string => (replaceId !== undefined && id === replaceId ? task.id : id);
      const inArchive = state.archivedTasks.some((entry) => entry.id === task.id);
      return {
        ...state,
        tasks: inArchive ? state.tasks : upsert(state.tasks, task, replaceId),
        inspector: state.inspector.kind === 'task' ? { kind: 'task', taskId: swap(state.inspector.taskId) } : state.inspector,
        messages: replaceId === undefined ? state.messages : state.messages.map((message) => (message.linkedTaskId === replaceId ? { ...message, linkedTaskId: task.id } : message)),
        notes: replaceId === undefined ? state.notes : state.notes.map((note) => (note.linkedTaskId === replaceId ? { ...note, linkedTaskId: task.id } : note)),
      };
    }

    case 'sync/remove-task':
      return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.taskId),
        inspector: state.inspector.kind === 'task' && state.inspector.taskId === action.taskId ? { kind: 'none' } : state.inspector,
      };

    case 'sync/upsert-conversation': {
      const { conversation, replaceId } = action;
      const swap = (id: string): string => (replaceId !== undefined && id === replaceId ? conversation.id : id);
      const unread = { ...state.unreadByConversation };
      if (replaceId !== undefined && replaceId in unread) delete unread[replaceId];
      if (!(conversation.id in unread) || action.select) unread[conversation.id] = action.select ? 0 : conversation.unreadCount;
      const pinned = state.pinnedConversationIds.filter((id) => id !== replaceId && id !== conversation.id);
      const muted = state.mutedConversationIds.filter((id) => id !== replaceId && id !== conversation.id);
      return {
        ...state,
        conversations: upsert(state.conversations, conversation, replaceId),
        messages: replaceId === undefined ? state.messages : state.messages.map((message) => (message.conversationId === replaceId ? { ...message, conversationId: conversation.id } : message)),
        unreadByConversation: unread,
        pinnedConversationIds: conversation.pinned ? [...pinned, conversation.id] : pinned,
        mutedConversationIds: conversation.muted ? [...muted, conversation.id] : muted,
        activeConversationId: action.select ? conversation.id : swap(state.activeConversationId),
        inspector: state.inspector.kind === 'conversation' ? { kind: 'conversation', conversationId: swap(state.inspector.conversationId) } : state.inspector,
      };
    }

    case 'sync/remove-conversation': {
      const conversations = state.conversations.filter((conversation) => conversation.id !== action.conversationId);
      const unread = Object.fromEntries(Object.entries(state.unreadByConversation).filter(([id]) => id !== action.conversationId));
      return {
        ...state,
        conversations,
        messages: state.messages.filter((message) => message.conversationId !== action.conversationId),
        unreadByConversation: unread,
        activeConversationId: state.activeConversationId === action.conversationId ? (conversations[0]?.id ?? '') : state.activeConversationId,
        inspector: state.inspector.kind === 'conversation' && state.inspector.conversationId === action.conversationId ? { kind: 'none' } : state.inspector,
      };
    }

    case 'sync/upsert-messages': {
      let messages = state.messages;
      for (const message of action.messages) messages = upsert(messages, message, action.replaceId, true);
      return { ...state, messages: [...messages].sort(byTime) };
    }

    case 'sync/remove-message':
      return { ...state, messages: state.messages.filter((message) => message.id !== action.messageId) };

    case 'sync/upsert-scheduled':
      return { ...state, scheduledMessages: [...upsert(state.scheduledMessages, action.scheduled, action.replaceId, true)].sort(bySchedule) };

    case 'sync/remove-scheduled':
      return { ...state, scheduledMessages: state.scheduledMessages.filter((entry) => entry.id !== action.scheduledId) };

    case 'sync/message-failed':
      return { ...state, messages: state.messages.map((message) => (message.id === action.messageId ? { ...message, failed: true } : message)) };

    case 'sync/project-trash':
      return { ...state, projectTrash: action.entries };

    case 'sync/reaction':
      return {
        ...state,
        messages: state.messages.map((message) => {
          if (message.id !== action.messageId) return message;
          const others = message.reactions.filter((reaction) => reaction.emoji !== action.emoji);
          const at = message.reactions.findIndex((reaction) => reaction.emoji === action.emoji);
          if (action.userIds.length === 0) return { ...message, reactions: others };
          const next = { emoji: action.emoji, userIds: action.userIds };
          if (at === -1) return { ...message, reactions: [...others, next] };
          return { ...message, reactions: message.reactions.map((reaction, index) => (index === at ? next : reaction)) };
        }),
      };

    case 'sync/read': {
      const ids = new Set(action.messageIds);
      return {
        ...state,
        messages: state.messages.map((message) =>
          ids.has(message.id) && !message.readByIds.includes(action.userId) ? { ...message, readByIds: [...message.readByIds, action.userId] } : message,
        ),
      };
    }

    case 'sync/unread':
      return { ...state, unreadByConversation: { ...state.unreadByConversation, [action.conversationId]: action.count } };

    case 'sync/message-linked':
      return {
        ...state,
        messages: state.messages.map((message) => (message.id === action.messageId ? { ...message, linkedTaskId: action.taskId } : message)),
      };

    case 'sync/typing': {
      const current = state.typingByConversation[action.conversationId] ?? [];
      const has = current.includes(action.userId);
      if (has === action.typing) return state;
      const next = action.typing ? [...current, action.userId] : current.filter((id) => id !== action.userId);
      return { ...state, typingByConversation: { ...state.typingByConversation, [action.conversationId]: next } };
    }

    case 'sync/upsert-notification':
      return { ...state, notifications: upsert(state.notifications, action.notification) };

    case 'sync/upsert-event':
      return { ...state, calendarEvents: upsert(state.calendarEvents, action.event, action.replaceId, true) };

    case 'sync/upsert-note': {
      const { note, replaceId } = action;
      return { ...state, notes: upsert(state.notes, note, replaceId) };
    }

    case 'sync/upsert-project': {
      const { project, replaceId } = action;
      if (replaceId === undefined) return { ...state, projects: upsert(state.projects, project, undefined, true) };
      return {
        ...state,
        projects: upsert(state.projects, project, replaceId, true),
        tasks: state.tasks.map((task) => (task.projectId === replaceId ? { ...task, projectId: project.id } : task)),
        projectFilterId: state.projectFilterId === replaceId ? project.id : state.projectFilterId,
      };
    }

    case 'sync/upsert-note-category': {
      const { category, replaceId } = action;
      return {
        ...state,
        noteCategories: upsert(state.noteCategories, category, replaceId, true),
        notes: replaceId === undefined ? state.notes : state.notes.map((note) => (note.categoryId === replaceId ? { ...note, categoryId: category.id } : note)),
      };
    }

    case 'sync/presence':
      return {
        ...state,
        users: state.users.map((user) => (user.id === action.userId && user.presence !== action.presence ? { ...user, presence: action.presence } : user)),
      };
  }
}

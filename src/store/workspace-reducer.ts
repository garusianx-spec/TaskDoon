import type {
  ActiveSession,
  BoardColumn,
  ChatFilterId,
  Conversation,
  ForwardTarget,
  InspectorTarget,
  Message,
  PermissionActionId,
  PermissionMatrix,
  PermissionModuleId,
  RoleId,
  ProfileDraft,
  Project,
  ProjectDraft,
  SemanticTone,
  SmartViewId,
  Task,
  TaskDraft,
  TaskRecurrence,
  TaskReminder,
  TaskStatus,
  TaskViewMode,
} from '@/types';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@/data/reference';
import { USERS } from '@/data/workspace';

export interface WorkspaceState {
  readonly tasks: readonly Task[];
  readonly messages: readonly Message[];
  readonly columns: readonly BoardColumn[];
  readonly projects: readonly Project[];
  readonly conversations: readonly Conversation[];
  readonly profile: ProfileDraft;
  readonly sessions: readonly ActiveSession[];
  /** False once the user signs out; the shell then renders the auth view. */
  readonly signedIn: boolean;
  /** Board filter: only show cards assigned to this member. */
  readonly assigneeFilterId: string | null;
  /** Composer to focus after a cross-module jump into a conversation. */
  readonly focusComposer: boolean;
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
  /** Message the viewport should scroll to and pulse; cleared once the jump completes. */
  readonly jumpToMessageId: string | null;
  /** Text pushed to the shell's `aria-live` region after a non-visual state change. */
  readonly announcement: string;
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
  | { readonly type: 'reorder-task'; readonly taskId: string; readonly status: TaskStatus; readonly beforeTaskId: string | null }
  | { readonly type: 'patch-task'; readonly taskId: string; readonly patch: TaskPatch }
  | { readonly type: 'toggle-task-star'; readonly taskId: string }
  | { readonly type: 'toggle-subtask'; readonly taskId: string; readonly subtaskId: string }
  | { readonly type: 'add-subtask'; readonly taskId: string; readonly title: string }
  | { readonly type: 'remove-subtask'; readonly taskId: string; readonly subtaskId: string }
  | { readonly type: 'move-subtask'; readonly taskId: string; readonly subtaskId: string; readonly delta: number }
  | { readonly type: 'add-task-comment'; readonly taskId: string; readonly authorId: string; readonly body: string; readonly replyToId: string | null }
  | { readonly type: 'create-task'; readonly draft: TaskDraft; readonly authorId: string }
  | { readonly type: 'send-message'; readonly conversationId: string; readonly authorId: string; readonly text: string; readonly replyToId: string | null }
  | { readonly type: 'toggle-reaction'; readonly messageId: string; readonly emoji: string; readonly userId: string }
  | { readonly type: 'mark-conversation-read'; readonly conversationId: string }
  | { readonly type: 'toggle-conversation-pin'; readonly conversationId: string }
  | { readonly type: 'set-task-reminder'; readonly taskId: string; readonly reminder: TaskReminder | null }
  | { readonly type: 'set-task-recurrence'; readonly taskId: string; readonly recurrence: TaskRecurrence | null }
  | { readonly type: 'toggle-message-pin'; readonly messageId: string }
  | { readonly type: 'unpin-all-messages'; readonly conversationId: string }
  | { readonly type: 'jump-to-message'; readonly messageId: string }
  | { readonly type: 'clear-jump-target' }
  | {
      readonly type: 'forward-message';
      readonly messageId: string;
      readonly targets: readonly ForwardTarget[];
      readonly authorId: string;
    }
  | { readonly type: 'toggle-conversation-mute'; readonly conversationId: string }
  | { readonly type: 'set-permission'; readonly role: RoleId; readonly module: PermissionModuleId; readonly action: PermissionActionId; readonly value: boolean }
  | { readonly type: 'set-module-permissions'; readonly role: RoleId; readonly module: PermissionModuleId; readonly value: boolean }
  | { readonly type: 'set-action-permissions'; readonly role: RoleId; readonly action: PermissionActionId; readonly value: boolean }
  | { readonly type: 'set-role-permissions'; readonly role: RoleId; readonly value: boolean }
  | { readonly type: 'replace-permissions'; readonly permissions: PermissionMatrix }
  | { readonly type: 'add-column'; readonly title: string; readonly tone: SemanticTone; readonly mapsTo: TaskStatus }
  | { readonly type: 'remove-column'; readonly columnId: string }
  | { readonly type: 'move-task-to-column'; readonly taskId: string; readonly columnId: string }
  | { readonly type: 'set-assignee-filter'; readonly userId: string | null }
  | { readonly type: 'create-project'; readonly draft: ProjectDraft }
  | { readonly type: 'add-project-member'; readonly projectId: string; readonly userId: string }
  | { readonly type: 'open-direct-message'; readonly userId: string; readonly currentUserId: string }
  | { readonly type: 'focus-composer-handled' }
  | { readonly type: 'update-profile'; readonly profile: ProfileDraft }
  | { readonly type: 'revoke-session'; readonly sessionId: string }
  | { readonly type: 'sign-out' }
  | { readonly type: 'sign-in' }
  | { readonly type: 'announce'; readonly message: string };

export interface TaskPatch {
  readonly status?: TaskStatus;
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

/** One-line summary of a message, used as the title of a task created by forwarding. */
function summarise(message: Message): string {
  switch (message.body.kind) {
    case 'text':
      return message.body.text.length > 70 ? `${message.body.text.slice(0, 69)}…` : message.body.text;
    case 'file':
      return message.body.attachment.name;
    case 'voice':
      return 'پیام صوتی ارجاع‌شده';
    case 'system':
      return message.body.text;
    default: {
      const exhaustive: never = message.body;
      return exhaustive;
    }
  }
}

let sequence = 0;
/** Monotonic id for client-created entities. Stable within a session, never collides with seeds. */
const nextId = (prefix: string): string => {
  sequence += 1;
  return `${prefix}-local-${sequence}`;
};

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

    case 'move-task': {
      const task = state.tasks.find((entry) => entry.id === action.taskId);
      if (!task || task.status === action.status) return state;
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (entry) => ({
          ...entry,
          status: action.status,
          columnId: action.status,
        })),
      };
    }

    case 'reorder-task': {
      const moving = state.tasks.find((entry) => entry.id === action.taskId);
      if (!moving) return state;

      const updated: Task = { ...moving, status: action.status, columnId: action.status };
      const without = state.tasks.filter((entry) => entry.id !== action.taskId);
      const targetIndex =
        action.beforeTaskId === null
          ? without.length
          : without.findIndex((entry) => entry.id === action.beforeTaskId);

      const next = [...without];
      next.splice(targetIndex === -1 ? without.length : targetIndex, 0, updated);
      return { ...state, tasks: next };
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
      const task: Task = {
        id,
        code: `NEW-${state.tasks.length + 1}`,
        title: draft.title,
        description: draft.description,
        status: draft.status,
        columnId: draft.status,
        priority: draft.priority,
        projectId: draft.projectId,
        assigneeIds: draft.assigneeIds,
        reviewerId: null,
        startDate,
        dueDate: draft.dueDate ?? startDate,
        createdAt: new Date().toISOString(),
        subtasks: draft.subtasks,
        attachments: draft.attachments,
        comments: [],
        labels: [],
        starred: false,
        sourceMessageId: draft.sourceMessageId,
        reminder: draft.reminder,
        recurrence: draft.recurrence,
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
        announcement: `وظیفه «${draft.title}» ایجاد شد.`,
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
        pinned: false,
        forwardedFrom: null,
      };
      return { ...state, messages: [...state.messages, message] };
    }

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

    case 'set-task-reminder':
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (task) => ({ ...task, reminder: action.reminder })),
      };

    case 'set-task-recurrence':
      return {
        ...state,
        tasks: mapTask(state.tasks, action.taskId, (task) => ({
          ...task,
          recurrence: action.recurrence,
        })),
      };

    case 'toggle-message-pin': {
      const target = state.messages.find((message) => message.id === action.messageId);
      if (!target) return state;
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.messageId ? { ...message, pinned: !message.pinned } : message,
        ),
        announcement: target.pinned
          ? 'پین پیام برداشته شد.'
          : 'پیام در بالای گفتگو پین شد.',
      };
    }

    case 'unpin-all-messages':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.conversationId === action.conversationId && message.pinned
            ? { ...message, pinned: false }
            : message,
        ),
        announcement: 'همه پیام‌های پین‌شده این گفتگو برداشته شدند.',
      };

    case 'jump-to-message':
      return { ...state, jumpToMessageId: action.messageId };

    case 'clear-jump-target':
      return { ...state, jumpToMessageId: null };

    case 'forward-message': {
      const source = state.messages.find((message) => message.id === action.messageId);
      if (!source || action.targets.length === 0) return state;

      // A forward keeps the original author in `forwardedFrom` while the *sender* becomes
      // the author of the new message, which is what the "ارسال شده از" header reads back.
      const origin = source.forwardedFrom ?? {
        authorId: source.authorId,
        conversationId: source.conversationId,
        originalMessageId: source.id,
        sentAt: source.sentAt,
      };

      const conversationTargets = action.targets.filter((target) => target.kind !== 'board');
      const boardTargets = action.targets.filter((target) => target.kind === 'board');

      const forwarded: Message[] = conversationTargets.map((target) => ({
        id: nextId('m'),
        conversationId: target.id,
        authorId: action.authorId,
        sentAt: new Date().toISOString(),
        body: source.body,
        replyToId: null,
        reactions: [],
        edited: false,
        linkedTaskId: null,
        readByIds: [],
        pinned: false,
        forwardedFrom: origin,
      }));

      // Forwarding into a board produces a task, not a message.
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const boardTasks: Task[] = boardTargets.map((target, index) => ({
        id: nextId('t'),
        code: `FWD-${state.tasks.length + index + 1}`,
        title: summarise(source),
        description: `ارجاع‌شده از گفتگو توسط ${action.authorId}`,
        status: 'todo',
        columnId: 'todo',
        priority: 'medium',
        projectId: target.id,
        assigneeIds: [action.authorId],
        reviewerId: null,
        startDate: todayIso,
        dueDate: todayIso,
        createdAt: new Date().toISOString(),
        subtasks: [],
        attachments: source.body.kind === 'file' ? [source.body.attachment] : [],
        comments: [],
        labels: ['فوروارد از گفتگو'],
        starred: false,
        sourceMessageId: source.id,
        reminder: null,
        recurrence: null,
      }));

      const names = action.targets.map((target) => target.title).join('، ');
      return {
        ...state,
        messages: [...state.messages, ...forwarded],
        tasks: boardTasks.length ? [...boardTasks, ...state.tasks] : state.tasks,
        announcement: `پیام به ${names} فوروارد شد.`,
      };
    }

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

    case 'add-column': {
      const id = nextId('col');
      return {
        ...state,
        columns: [...state.columns, { id, title: action.title, tone: action.tone, mapsTo: action.mapsTo, custom: true }],
        announcement: `ستون «${action.title}» افزوده شد.`,
      };
    }

    case 'remove-column': {
      const column = state.columns.find((entry) => entry.id === action.columnId);
      if (!column || !column.custom) return state;
      // Cards in a removed column fall back to the built-in column for their status.
      return {
        ...state,
        columns: state.columns.filter((entry) => entry.id !== action.columnId),
        tasks: state.tasks.map((task) =>
          task.columnId === action.columnId ? { ...task, columnId: task.status } : task,
        ),
        announcement: `ستون «${column.title}» حذف شد.`,
      };
    }

    case 'move-task-to-column': {
      const column = state.columns.find((entry) => entry.id === action.columnId);
      if (!column) return state;
      return {
        ...state,
        // The column decides the card's canonical status through its mapping.
        tasks: mapTask(state.tasks, action.taskId, (task) => ({
          ...task,
          columnId: column.id,
          status: column.mapsTo,
        })),
      };
    }

    case 'set-assignee-filter':
      return { ...state, assigneeFilterId: action.userId };

    case 'create-project': {
      const projectId = nextId('p');
      const conversationId = action.draft.createGroup ? nextId('conv') : null;

      const project: Project = {
        id: projectId,
        name: action.draft.name,
        departmentId: action.draft.departmentId,
        color: action.draft.color,
        starred: false,
        parentId: null,
        memberIds: action.draft.memberIds,
        conversationId,
      };

      // Creating a project spawns its channel, so the team has somewhere to talk from day one.
      const conversation: Conversation | null = conversationId
        ? {
            id: conversationId,
            kind: 'channel',
            title: action.draft.name,
            memberIds: action.draft.memberIds,
            pinned: false,
            muted: false,
            unreadCount: 0,
            tone: action.draft.color,
            topic: `گفتگوی پروژه ${action.draft.name}`,
            projectId,
          }
        : null;

      const openingMessage: Message | null = conversation
        ? {
            id: nextId('m'),
            conversationId: conversation.id,
            authorId: action.draft.memberIds[0] ?? '',
            sentAt: new Date().toISOString(),
            body: { kind: 'system', text: `گفتگوی پروژه «${action.draft.name}» ایجاد شد.` },
            replyToId: null,
            reactions: [],
            edited: false,
            linkedTaskId: null,
            readByIds: [],
            pinned: false,
            forwardedFrom: null,
          }
        : null;

      return {
        ...state,
        projects: [...state.projects, project],
        conversations: conversation ? [...state.conversations, conversation] : state.conversations,
        messages: openingMessage ? [...state.messages, openingMessage] : state.messages,
        projectFilterId: projectId,
        smartView: 'all',
        announcement: conversation
          ? `پروژه «${action.draft.name}» به همراه گفتگوی اختصاصی ساخته شد.`
          : `پروژه «${action.draft.name}» ساخته شد.`,
      };
    }

    case 'add-project-member': {
      const project = state.projects.find((entry) => entry.id === action.projectId);
      if (!project || project.memberIds.includes(action.userId)) return state;
      return {
        ...state,
        projects: state.projects.map((entry) =>
          entry.id === action.projectId
            ? { ...entry, memberIds: [...entry.memberIds, action.userId] }
            : entry,
        ),
        // Keep the linked channel's membership in step with the board's.
        conversations: state.conversations.map((entry) =>
          entry.id === project.conversationId && !entry.memberIds.includes(action.userId)
            ? { ...entry, memberIds: [...entry.memberIds, action.userId] }
            : entry,
        ),
      };
    }

    case 'open-direct-message': {
      const existing = state.conversations.find(
        (conversation) =>
          conversation.kind === 'direct' &&
          conversation.memberIds.length === 2 &&
          conversation.memberIds.includes(action.userId) &&
          conversation.memberIds.includes(action.currentUserId),
      );

      if (existing) {
        return {
          ...state,
          activeConversationId: existing.id,
          unreadByConversation: { ...state.unreadByConversation, [existing.id]: 0 },
          focusComposer: true,
        };
      }

      // No thread yet — open a fresh one rather than dropping the user on an empty list.
      const id = nextId('conv');
      const counterpart = USERS.find((user) => user.id === action.userId);
      const conversation: Conversation = {
        id,
        kind: 'direct',
        title: counterpart?.fullName ?? 'گفتگوی جدید',
        memberIds: [action.currentUserId, action.userId],
        pinned: false,
        muted: false,
        unreadCount: 0,
        tone: counterpart?.avatarTone ?? 'slate',
        topic: 'گفتگوی مستقیم',
        projectId: null,
      };
      return {
        ...state,
        conversations: [...state.conversations, conversation],
        activeConversationId: id,
        unreadByConversation: { ...state.unreadByConversation, [id]: 0 },
        focusComposer: true,
      };
    }

    case 'focus-composer-handled':
      return { ...state, focusComposer: false };

    case 'update-profile':
      return { ...state, profile: action.profile, announcement: 'پروفایل به‌روزرسانی شد.' };

    case 'revoke-session':
      return {
        ...state,
        sessions: state.sessions.filter((entry) => entry.id !== action.sessionId),
        announcement: 'نشست انتخاب‌شده خاتمه یافت.',
      };

    case 'sign-out':
      return { ...state, signedIn: false, inspector: { kind: 'none' } };

    case 'sign-in':
      return { ...state, signedIn: true };

    case 'announce':
      return { ...state, announcement: action.message };

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

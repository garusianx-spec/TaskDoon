import type {
  AppNotification,
  BoardColumn,
  CalendarEvent,
  ChatFilterId,
  Conversation,
  Message,
  Note,
  NoteCategory,
  NotificationFilterId,
  Project,
  SmartViewId,
  TagTone,
  Task,
  TaskPlacement,
  TaskStatus,
  User,
} from '@taskin/contracts';
import { BUILT_IN_COLUMNS } from '@/data/reference';
import { directory } from './directory';
import { daysBetween, parseISODate, toISODate } from '@taskin/jalali';

/* ------------------------------ People & projects ------------------------------ */

export const userById = (id: string): User | undefined => directory.users().find((user) => user.id === id);

export const usersByIds = (ids: readonly string[]): User[] =>
  ids.map(userById).filter((user): user is User => user !== undefined);

export const projectById = (id: string): Project | undefined =>
  directory.projects().find((project) => project.id === id);

export const conversationById = (
  conversations: readonly Conversation[],
  id: string,
): Conversation | undefined => conversations.find((conversation) => conversation.id === id);

/** Root projects with their children attached, for the sidebar tree. */
export interface ProjectNode {
  readonly project: Project;
  readonly children: readonly Project[];
}

export function buildProjectTree(): readonly ProjectNode[] {
  return directory.projects().filter((project) => project.parentId === null).map((project) => ({
    project,
    children: directory.projects().filter((child) => child.parentId === project.id),
  }));
}

/** A project id plus every descendant id — used when filtering the board by a parent. */
export function projectWithDescendants(projectId: string): readonly string[] {
  const children = directory.projects().filter((project) => project.parentId === projectId).map((p) => p.id);
  return [projectId, ...children];
}

/* ------------------------------ Tasks ------------------------------ */

export interface TaskFilter {
  readonly smartView: SmartViewId;
  readonly projectId: string | null;
  readonly search: string;
  readonly currentUserId: string;
}

export function filterTasks(tasks: readonly Task[], filter: TaskFilter): readonly Task[] {
  const query = filter.search.trim().toLowerCase();
  const scope = filter.projectId ? projectWithDescendants(filter.projectId) : null;
  const today = new Date();

  return tasks.filter((task) => {
    if (scope && !scope.includes(task.projectId)) return false;

    switch (filter.smartView) {
      case 'my-tasks':
        if (!task.assigneeIds.includes(filter.currentUserId)) return false;
        break;
      case 'starred':
        if (!task.starred) return false;
        break;
      case 'due-soon': {
        if (task.status === 'done') return false;
        const delta = daysBetween(today, parseISODate(task.dueDate));
        if (delta > 3) return false;
        break;
      }
      case 'all':
        break;
      default: {
        const exhaustive: never = filter.smartView;
        return exhaustive;
      }
    }

    if (!query) return true;
    const haystack = `${task.title} ${task.code} ${task.description} ${task.labels.join(' ')}`.toLowerCase();
    return haystack.includes(query);
  });
}

export const tasksByStatus = (tasks: readonly Task[], status: TaskStatus): readonly Task[] =>
  tasks.filter((task) => task.status === status);

export const taskById = (tasks: readonly Task[], id: string): Task | undefined =>
  tasks.find((task) => task.id === id);

export const subtaskProgress = (task: Task): { readonly done: number; readonly total: number } =>
  task.summary
    ? { done: task.summary.subtasksDone, total: task.summary.subtasks }
    : { done: task.subtasks.filter((subtask) => subtask.done).length, total: task.subtasks.length };

/** Files on a task, known from its list page before its detail is loaded. */
export const attachmentCount = (task: Task): number => task.summary?.attachments ?? task.attachments.length;

export const isOverdue = (task: Task, now: Date = new Date()): boolean =>
  task.status !== 'done' && daysBetween(now, parseISODate(task.dueDate)) < 0;

/* ------------------------------ Board ------------------------------ */

/**
 * The column a placement resolves to: the custom column it names; else the first column
 * carrying its status (the built-in one, even if renamed); and, when the team has deleted
 * every column for that status, the first column on the board — so a card is never homeless.
 */
export function columnForPlacement(
  columns: readonly BoardColumn[],
  placement: TaskPlacement,
): BoardColumn | undefined {
  if (placement.boardColumnId !== null) {
    const named = columns.find((column) => column.id === placement.boardColumnId);
    if (named) return named;
  }
  return (
    columns.find((column) => !column.custom && column.status === placement.status) ??
    columns.find((column) => column.status === placement.status) ??
    columns[0]
  );
}

/**
 * The column a task shows in. From a list holding the task's own project's columns, only
 * those count (no other project's column is ever its); from any other list — the status
 * columns of «همه وظایف», or a parent project's board showing a sub-project's cards — the
 * task sits in the column of its status.
 */
export function columnForTask(columns: readonly BoardColumn[], task: Task): BoardColumn | undefined {
  const own = columns.filter((column) => column.projectId === task.projectId);
  return own.length > 0 ? columnForPlacement(own, task) : columnForPlacement(columns, { status: task.status, boardColumnId: null });
}

/** A project's own board columns, start to end; the status columns while it has none yet. */
export function projectColumns(columns: readonly BoardColumn[], projectId: string): readonly BoardColumn[] {
  const own = columns.filter((column) => column.projectId === projectId);
  return own.length > 0 ? own : BUILT_IN_COLUMNS;
}

export const tasksInColumn = (
  tasks: readonly Task[],
  columns: readonly BoardColumn[],
  column: BoardColumn,
): readonly Task[] => tasks.filter((task) => columnForTask(columns, task)?.id === column.id);

/* ------------------------------ Calendar ------------------------------ */

/**
 * One row on the calendar. Deadlines are derived from tasks rather than stored, so a task
 * that is rescheduled or completed moves its badge without a second write.
 */
export type CalendarItem =
  | { readonly kind: 'deadline'; readonly id: string; readonly date: string; readonly task: Task }
  | { readonly kind: 'event'; readonly id: string; readonly date: string; readonly event: CalendarEvent };

/** Milestones first, then open deadlines, then timed events by start time, then the rest. */
function calendarRank(item: CalendarItem): string {
  if (item.kind === 'deadline') return item.task.status === 'done' ? '3' : '1';
  if (item.event.kind === 'milestone') return '0';
  return `2${item.event.startTime ?? '99:99'}`;
}

export function calendarItemsByDate(
  tasks: readonly Task[],
  events: readonly CalendarEvent[],
): ReadonlyMap<string, readonly CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  const push = (item: CalendarItem) => {
    const list = map.get(item.date);
    if (list) list.push(item);
    else map.set(item.date, [item]);
  };

  // `dueDate` is already a local `YYYY-MM-DD`; keying on it directly avoids the UTC shift a
  // Date round-trip would introduce west of Greenwich.
  for (const task of tasks) {
    push({ kind: 'deadline', id: `deadline-${task.id}`, date: task.dueDate.slice(0, 10), task });
  }
  for (const event of events) {
    push({ kind: 'event', id: event.id, date: event.date, event });
  }
  for (const list of map.values()) {
    list.sort((a, b) => calendarRank(a).localeCompare(calendarRank(b)));
  }
  return map;
}

/* ------------------------------ Notifications ------------------------------ */

export const isMentionNotification = (notification: AppNotification): boolean =>
  notification.event.kind === 'mention' || notification.event.kind === 'reply';

export function filterNotifications(
  notifications: readonly AppNotification[],
  filter: NotificationFilterId,
): readonly AppNotification[] {
  const sorted = notifications
    .slice()
    .sort((a, b) => parseISODate(b.createdAt).getTime() - parseISODate(a.createdAt).getTime());
  switch (filter) {
    case 'all':
      return sorted;
    case 'unread':
      return sorted.filter((notification) => !notification.read);
    case 'mentions':
      return sorted.filter(isMentionNotification);
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

/* ------------------------------ Notes ------------------------------ */

export const noteCategoryLabel = (categories: readonly NoteCategory[], id: string | null): string =>
  categories.find((category) => category.id === id)?.label ?? 'بدون دسته';

export interface NoteFilter {
  /** A category id, or `'all'`. */
  readonly categoryId: string;
  readonly color: TagTone | null;
  readonly search: string;
}

/** Pinned first, then most recently edited. */
export function filterNotes(notes: readonly Note[], filter: NoteFilter): readonly Note[] {
  const query = filter.search.trim().toLowerCase();
  return notes
    .filter((note) => {
      if (filter.categoryId !== 'all' && note.categoryId !== filter.categoryId) return false;
      if (filter.color && !note.colors.includes(filter.color)) return false;
      if (!query) return true;
      return `${note.title} ${note.body}`.toLowerCase().includes(query);
    })
    .slice()
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return parseISODate(b.updatedAt).getTime() - parseISODate(a.updatedAt).getTime();
    });
}

/* ------------------------------ Conversations ------------------------------ */

/**
 * A thread in arrival order. The store only ever appends (`send-message` pushes to the tail),
 * so array order *is* the chronology — re-sorting by `sentAt` would let a clock skew between
 * devices, or a fixture stamped later in the day, lift an older message above a new one.
 */
export const conversationMessages = (
  messages: readonly Message[],
  conversationId: string,
): readonly Message[] => messages.filter((message) => message.conversationId === conversationId);

export const lastMessage = (
  messages: readonly Message[],
  conversationId: string,
): Message | undefined => {
  const thread = conversationMessages(messages, conversationId);
  return thread[thread.length - 1];
};

export const messageById = (messages: readonly Message[], id: string): Message | undefined =>
  messages.find((message) => message.id === id);

/** One-line preview for the chat list; voice and file messages get a descriptive stand-in. */
export function messagePreview(message: Message | undefined): string {
  if (!message) return 'هنوز پیامی ارسال نشده است';
  switch (message.body.kind) {
    case 'text':
      return message.body.text;
    case 'voice':
      return 'پیام صوتی';
    case 'file':
      return message.body.attachment.name;
    case 'system':
      return message.body.text;
    default: {
      const exhaustive: never = message.body;
      return exhaustive;
    }
  }
}

export interface ConversationFilter {
  readonly filter: ChatFilterId;
  readonly search: string;
  readonly unreadByConversation: Readonly<Record<string, number>>;
  readonly pinnedIds: readonly string[];
}

export function filterConversations(
  conversations: readonly Conversation[],
  messages: readonly Message[],
  options: ConversationFilter,
): readonly Conversation[] {
  const query = options.search.trim().toLowerCase();

  const matched = conversations.filter((conversation) => {
    switch (options.filter) {
      case 'direct':
        if (conversation.kind !== 'direct') return false;
        break;
      case 'groups':
        if (conversation.kind === 'direct') return false;
        break;
      case 'unread':
        if ((options.unreadByConversation[conversation.id] ?? 0) === 0) return false;
        break;
      case 'all':
        break;
      default: {
        const exhaustive: never = options.filter;
        return exhaustive;
      }
    }

    if (!query) return true;
    const preview = messagePreview(lastMessage(messages, conversation.id));
    return `${conversation.title} ${conversation.topic} ${preview}`.toLowerCase().includes(query);
  });

  // Pinned first, then most recent activity.
  return matched.slice().sort((a, b) => {
    const aPinned = options.pinnedIds.includes(a.id) ? 1 : 0;
    const bPinned = options.pinnedIds.includes(b.id) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;

    const aTime = lastMessage(messages, a.id)?.sentAt;
    const bTime = lastMessage(messages, b.id)?.sentAt;
    if (!aTime || !bTime) return 0;
    return parseISODate(bTime).getTime() - parseISODate(aTime).getTime();
  });
}

/** Groups a thread into day buckets so the view can insert Jalali date dividers. */
export interface MessageGroup {
  readonly isoDate: string;
  readonly messages: readonly Message[];
}

export function groupMessagesByDay(messages: readonly Message[]): readonly MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    const isoDate = toISODate(parseISODate(message.sentAt));
    const last = groups[groups.length - 1];
    if (last && last.isoDate === isoDate) {
      groups[groups.length - 1] = { isoDate, messages: [...last.messages, message] };
    } else {
      groups.push({ isoDate, messages: [message] });
    }
  }
  return groups;
}

/** True when the previous message is from the same author within five minutes. */
export function isGroupedWithPrevious(current: Message, previous: Message | undefined): boolean {
  if (!previous) return false;
  if (previous.authorId !== current.authorId) return false;
  if (previous.body.kind === 'system' || current.body.kind === 'system') return false;
  const gapMs = parseISODate(current.sentAt).getTime() - parseISODate(previous.sentAt).getTime();
  return gapMs < 5 * 60 * 1000;
}

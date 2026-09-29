import type {
  ActivityItem,
  ActivityView,
  AppNotification,
  Attachment,
  AttachmentView,
  BoardColumn,
  CalendarEvent,
  CalendarEventView,
  ColumnView,
  Conversation,
  ConversationView,
  DepartmentId,
  Invitation,
  InvitationView,
  LoginSession,
  MeUser,
  MeWorkspace,
  MemberView,
  Message,
  MessageBody,
  MessageView,
  Note,
  NoteCategory,
  NoteCategoryView,
  NoteView,
  NotificationEvent,
  NotificationView,
  Project,
  ProjectView,
  SessionView,
  Subtask,
  SubtaskView,
  Task,
  TaskCard,
  TaskCommentView,
  TaskDetail,
  TaskStatus,
  User,
  WorkflowView,
  Workspace,
  WorkspaceView,
} from '@taskin/contracts';
import { formatMobile, monogram } from '@taskin/text';
import { DEPARTMENTS } from '@/data/reference';

/**
 * API views → the domain types the screens were built on. The screens predate the API, so a few
 * fields are derived here (a direct chat's title, a card's placement, read receipts) rather than
 * pushed into every component.
 */

/* ============================================================ people */

/** The API's departments are the workspace's own; the UI groups by the six built-in names. */
export function departmentIdFor(name: string | undefined): DepartmentId {
  return DEPARTMENTS.find((department) => department.name === name)?.id ?? 'operations';
}

/** `+989121234567` → `۰۹۱۲ ۱۲۳ ۴۵۶۷`. */
export function displayPhone(e164: string): string {
  return e164.startsWith('+98') ? formatMobile(`0${e164.slice(3)}`) : e164;
}

export function memberToUser(member: MemberView, departmentName: (id: string | null) => string | undefined): User {
  return {
    id: member.userId,
    fullName: member.fullName,
    initials: monogram(member.fullName),
    jobTitle: member.jobTitle,
    role: member.role,
    department: departmentIdFor(departmentName(member.departmentId)),
    presence: member.online ? member.presence : 'offline',
    avatarTone: member.avatarTone,
    email: member.email ?? '',
    phone: displayPhone(member.phone),
  };
}

/** The signed-in person before the member list arrives (or in a workspace-less account). */
export function meToUser(me: MeUser): User {
  return {
    id: me.id,
    fullName: me.fullName,
    initials: monogram(me.fullName),
    jobTitle: '',
    role: 'member',
    department: 'operations',
    presence: 'online',
    avatarTone: me.avatarTone,
    email: me.email ?? '',
    phone: displayPhone(me.phone),
  };
}

/* ============================================================ workspaces */

export function workspaceFromMe(entry: MeWorkspace, meId: string): Workspace {
  return {
    id: entry.id,
    name: entry.name,
    description: '',
    initials: entry.initials,
    tone: entry.tone,
    iconUrl: entry.iconUrl,
    plan: '',
    memberCount: 0,
    // Only whether the caller owns it is known from the switcher entry.
    ownerId: entry.isOwner ? meId : '',
  };
}

const PLAN_LABELS: Readonly<Record<string, string>> = { free: 'رایگان', team: 'تیمی', enterprise: 'سازمانی' };

export function workspaceFromView(view: WorkspaceView): Workspace {
  return {
    id: view.id,
    name: view.name,
    description: view.description,
    initials: view.initials,
    tone: view.tone,
    iconUrl: view.iconUrl,
    plan: PLAN_LABELS[view.planId] ?? view.planId,
    memberCount: view.memberCount,
    ownerId: view.ownerId,
  };
}

/* ============================================================ board */

export function projectFromView(view: ProjectView, departmentName: (id: string | null) => string | undefined): Project {
  return {
    id: view.id,
    name: view.name,
    departmentId: departmentIdFor(departmentName(view.departmentId)),
    color: view.color,
    starred: view.starred,
    parentId: view.parentId,
    memberIds: view.memberIds,
  };
}

/** A column of `projectId`'s board (every project has its own columns). */
export function columnFromView(view: ColumnView, projectId: string): BoardColumn {
  return { id: view.id, title: view.title, status: view.status, tone: view.tone, custom: !view.builtIn, projectId };
}

/** Every column of the given workflows, each project's in board order. */
export function columnsFromWorkflows(views: readonly WorkflowView[]): BoardColumn[] {
  return views.flatMap((view) => [...view.columns].sort(byColumnPosition).map((column) => columnFromView(column, view.projectId)));
}

const byColumnPosition = (a: ColumnView, b: ColumnView): number => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1);

/** In the UI a card on a built-in column carries `boardColumnId: null` (its status names the column). */
export function boardColumnIdFor(columns: readonly BoardColumn[], columnId: string): string | null {
  const column = columns.find((entry) => entry.id === columnId);
  return column?.custom ? column.id : null;
}

/** The API column a UI placement lands on. */
export function apiColumnFor(columns: readonly BoardColumn[], placement: { readonly status: TaskStatus; readonly boardColumnId: string | null }): BoardColumn | undefined {
  if (placement.boardColumnId !== null) {
    const named = columns.find((column) => column.id === placement.boardColumnId);
    if (named) return named;
  }
  return columns.find((column) => !column.custom && column.status === placement.status) ?? columns.find((column) => column.status === placement.status);
}

/** A list card. What only the detail holds (description, subtasks …) is kept from `previous`. */
export function taskFromCard(card: TaskCard, columns: readonly BoardColumn[], previous?: Task): Task {
  const detailed = previous !== undefined && previous.summary === undefined;
  return {
    id: card.id,
    code: card.code,
    title: card.title,
    description: previous?.description ?? '',
    status: card.status,
    priority: card.priority,
    projectId: card.projectId,
    assigneeIds: card.assigneeIds,
    reviewerId: card.reviewerId,
    startDate: card.startDate,
    // The screens always show a deadline; a task without one sits on its start date.
    dueDate: card.dueDate ?? card.startDate,
    createdAt: card.createdAt,
    subtasks: previous?.subtasks ?? [],
    attachments: previous?.attachments ?? [],
    comments: previous?.comments ?? [],
    labels: card.labelIds,
    starred: card.starred,
    sourceMessageId: card.sourceMessageId,
    boardColumnId: boardColumnIdFor(columns, card.columnId),
    reopenTo: previous?.reopenTo ?? null,
    ...(detailed
      ? {}
      : {
          summary: {
            subtasks: card.subtaskCount,
            subtasksDone: card.subtaskDoneCount,
            comments: card.commentCount,
            attachments: card.attachmentCount,
          },
        }),
  };
}

export function subtaskFromView(view: SubtaskView): Subtask {
  return { id: view.id, title: view.title, done: view.done, assigneeId: view.assigneeId };
}

export function attachmentFromView(view: AttachmentView): Attachment {
  return { id: view.id, name: view.name, kind: view.kind, size: view.size, uploadedAt: view.uploadedAt, uploadedById: view.uploadedById, url: null };
}

export function commentFromView(view: TaskCommentView): Task['comments'][number] {
  return { id: view.id, authorId: view.authorId, body: view.body, createdAt: view.createdAt, replyToId: view.replyToId };
}

export function taskFromDetail(detail: TaskDetail, columns: readonly BoardColumn[]): Task {
  const reopen = detail.reopenColumnId ? columns.find((column) => column.id === detail.reopenColumnId) : undefined;
  // Complete arrays follow, so the list-page counts (`summary`) are left out.
  const { summary, ...rest } = taskFromCard(detail, columns);
  void summary;
  return {
    ...rest,
    description: detail.description,
    subtasks: detail.subtasks.map(subtaskFromView),
    comments: detail.comments.map(commentFromView),
    attachments: detail.attachments.map(attachmentFromView),
    ...(detail.sourceMessage
      ? {
          sourceMessage: {
            accessible: detail.sourceMessage.accessible,
            conversationId: detail.sourceMessage.conversationId,
            authorId: detail.sourceMessage.authorId,
            excerpt: detail.sourceMessage.excerpt,
            deleted: detail.sourceMessage.deleted,
          },
        }
      : {}),
    reopenTo: reopen ? { status: reopen.status, boardColumnId: reopen.custom ? reopen.id : null } : null,
  };
}

/* ============================================================ chat */

/** A direct chat is named after the other person. */
export function conversationFromView(view: ConversationView, meId: string, nameOf: (userId: string) => string | undefined): Conversation {
  const other = view.memberIds.find((id) => id !== meId);
  const title = view.title ?? (other ? (nameOf(other) ?? 'گفتگوی مستقیم') : 'یادداشت‌های من');
  return {
    id: view.id,
    kind: view.kind,
    title,
    memberIds: view.memberIds,
    pinned: view.pinned,
    muted: view.mutedUntil !== null && Date.parse(view.mutedUntil) > Date.now(),
    unreadCount: view.unreadCount,
    tone: view.tone,
    topic: view.topic || (view.kind === 'direct' ? 'گفتگوی مستقیم' : view.kind === 'channel' ? 'کانال' : 'گروه تیمی'),
  };
}

const MENTION = /<@([0-9a-f-]{36})>/gi;

/** `<@userId>` tokens read as `@نام`; the stored text keeps the ids, so renames never rewrite history. */
export function renderMentions(text: string, nameOf: (userId: string) => string | undefined): string {
  return text.replace(MENTION, (token, id: string) => {
    const name = nameOf(id.toLowerCase());
    return name ? `@${name}` : token;
  });
}

function messageBody(view: MessageView, nameOf: (userId: string) => string | undefined): MessageBody {
  if (view.deleted) return { kind: 'system', text: 'این پیام حذف شد.' };
  switch (view.kind) {
    case 'text':
      return { kind: 'text', text: renderMentions(view.text ?? '', nameOf) };
    case 'voice': {
      const meta = view.meta && 'durationSec' in view.meta ? view.meta : { durationSec: 0, waveform: [] };
      return { kind: 'voice', durationSec: meta.durationSec, waveform: meta.waveform, src: null, ...(view.attachment ? { attachmentId: view.attachment.id } : {}) };
    }
    case 'file':
      return view.attachment
        ? { kind: 'file', attachment: attachmentFromView(view.attachment), caption: view.text }
        : { kind: 'text', text: view.text ?? '' };
    case 'system':
      return { kind: 'system', text: systemText(view) };
  }
}

function systemText(view: MessageView): string {
  if (view.text) return view.text;
  const meta = view.meta && 'type' in view.meta ? view.meta : null;
  if (meta?.type === 'message_converted') return `پیامی به وظیفه ${meta.params.code ?? ''} تبدیل شد.`;
  return 'رویداد گفتگو';
}

export function messageFromView(view: MessageView, readByIds: readonly string[], nameOf: (userId: string) => string | undefined): Message {
  return {
    id: view.id,
    conversationId: view.conversationId,
    authorId: view.authorId ?? '',
    sentAt: view.createdAt,
    body: messageBody(view, nameOf),
    replyToId: view.replyToId,
    reactions: view.reactions.map((reaction) => ({ emoji: reaction.emoji, userIds: reaction.userIds })),
    edited: view.editedAt !== null,
    linkedTaskId: view.linkedTaskId,
    readByIds,
  };
}

/* ============================================================ calendar, notes */

export function eventFromView(view: CalendarEventView): CalendarEvent {
  return {
    id: view.id,
    kind: view.kind,
    title: view.title,
    date: view.date,
    startTime: view.startTime,
    endTime: view.endTime,
    projectId: view.projectId,
    attendeeIds: view.attendeeIds,
    description: view.description,
  };
}

export function noteCategoryFromView(view: NoteCategoryView): NoteCategory {
  return { id: view.id, label: view.label, builtIn: view.builtIn };
}

export function noteFromView(view: NoteView): Note {
  return {
    id: view.id,
    categoryId: view.categoryId,
    title: view.title,
    body: view.body,
    colors: view.colors,
    pinned: view.pinned,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    linkedTaskId: view.linkedTaskId,
  };
}

/* ============================================================ notifications, activity */

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'in-progress', 'review', 'done'];
const status = (value: unknown): TaskStatus => (TASK_STATUSES.includes(value as TaskStatus) ? (value as TaskStatus) : 'todo');

/** `null` for kinds the notification centre does not show (invitations, reminders, new members). */
export function notificationFromView(view: NotificationView): AppNotification | null {
  let event: NotificationEvent;
  switch (view.kind) {
    case 'task-assigned':
      event = { kind: 'task-assigned' };
      break;
    case 'status-changed':
      event = { kind: 'status-changed', from: status(view.payload.from), to: status(view.payload.to) };
      break;
    case 'comment':
      event = { kind: 'comment', excerpt: text(view.payload.excerpt) };
      break;
    case 'mention':
      event = { kind: 'mention', excerpt: text(view.payload.excerpt) };
      break;
    case 'reply':
      event = { kind: 'reply', excerpt: text(view.payload.excerpt) };
      break;
    default:
      return null;
  }
  const conversationId = text(view.payload.conversationId) || view.targetId;
  return {
    id: view.id,
    actorId: view.actorId ?? '',
    createdAt: view.createdAt,
    read: view.read,
    event,
    subject: view.subject,
    target: view.targetType === 'task' ? { kind: 'task', taskId: view.targetId } : { kind: 'conversation', conversationId },
  };
}

export function activityFromView(view: ActivityView): ActivityItem {
  return {
    id: view.id,
    kind: view.kind,
    actorId: view.actorId ?? '',
    createdAt: view.createdAt,
    targetTitle: view.targetTitle,
    targetId: view.targetId,
    context: view.context,
  };
}

/* ============================================================ account */

export function invitationFromView(view: InvitationView, departmentName: (id: string | null) => string | undefined): Invitation {
  return {
    id: view.id,
    address: view.address,
    channel: view.channel,
    role: view.role,
    department: departmentIdFor(departmentName(view.departmentId)),
    message: view.message,
    invitedAt: view.createdAt,
    invitedById: view.invitedById,
  };
}

export function sessionFromView(view: SessionView): LoginSession {
  return {
    id: view.id,
    device: view.deviceLabel ?? view.userAgent ?? 'دستگاه ناشناس',
    location: view.city ?? view.ip ?? '—',
    lastActiveAt: view.lastActiveAt,
    current: view.current,
  };
}

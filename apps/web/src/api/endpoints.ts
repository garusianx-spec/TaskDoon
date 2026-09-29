import type {
  AcceptInvitationResult,
  AttachmentView,
  CompleteUploadBody,
  ConvertMessageBody,
  ConvertMessageResult,
  CreateUploadBody,
  FileLink,
  MediaPage,
  MediaTab,
  MoveSubtaskBody,
  UploadTicket,
  UploadView,
  ActivityPage,
  CalendarEventView,
  CalendarView,
  ColumnDisposition,
  ConversationDetail,
  ConversationView,
  ConvertNoteBody,
  ConvertNoteResult,
  CreateCalendarEventBody,
  CreateColumnBody,
  CreateConversationBody,
  CreateInvitationsBody,
  CreateInvitationsResult,
  CreateNoteBody,
  CreateProjectBody,
  CreateTaskBody,
  CreateWorkspaceBody,
  InvitationView,
  ManualPresence,
  MeResponse,
  MemberView,
  MessagePage,
  NoteCategoryView,
  NotePage,
  NoteView,
  NotificationFilter,
  NotificationPage,
  ProjectView,
  RoleView,
  SessionView,
  SubtaskView,
  TaskCard,
  TaskCommentView,
  TaskDetail,
  TaskPage,
  UpdateColumnBody,
  UpdateMyConversationBody,
  UpdateNoteBody,
  UpdateSubtaskBody,
  UpdateTaskBody,
  WorkflowView,
  WorkspaceView,
  TrashedProjectView,
} from '@taskin/contracts';
import { http, query } from './http';

/**
 * The REST calls the web app makes, one typed function each. Tenant routes take the workspace
 * id first; bodies and results are the `@taskin/contracts` types the API implements.
 */

const ws = (workspaceId: string) => `/workspaces/${workspaceId}`;

/** Follows `nextCursor` until the end (lists the app keeps whole, such as the tasks). */
async function everyPage<T>(fetchPage: (cursor: string | null) => Promise<{ readonly items: readonly T[]; readonly nextCursor: string | null }>, max = 50): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < max; page += 1) {
    const result = await fetchPage(cursor);
    items.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return items;
}

export const api = {
  me: {
    get: () => http.get<MeResponse>('/me'),
    notifications: (params: { readonly workspaceId?: string; readonly filter?: NotificationFilter; readonly limit?: number }) =>
      http.get<NotificationPage>(`/me/notifications${query(params)}`),
    markNotificationsRead: (body: { readonly ids?: readonly string[]; readonly all?: boolean; readonly workspaceId?: string }) =>
      http.post<{ readonly marked: number }>('/me/notifications/read', body),
  },

  sessions: {
    list: () => http.get<SessionView[]>('/auth/sessions'),
    revoke: (sessionId: string) => http.delete<void>(`/auth/sessions/${sessionId}`),
    revokeOthers: () => http.delete<void>(`/auth/sessions${query({ others: true })}`),
  },

  workspaces: {
    create: (body: CreateWorkspaceBody) => http.post<WorkspaceView>('/workspaces', body, { idempotent: true }),
    get: (workspaceId: string) => http.get<WorkspaceView>(ws(workspaceId)),
    remove: (workspaceId: string, confirmName: string) => http.delete<void>(ws(workspaceId), { confirmName }),
    /** `includeFormer`: also people removed from the workspace (names only), for the history they left. */
    members: (workspaceId: string, includeFormer = false) => http.get<MemberView[]>(`${ws(workspaceId)}/members${query({ includeFormer: includeFormer || undefined })}`),
    removeMember: (workspaceId: string, userId: string) => http.delete<void>(`${ws(workspaceId)}/members/${userId}`),
    setPresence: (workspaceId: string, presence: ManualPresence, statusMessage: string) =>
      http.patch<void>(`${ws(workspaceId)}/me/presence`, { presence, statusMessage }),
    roles: (workspaceId: string) => http.get<RoleView[]>(`${ws(workspaceId)}/roles`),
    invitations: (workspaceId: string) => http.get<InvitationView[]>(`${ws(workspaceId)}/invitations`),
    invite: (workspaceId: string, body: CreateInvitationsBody) =>
      http.post<CreateInvitationsResult>(`${ws(workspaceId)}/invitations`, body, { idempotent: true }),
    revokeInvitation: (workspaceId: string, invitationId: string) => http.delete<void>(`${ws(workspaceId)}/invitations/${invitationId}`),
    acceptInvitation: (token: string) => http.post<AcceptInvitationResult>('/invitations/accept', { token }),
  },

  files: {
    plan: (workspaceId: string, body: CreateUploadBody) => http.post<UploadView>(`${ws(workspaceId)}/files/uploads`, body, { idempotent: true }),
    complete: (workspaceId: string, attachmentId: string, body: CompleteUploadBody = {}) =>
      http.post<AttachmentView>(`${ws(workspaceId)}/files/uploads/${attachmentId}/complete`, body),
    abort: (workspaceId: string, attachmentId: string) => http.post<void>(`${ws(workspaceId)}/files/uploads/${attachmentId}/abort`),
    link: (workspaceId: string, attachmentId: string, disposition: FileLink['disposition']) =>
      http.get<FileLink>(`${ws(workspaceId)}/files/${attachmentId}/link${query({ disposition })}`),
    iconTicket: () => http.post<UploadTicket>('/uploads/workspace-icon'),
  },

  projects: {
    list: (workspaceId: string) => http.get<ProjectView[]>(`${ws(workspaceId)}/projects`),
    create: (workspaceId: string, body: CreateProjectBody) => http.post<ProjectView>(`${ws(workspaceId)}/projects`, body, { idempotent: true }),
    star: (workspaceId: string, projectId: string, starred: boolean) =>
      starred ? http.put<void>(`${ws(workspaceId)}/projects/${projectId}/star`) : http.delete<void>(`${ws(workspaceId)}/projects/${projectId}/star`),
    /** To the trash (workspace owner): restorable for 40 days. */
    remove: (workspaceId: string, projectId: string) => http.delete<void>(`${ws(workspaceId)}/projects/${projectId}`),
    trash: (workspaceId: string) => http.get<TrashedProjectView[]>(`${ws(workspaceId)}/projects/trash`),
    restore: (workspaceId: string, projectId: string) => http.post<ProjectView>(`${ws(workspaceId)}/projects/${projectId}/restore`),
  },

  workflow: {
    /** One project's board columns: every project has its own. */
    get: (workspaceId: string, projectId: string) => http.get<WorkflowView>(`${ws(workspaceId)}/workflow?projectId=${projectId}`),
    /** Every visible project's board columns, in one request. */
    list: (workspaceId: string) => http.get<WorkflowView[]>(`${ws(workspaceId)}/workflows`),
    addColumn: (workspaceId: string, body: CreateColumnBody) => http.post<WorkflowView>(`${ws(workspaceId)}/workflow/columns`, body, { idempotent: true }),
    updateColumn: (workspaceId: string, columnId: string, body: UpdateColumnBody) =>
      http.patch<WorkflowView>(`${ws(workspaceId)}/workflow/columns/${columnId}`, body),
    removeColumn: (workspaceId: string, columnId: string, disposition?: ColumnDisposition) =>
      http.delete<void>(`${ws(workspaceId)}/workflow/columns/${columnId}`, disposition ? { disposition } : {}),
  },

  tasks: {
    /** Every live task the member can see, page by page. */
    all: (workspaceId: string) =>
      everyPage<TaskCard>((cursor) => http.get<TaskPage>(`${ws(workspaceId)}/tasks${query({ limit: 200, cursor })}`)),
    get: (workspaceId: string, taskId: string) => http.get<TaskDetail>(`${ws(workspaceId)}/tasks/${taskId}`),
    create: (workspaceId: string, body: CreateTaskBody) => http.post<TaskDetail>(`${ws(workspaceId)}/tasks`, body, { idempotent: true }),
    update: (workspaceId: string, taskId: string, version: number, body: UpdateTaskBody) =>
      http.patch<TaskDetail>(`${ws(workspaceId)}/tasks/${taskId}`, body, { ifMatch: version }),
    move: (workspaceId: string, taskId: string, body: { readonly columnId: string; readonly afterId?: string | null; readonly beforeId?: string | null; readonly expectedVersion: number }) =>
      http.post<TaskCard>(`${ws(workspaceId)}/tasks/${taskId}/move`, body),
    complete: (workspaceId: string, taskId: string, completed: boolean, expectedVersion?: number) =>
      http.post<TaskCard>(`${ws(workspaceId)}/tasks/${taskId}/complete`, { completed, ...(expectedVersion === undefined ? {} : { expectedVersion }) }),
    star: (workspaceId: string, taskId: string, starred: boolean) =>
      starred ? http.put<void>(`${ws(workspaceId)}/tasks/${taskId}/star`) : http.delete<void>(`${ws(workspaceId)}/tasks/${taskId}/star`),
    addSubtask: (workspaceId: string, taskId: string, title: string) =>
      http.post<SubtaskView>(`${ws(workspaceId)}/tasks/${taskId}/subtasks`, { title }),
    updateSubtask: (workspaceId: string, taskId: string, subtaskId: string, body: UpdateSubtaskBody) =>
      http.patch<SubtaskView>(`${ws(workspaceId)}/tasks/${taskId}/subtasks/${subtaskId}`, body),
    moveSubtask: (workspaceId: string, taskId: string, subtaskId: string, body: MoveSubtaskBody) =>
      http.post<SubtaskView>(`${ws(workspaceId)}/tasks/${taskId}/subtasks/${subtaskId}/move`, body),
    attach: (workspaceId: string, taskId: string, attachmentId: string) => http.post<void>(`${ws(workspaceId)}/tasks/${taskId}/attachments`, { attachmentId }),
    detach: (workspaceId: string, taskId: string, attachmentId: string) => http.delete<void>(`${ws(workspaceId)}/tasks/${taskId}/attachments/${attachmentId}`),
    removeSubtask: (workspaceId: string, taskId: string, subtaskId: string) =>
      http.delete<void>(`${ws(workspaceId)}/tasks/${taskId}/subtasks/${subtaskId}`),
    comment: (workspaceId: string, taskId: string, body: string, replyToId: string | null) =>
      http.post<TaskCommentView>(`${ws(workspaceId)}/tasks/${taskId}/comments`, { body, replyToId }),
  },

  conversations: {
    list: (workspaceId: string) => http.get<ConversationView[]>(`${ws(workspaceId)}/conversations`),
    get: (workspaceId: string, conversationId: string) => http.get<ConversationDetail>(`${ws(workspaceId)}/conversations/${conversationId}`),
    create: (workspaceId: string, body: CreateConversationBody) =>
      http.post<ConversationDetail>(`${ws(workspaceId)}/conversations`, body, { idempotent: true }),
    updateMine: (workspaceId: string, conversationId: string, body: UpdateMyConversationBody) =>
      http.put<ConversationView>(`${ws(workspaceId)}/conversations/${conversationId}/me`, body),
    messages: (workspaceId: string, conversationId: string, params: { readonly beforeSeq?: number; readonly afterSeq?: number; readonly limit?: number }) =>
      http.get<MessagePage>(`${ws(workspaceId)}/conversations/${conversationId}/messages${query(params)}`),
    media: (workspaceId: string, conversationId: string, tab: MediaTab, cursor?: string) =>
      http.get<MediaPage>(`${ws(workspaceId)}/conversations/${conversationId}/media${query({ tab, limit: 100, ...(cursor ? { cursor } : {}) })}`),
    /** «تبدیل پیام به وظیفه». */
    convert: (workspaceId: string, conversationId: string, messageId: string, body: ConvertMessageBody) =>
      http.post<ConvertMessageResult>(`${ws(workspaceId)}/conversations/${conversationId}/messages/${messageId}/task`, body, { idempotent: true }),
  },

  calendar: {
    range: (workspaceId: string, from: string, to: string) => http.get<CalendarView>(`${ws(workspaceId)}/calendar${query({ from, to })}`),
    create: (workspaceId: string, body: CreateCalendarEventBody) =>
      http.post<CalendarEventView>(`${ws(workspaceId)}/calendar/events`, body, { idempotent: true }),
  },

  notes: {
    categories: (workspaceId: string) => http.get<NoteCategoryView[]>(`${ws(workspaceId)}/note-categories`),
    createCategory: (workspaceId: string, label: string) => http.post<NoteCategoryView>(`${ws(workspaceId)}/note-categories`, { label }, { idempotent: true }),
    removeCategory: (workspaceId: string, categoryId: string) => http.delete<void>(`${ws(workspaceId)}/note-categories/${categoryId}`),
    all: (workspaceId: string) => everyPage<NoteView>((cursor) => http.get<NotePage>(`${ws(workspaceId)}/notes${query({ limit: 100, cursor })}`)),
    create: (workspaceId: string, body: CreateNoteBody) => http.post<NoteView>(`${ws(workspaceId)}/notes`, body, { idempotent: true }),
    update: (workspaceId: string, noteId: string, version: number, body: UpdateNoteBody) =>
      http.patch<NoteView>(`${ws(workspaceId)}/notes/${noteId}`, body, { ifMatch: version }),
    remove: (workspaceId: string, noteId: string) => http.delete<void>(`${ws(workspaceId)}/notes/${noteId}`),
    /** "تبدیل یادداشت به وظیفه": open checklist items become subtasks. */
    convert: (workspaceId: string, noteId: string, body: ConvertNoteBody) => http.post<ConvertNoteResult>(`${ws(workspaceId)}/notes/${noteId}/task`, body, { idempotent: true }),
  },

  activity: (workspaceId: string, limit = 50) => http.get<ActivityPage>(`${ws(workspaceId)}/activity${query({ limit })}`),
};

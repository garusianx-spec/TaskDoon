import type {
MoveSubtaskBody,
CreateTaskBody,
SubtaskView,
TaskCard,
TaskCommentView,
TaskDetail,
TaskPage,
UpdateSubtaskBody,
UpdateTaskBody,
} from '@taskin/contracts';
import { http,query } from '@/lib/api-client';
import { workspacePath,everyPage } from '@/lib/api-routing';

export const tasksEndpoints = {
  tasks: {
    /** Every live task the member can see, page by page. */
    all: (workspaceId: string) =>
      everyPage<TaskCard>((cursor) => http.get<TaskPage>(`${workspacePath(workspaceId)}/tasks${query({ limit: 200, cursor })}`)),
    get: (workspaceId: string, taskId: string) => http.get<TaskDetail>(`${workspacePath(workspaceId)}/tasks/${taskId}`),
    create: (workspaceId: string, body: CreateTaskBody, idempotencyKey?: string) =>
      http.post<TaskDetail>(`${workspacePath(workspaceId)}/tasks`, body, { idempotent: true, ...(idempotencyKey ? { idempotencyKey } : {}) }),
    update: (workspaceId: string, taskId: string, version: number, body: UpdateTaskBody) =>
      http.patch<TaskDetail>(`${workspacePath(workspaceId)}/tasks/${taskId}`, body, { ifMatch: version }),
    move: (workspaceId: string, taskId: string, body: { readonly columnId: string; readonly afterId?: string | null; readonly beforeId?: string | null; readonly expectedVersion: number }) =>
      http.post<TaskCard>(`${workspacePath(workspaceId)}/tasks/${taskId}/move`, body),
    complete: (workspaceId: string, taskId: string, completed: boolean, expectedVersion?: number) =>
      http.post<TaskCard>(`${workspacePath(workspaceId)}/tasks/${taskId}/complete`, { completed, ...(expectedVersion === undefined ? {} : { expectedVersion }) }),
    star: (workspaceId: string, taskId: string, starred: boolean) =>
      starred ? http.put<void>(`${workspacePath(workspaceId)}/tasks/${taskId}/star`) : http.delete<void>(`${workspacePath(workspaceId)}/tasks/${taskId}/star`),
    addSubtask: (workspaceId: string, taskId: string, title: string) =>
      http.post<SubtaskView>(`${workspacePath(workspaceId)}/tasks/${taskId}/subtasks`, { title }),
    updateSubtask: (workspaceId: string, taskId: string, subtaskId: string, body: UpdateSubtaskBody) =>
      http.patch<SubtaskView>(`${workspacePath(workspaceId)}/tasks/${taskId}/subtasks/${subtaskId}`, body),
    moveSubtask: (workspaceId: string, taskId: string, subtaskId: string, body: MoveSubtaskBody) =>
      http.post<SubtaskView>(`${workspacePath(workspaceId)}/tasks/${taskId}/subtasks/${subtaskId}/move`, body),
    attach: (workspaceId: string, taskId: string, attachmentId: string) => http.post<void>(`${workspacePath(workspaceId)}/tasks/${taskId}/attachments`, { attachmentId }),
    detach: (workspaceId: string, taskId: string, attachmentId: string) => http.delete<void>(`${workspacePath(workspaceId)}/tasks/${taskId}/attachments/${attachmentId}`),
    removeSubtask: (workspaceId: string, taskId: string, subtaskId: string) =>
      http.delete<void>(`${workspacePath(workspaceId)}/tasks/${taskId}/subtasks/${subtaskId}`),
    comment: (workspaceId: string, taskId: string, body: string, replyToId: string | null) =>
      http.post<TaskCommentView>(`${workspacePath(workspaceId)}/tasks/${taskId}/comments`, { body, replyToId }),
  },
};

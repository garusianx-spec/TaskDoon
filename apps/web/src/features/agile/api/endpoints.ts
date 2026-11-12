import type {
CreateDependencyBody,
CreateWorklogBody,
TaskDependencyView,
WorklogList,
WorklogView,
} from '@taskin/contracts';
import { http } from '@/lib/api-client';
import { workspacePath } from '@/lib/api-routing';

const agileBase = (workspaceId: string, projectId: string, taskId: string) => `${workspacePath(workspaceId)}/projects/${projectId}/tasks/${taskId}`;

export const agileEndpoints = {
  /** Agile tracking on one task, addressed through its project. */
  agile: {
    worklogs: (workspaceId: string, projectId: string, taskId: string) => http.get<WorklogList>(`${agileBase(workspaceId, projectId, taskId)}/worklogs`),
    logWork: (workspaceId: string, projectId: string, taskId: string, body: CreateWorklogBody) =>
      http.post<WorklogView>(`${agileBase(workspaceId, projectId, taskId)}/worklogs`, body, { idempotent: true }),
    removeWorklog: (workspaceId: string, projectId: string, taskId: string, worklogId: string) =>
      http.delete<void>(`${agileBase(workspaceId, projectId, taskId)}/worklogs/${worklogId}`),
    dependencies: (workspaceId: string, projectId: string, taskId: string) =>
      http.get<TaskDependencyView[]>(`${agileBase(workspaceId, projectId, taskId)}/dependencies`),
    link: (workspaceId: string, projectId: string, taskId: string, body: CreateDependencyBody) =>
      http.post<TaskDependencyView>(`${agileBase(workspaceId, projectId, taskId)}/dependencies`, body),
    unlink: (workspaceId: string, projectId: string, taskId: string, dependencyId: string) =>
      http.delete<void>(`${agileBase(workspaceId, projectId, taskId)}/dependencies/${dependencyId}`),
  },
};

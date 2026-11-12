import type {
  ColumnDisposition,
  CreateColumnBody,
  CreateProjectBody,
  ProjectView,
  UpdateColumnBody,
  WorkflowView,
  TrashedProjectView,
} from '@taskin/contracts';
import { http } from '@/lib/api-client';
import { workspacePath } from '@/lib/api-routing';

export const boardEndpoints = {
  projects: {
    list: (workspaceId: string) => http.get<ProjectView[]>(`${workspacePath(workspaceId)}/projects`),
    create: (workspaceId: string, body: CreateProjectBody, idempotencyKey?: string) =>
      http.post<ProjectView>(`${workspacePath(workspaceId)}/projects`, body, {
        idempotent: true,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }),
    star: (workspaceId: string, projectId: string, starred: boolean) =>
      starred
        ? http.put<void>(`${workspacePath(workspaceId)}/projects/${projectId}/star`)
        : http.delete<void>(`${workspacePath(workspaceId)}/projects/${projectId}/star`),
    /** To the trash (workspace owner): restorable for 40 days. */
    remove: (workspaceId: string, projectId: string) =>
      http.delete<void>(`${workspacePath(workspaceId)}/projects/${projectId}`),
    trash: (workspaceId: string) =>
      http.get<TrashedProjectView[]>(`${workspacePath(workspaceId)}/projects/trash`),
    restore: (workspaceId: string, projectId: string) =>
      http.post<ProjectView>(`${workspacePath(workspaceId)}/projects/${projectId}/restore`),
  },

  workflow: {
    /** One project's board columns: every project has its own. */
    get: (workspaceId: string, projectId: string) =>
      http.get<WorkflowView>(`${workspacePath(workspaceId)}/workflow?projectId=${projectId}`),
    /** Every visible project's board columns, in one request. */
    list: (workspaceId: string) => http.get<WorkflowView[]>(`${workspacePath(workspaceId)}/workflows`),
    addColumn: (workspaceId: string, body: CreateColumnBody) =>
      http.post<WorkflowView>(`${workspacePath(workspaceId)}/workflow/columns`, body, { idempotent: true }),
    updateColumn: (workspaceId: string, columnId: string, body: UpdateColumnBody) =>
      http.patch<WorkflowView>(`${workspacePath(workspaceId)}/workflow/columns/${columnId}`, body),
    removeColumn: (workspaceId: string, columnId: string, disposition?: ColumnDisposition) =>
      http.delete<void>(
        `${workspacePath(workspaceId)}/workflow/columns/${columnId}`,
        disposition ? { disposition } : {},
      ),
  },
};

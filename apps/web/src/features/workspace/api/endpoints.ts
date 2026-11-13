import type {
  AcceptInvitationResult,
  ActivityPage,
  CreateInvitationsBody,
  CreateInvitationsResult,
  CreateDepartmentBody,
  DepartmentView,
  CreateWorkspaceBody,
  InvitationView,
  ManualPresence,
  MemberView,
  RoleView,
  WorkspaceView,
  UpdateWorkspaceBody,
} from '@taskin/contracts';
import { http, query } from '@/lib/api-client';
import { workspacePath } from '@/lib/api-routing';

export const workspaceEndpoints = {
  workspaces: {
    create: (body: CreateWorkspaceBody) =>
      http.post<WorkspaceView>('/workspaces', body, { idempotent: true }),
    get: (workspaceId: string) => http.get<WorkspaceView>(workspacePath(workspaceId)),
    update: (workspaceId: string, body: UpdateWorkspaceBody) =>
      http.patch<WorkspaceView>(workspacePath(workspaceId), body),
    remove: (workspaceId: string, confirmName: string) =>
      http.delete<void>(workspacePath(workspaceId), { confirmName }),
    /** `includeFormer`: also people removed from the workspace (names only), for the history they left. */
    members: (workspaceId: string, includeFormer = false) =>
      http.get<MemberView[]>(
        `${workspacePath(workspaceId)}/members${query({ includeFormer: includeFormer || undefined })}`,
      ),
    removeMember: (workspaceId: string, userId: string) =>
      http.delete<void>(`${workspacePath(workspaceId)}/members/${userId}`),
    setPresence: (workspaceId: string, presence: ManualPresence, statusMessage: string) =>
      http.patch<void>(`${workspacePath(workspaceId)}/me/presence`, { presence, statusMessage }),
    roles: (workspaceId: string) => http.get<RoleView[]>(`${workspacePath(workspaceId)}/roles`),
    invitations: (workspaceId: string) =>
      http.get<InvitationView[]>(`${workspacePath(workspaceId)}/invitations`),
    invite: (workspaceId: string, body: CreateInvitationsBody, idempotencyKey?: string) =>
      http.post<CreateInvitationsResult>(`${workspacePath(workspaceId)}/invitations`, body, {
        ...(idempotencyKey ? { idempotencyKey } : { idempotent: true }),
      }),
    revokeInvitation: (workspaceId: string, invitationId: string) =>
      http.delete<void>(`${workspacePath(workspaceId)}/invitations/${invitationId}`),
    acceptInvitation: (token: string) => http.post<AcceptInvitationResult>('/invitations/accept', { token }),
  },

  departments: {
    list: (workspaceId: string) => http.get<DepartmentView[]>(`${workspacePath(workspaceId)}/departments`),
    create: (workspaceId: string, body: CreateDepartmentBody, idempotencyKey?: string) =>
      http.post<DepartmentView>(`${workspacePath(workspaceId)}/departments`, body, {
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }),
  },

  activity: (workspaceId: string, limit = 50) =>
    http.get<ActivityPage>(`${workspacePath(workspaceId)}/activity${query({ limit })}`),
};

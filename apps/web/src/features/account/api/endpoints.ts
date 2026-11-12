import type {
UpdateWorkingHoursBody,
WorkingHoursView,
MeResponse,
MeUser,
UpdateMeBody,
NotificationFilter,
NotificationPage,
SessionView,
} from '@taskin/contracts';
import { http,query } from '@/lib/api-client';
import { workspacePath } from '@/lib/api-routing';

export const accountEndpoints = {
  me: {
    get: () => http.get<MeResponse>('/me'),
    update: (body: UpdateMeBody) => http.patch<MeUser>('/me', body),
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

  /** Phase 3.2: working hours and the out-of-office auto-reply, per workspace. */
  workingHours: {
    get: (workspaceId: string) => http.get<WorkingHoursView>(`${workspacePath(workspaceId)}/me/working-hours`),
    put: (workspaceId: string, body: UpdateWorkingHoursBody) => http.put<WorkingHoursView>(`${workspacePath(workspaceId)}/me/working-hours`, body),
  },
};

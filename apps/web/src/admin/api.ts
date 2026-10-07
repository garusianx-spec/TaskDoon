import type {
  CreateBroadcastBody,
  UpdateBroadcastBody,
  SystemBroadcastPage,
  SystemBroadcastView,
  PlatformMetrics,
  PlatformHealth,
  PlatformOutboxHealth,
  PasswordResetChannel,
  PasswordResetIssued,
  PasswordResetRequiredBody,
  PlatformAdminMe,
  PlatformAttachmentLink,
  PlatformAuditPage,
  PlatformConversationDetail,
  PlatformConversationView,
  PlatformMessagePage,
  PlatformMessageType,
  PlatformModerationResult,
  PlatformSessionsRevoked,
  PlatformSessionView,
  PlatformUserDetail,
  PlatformUserPage,
  PlatformUserStatus,
  PlatformWorkspaceDetail,
  PlatformWorkspaceModerationResult,
  PlatformWorkspacePage,
  PlatformWorkspaceStatus,
  WorkspaceLimitsBody,
} from '@taskin/contracts';
import { http, query } from '@/api/http';

export interface UserFilters {
  readonly q?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly status?: PlatformUserStatus | '';
  readonly platformRole?: 'admin' | 'user' | '';
  readonly cursor?: string | null;
}

export interface MessageFilters {
  readonly from?: string;
  readonly to?: string;
  readonly type?: PlatformMessageType | '';
  readonly senderId?: string;
  readonly beforeSeq?: number | null;
  /** The person being inspected, recorded in the platform audit log. */
  readonly targetUserId?: string | null;
}

/**
 * The platform admin API (`/api/v1/admin/*`). Every call but `me` needs a password step-up in the
 * last 15 minutes and answers STEP_UP_REQUIRED otherwise; the shell turns that into its prompt.
 */
export const adminApi = {
  me: () => http.get<PlatformAdminMe>('/admin/me'),

  broadcasts: (filters: { readonly cursor?: string | null; readonly includeArchived?: boolean } = {}) =>
    http.get<SystemBroadcastPage>(`/admin/broadcasts${query({ ...filters, limit: 50 })}`),
  createBroadcast: (body: CreateBroadcastBody) => http.post<SystemBroadcastView>('/admin/broadcasts', body),
  updateBroadcast: (id: string, body: UpdateBroadcastBody) => http.patch<SystemBroadcastView>(`/admin/broadcasts/${id}`, body),
  archiveBroadcast: (id: string) => http.delete<void>(`/admin/broadcasts/${id}`),
  metrics: () => http.get<PlatformMetrics>('/admin/metrics'),
  health: () => http.get<PlatformHealth>('/admin/health'),
  outboxHealth: () => http.get<PlatformOutboxHealth>('/admin/health/outbox'),

  users: (filters: UserFilters) => http.get<PlatformUserPage>(`/admin/users${query({ ...filters, limit: 50 })}`),
  user: (userId: string) => http.get<PlatformUserDetail>(`/admin/users/${userId}`),
  sessions: (userId: string, status: 'active' | 'revoked' | 'all' = 'all') =>
    http.get<PlatformSessionView[]>(`/admin/users/${userId}/sessions${query({ status })}`),
  revokeSession: (sessionId: string) => http.post<void>(`/admin/sessions/${sessionId}/revoke`),
  revokeAll: (userId: string) => http.post<PlatformSessionsRevoked>(`/admin/users/${userId}/sessions/revoke-all`),
  issueReset: (userId: string, channel: PasswordResetChannel) => http.post<PasswordResetIssued>(`/admin/users/${userId}/password-reset`, { channel }),

  /** Moderation (phase 2): each takes effect at once and is recorded with its reason. */
  suspend: (userId: string, reason: string) => http.post<PlatformModerationResult>(`/admin/users/${userId}/suspend`, { reason }),
  unsuspend: (userId: string, reason?: string) => http.post<PlatformModerationResult>(`/admin/users/${userId}/unsuspend`, reason ? { reason } : {}),
  setPasswordResetRequired: (userId: string, body: PasswordResetRequiredBody) =>
    http.put<PlatformModerationResult>(`/admin/users/${userId}/password-reset-required`, body),

  conversations: (userId: string) => http.get<PlatformConversationView[]>(`/admin/users/${userId}/conversations`),
  conversation: (conversationId: string, targetUserId?: string | null) =>
    http.get<PlatformConversationDetail>(`/admin/conversations/${conversationId}${query({ targetUserId })}`),
  messages: (conversationId: string, filters: MessageFilters) =>
    http.get<PlatformMessagePage>(`/admin/conversations/${conversationId}/messages${query({ ...filters, limit: 50 })}`),
  attachmentLink: (attachmentId: string, targetUserId?: string | null) =>
    http.get<PlatformAttachmentLink>(`/admin/attachments/${attachmentId}/link${query({ targetUserId })}`),

  workspaces: (q: string, cursor?: string | null, status?: PlatformWorkspaceStatus | '') =>
    http.get<PlatformWorkspacePage>(`/admin/workspaces${query({ q, cursor, status, limit: 50 })}`),
  workspace: (workspaceId: string) => http.get<PlatformWorkspaceDetail>(`/admin/workspaces/${workspaceId}`),

  /** Workspace moderation (phase 3): each takes effect at once and is recorded with its reason. */
  suspendWorkspace: (workspaceId: string, reason: string) =>
    http.post<PlatformWorkspaceModerationResult>(`/admin/workspaces/${workspaceId}/suspend`, { reason }),
  unsuspendWorkspace: (workspaceId: string, reason?: string) =>
    http.post<PlatformWorkspaceModerationResult>(`/admin/workspaces/${workspaceId}/unsuspend`, reason ? { reason } : {}),
  transferWorkspaceOwnership: (workspaceId: string, userId: string, reason: string) =>
    http.post<PlatformWorkspaceModerationResult>(`/admin/workspaces/${workspaceId}/transfer-ownership`, { userId, reason }),
  setWorkspaceLimits: (workspaceId: string, body: WorkspaceLimitsBody) =>
    http.put<PlatformWorkspaceModerationResult>(`/admin/workspaces/${workspaceId}/limits`, body),

  audit: (filters: { readonly targetUserId?: string; readonly action?: string; readonly cursor?: string | null }) =>
    http.get<PlatformAuditPage>(`/admin/audit${query({ ...filters, limit: 50 })}`),
};

/** The person's side of a reset: no session needed, the code is the credential. */
export function completePasswordReset(token: string, newPassword: string): Promise<void> {
  return http.post<void>('/password-reset', { token, newPassword }, { authenticated: false });
}

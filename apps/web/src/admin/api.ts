import type {
  PasswordResetChannel,
  PasswordResetIssued,
  PlatformAdminMe,
  PlatformAttachmentLink,
  PlatformAuditPage,
  PlatformConversationDetail,
  PlatformConversationView,
  PlatformMessagePage,
  PlatformMessageType,
  PlatformSessionsRevoked,
  PlatformSessionView,
  PlatformUserDetail,
  PlatformUserPage,
  PlatformUserStatus,
  PlatformWorkspaceDetail,
  PlatformWorkspacePage,
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

  users: (filters: UserFilters) => http.get<PlatformUserPage>(`/admin/users${query({ ...filters, limit: 50 })}`),
  user: (userId: string) => http.get<PlatformUserDetail>(`/admin/users/${userId}`),
  sessions: (userId: string, status: 'active' | 'revoked' | 'all' = 'all') =>
    http.get<PlatformSessionView[]>(`/admin/users/${userId}/sessions${query({ status })}`),
  revokeSession: (sessionId: string) => http.post<void>(`/admin/sessions/${sessionId}/revoke`),
  revokeAll: (userId: string) => http.post<PlatformSessionsRevoked>(`/admin/users/${userId}/sessions/revoke-all`),
  issueReset: (userId: string, channel: PasswordResetChannel) => http.post<PasswordResetIssued>(`/admin/users/${userId}/password-reset`, { channel }),

  conversations: (userId: string) => http.get<PlatformConversationView[]>(`/admin/users/${userId}/conversations`),
  conversation: (conversationId: string, targetUserId?: string | null) =>
    http.get<PlatformConversationDetail>(`/admin/conversations/${conversationId}${query({ targetUserId })}`),
  messages: (conversationId: string, filters: MessageFilters) =>
    http.get<PlatformMessagePage>(`/admin/conversations/${conversationId}/messages${query({ ...filters, limit: 50 })}`),
  attachmentLink: (attachmentId: string, targetUserId?: string | null) =>
    http.get<PlatformAttachmentLink>(`/admin/attachments/${attachmentId}/link${query({ targetUserId })}`),

  workspaces: (q: string, cursor?: string | null) => http.get<PlatformWorkspacePage>(`/admin/workspaces${query({ q, cursor, limit: 50 })}`),
  workspace: (workspaceId: string) => http.get<PlatformWorkspaceDetail>(`/admin/workspaces/${workspaceId}`),

  audit: (filters: { readonly targetUserId?: string; readonly action?: string; readonly cursor?: string | null }) =>
    http.get<PlatformAuditPage>(`/admin/audit${query({ ...filters, limit: 50 })}`),
};

/** The person's side of a reset: no session needed, the code is the credential. */
export function completePasswordReset(token: string, newPassword: string): Promise<void> {
  return http.post<void>('/password-reset', { token, newPassword }, { authenticated: false });
}

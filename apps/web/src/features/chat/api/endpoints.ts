import type {
ScheduledMessageView,
ScheduleMessageBody,
ConvertMessageBody,
ConvertMessageResult,
MediaPage,
MediaTab,
ConversationDetail,
ConversationView,
CreateConversationBody,
MessagePage,
UpdateMyConversationBody,
} from '@taskin/contracts';
import { http,query } from '@/lib/api-client';
import { workspacePath } from '@/lib/api-routing';

export const chatEndpoints = {
  conversations: {
    list: (workspaceId: string) => http.get<ConversationView[]>(`${workspacePath(workspaceId)}/conversations?scope=all`),
    deleteArchived: (workspaceId: string, id: string, confirmTitle: string) => http.delete<void>(`${workspacePath(workspaceId)}/conversations/${id}`, { confirmTitle }),
    get: (workspaceId: string, conversationId: string) => http.get<ConversationDetail>(`${workspacePath(workspaceId)}/conversations/${conversationId}`),
    create: (workspaceId: string, body: CreateConversationBody) =>
      http.post<ConversationDetail>(`${workspacePath(workspaceId)}/conversations`, body, { idempotent: true }),
    updateMine: (workspaceId: string, conversationId: string, body: UpdateMyConversationBody) =>
      http.put<ConversationView>(`${workspacePath(workspaceId)}/conversations/${conversationId}/me`, body),
    messages: (workspaceId: string, conversationId: string, params: { readonly beforeSeq?: number; readonly afterSeq?: number; readonly limit?: number }) =>
      http.get<MessagePage>(`${workspacePath(workspaceId)}/conversations/${conversationId}/messages${query(params)}`),
    media: (workspaceId: string, conversationId: string, tab: MediaTab, cursor?: string) =>
      http.get<MediaPage>(`${workspacePath(workspaceId)}/conversations/${conversationId}/media${query({ tab, limit: 100, ...(cursor ? { cursor } : {}) })}`),
    /** «تبدیل پیام به وظیفه». */
    convert: (workspaceId: string, conversationId: string, messageId: string, body: ConvertMessageBody) =>
      http.post<ConvertMessageResult>(`${workspacePath(workspaceId)}/conversations/${conversationId}/messages/${messageId}/task`, body, { idempotent: true }),
  },

  /** Phase 3.2: this member's scheduled messages. A retried schedule (same clientMsgId) returns the first. */
  scheduled: {
    list: (workspaceId: string) => http.get<ScheduledMessageView[]>(`${workspacePath(workspaceId)}/scheduled-messages`),
    create: (workspaceId: string, conversationId: string, body: ScheduleMessageBody) =>
      http.post<ScheduledMessageView>(`${workspacePath(workspaceId)}/conversations/${conversationId}/scheduled-messages`, body),
    /** «ارسال فوری». */
    sendNow: (workspaceId: string, scheduledId: string) => http.post<ScheduledMessageView>(`${workspacePath(workspaceId)}/scheduled-messages/${scheduledId}/send`),
    /** «لغو / حذف». */
    cancel: (workspaceId: string, scheduledId: string) => http.delete<void>(`${workspacePath(workspaceId)}/scheduled-messages/${scheduledId}`),
  },
};

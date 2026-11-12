import type {
  AttachmentView,
  CompleteUploadBody,
  CreateUploadBody,
  FileLink,
  UploadTicket,
  UploadView,
} from '@taskin/contracts';
import { http, query } from '@/lib/api-client';
import { workspacePath } from '@/lib/api-routing';

export const fileEndpoints = {
  files: {
    plan: (workspaceId: string, body: CreateUploadBody) =>
      http.post<UploadView>(`${workspacePath(workspaceId)}/files/uploads`, body, { idempotent: true }),
    complete: (workspaceId: string, attachmentId: string, body: CompleteUploadBody = {}) =>
      http.post<AttachmentView>(`${workspacePath(workspaceId)}/files/uploads/${attachmentId}/complete`, body),
    abort: (workspaceId: string, attachmentId: string) =>
      http.post<void>(`${workspacePath(workspaceId)}/files/uploads/${attachmentId}/abort`),
    link: (workspaceId: string, attachmentId: string, disposition: FileLink['disposition']) =>
      http.get<FileLink>(`${workspacePath(workspaceId)}/files/${attachmentId}/link${query({ disposition })}`),
    iconTicket: () => http.post<UploadTicket>('/uploads/workspace-icon'),
  },
};

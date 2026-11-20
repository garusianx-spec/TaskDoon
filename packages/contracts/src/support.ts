export const TICKET_DEPARTMENTS = ['TECHNICAL', 'BILLING', 'GENERAL'] as const;
export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'ANSWERED', 'RESOLVED', 'CLOSED'] as const;
export type TicketDepartment = (typeof TICKET_DEPARTMENTS)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const SUPPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const SUPPORT_MAX_FILES = 5;
export interface SupportAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
}
export interface TicketView {
  id: string;
  reference: string;
  subject: string;
  department: TicketDepartment;
  priority: TicketPriority;
  status: TicketStatus;
  userId: string;
  workspaceId: string | null;
  workspaceName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  unreadCount: number;
  assignedAdminId?: string | null;
}
export interface TicketMessageView {
  id: string;
  ticketId: string;
  senderId: string;
  senderType: 'USER' | 'AGENT';
  isInternal: boolean;
  body: string;
  attachments: SupportAttachment[];
  createdAt: string;
  publicSeq: number | null;
}
export interface TicketPage {
  items: TicketView[];
  nextCursor: string | null;
}
export interface TicketThread {
  ticket: TicketView;
  messages: TicketMessageView[];
  nextCursor: string | null;
}
export interface CreateTicketBody {
  commandId: string;
  workspaceId: string;
  subject: string;
  department: TicketDepartment;
  priority: TicketPriority;
  body: string;
  attachmentIds?: string[];
}
export interface ReplyTicketBody {
  commandId: string;
  body: string;
  attachmentIds?: string[];
}
export interface AgentTicketReply extends ReplyTicketBody {
  isInternal?: boolean;
}
export interface UpdateTicketBody {
  expectedVersion: number;
  status?: TicketStatus;
  assignedAdminId?: string | null;
  priority?: TicketPriority;
}
export interface SupportUploadView {
  id: string;
  status: 'pending' | 'ready' | 'rejected';
  name: string;
  size: number;
  mimeType: string;
  plan?: { kind: 'post'; url: string; fields: Record<string, string> };
}
export interface SupportAgentView {
  id: string;
  fullName: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TICKET_DEPARTMENTS, TICKET_PRIORITIES, TICKET_STATUSES } from '@taskin/contracts';
export class SupportAttachmentViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() size!: number;
  @ApiProperty() mimeType!: string;
  @ApiProperty({ description: 'Authenticated file-link endpoint, never a public storage URL' }) url!: string;
}
export class SupportTicketViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'TICK-1000' }) reference!: string;
  @ApiProperty() subject!: string;
  @ApiProperty({ enum: TICKET_DEPARTMENTS }) department!: string;
  @ApiProperty({ enum: TICKET_PRIORITIES }) priority!: string;
  @ApiProperty({ enum: TICKET_STATUSES }) status!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) workspaceId!: string | null;
  @ApiProperty() workspaceName!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Only exposed to support agents',
  })
  assignedAdminId?: string | null;
  @ApiProperty() version!: number;
  @ApiProperty() unreadCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
export class SupportMessageViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) ticketId!: string;
  @ApiProperty({ format: 'uuid' }) senderId!: string;
  @ApiProperty({ enum: ['USER', 'AGENT'] }) senderType!: string;
  @ApiProperty() isInternal!: boolean;
  @ApiProperty() body!: string;
  @ApiProperty({ type: Number, nullable: true }) publicSeq!: number | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: [SupportAttachmentViewDto] }) attachments!: SupportAttachmentViewDto[];
}
export class SupportTicketPageDto {
  @ApiProperty({ type: [SupportTicketViewDto] }) items!: SupportTicketViewDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class SupportThreadViewDto {
  @ApiProperty({ type: SupportTicketViewDto }) ticket!: SupportTicketViewDto;
  @ApiProperty({ type: [SupportMessageViewDto] }) messages!: SupportMessageViewDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
class SupportPostPlanDto {
  @ApiProperty({ enum: ['post'] }) kind!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) fields!: Record<string, string>;
}
export class SupportUploadViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['pending', 'ready', 'rejected'] }) status!: string;
  @ApiProperty() name!: string;
  @ApiProperty() size!: number;
  @ApiProperty() mimeType!: string;
  @ApiPropertyOptional({ type: SupportPostPlanDto }) plan?: SupportPostPlanDto;
}
export class SupportFileLinkDto {
  @ApiProperty() url!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ enum: ['attachment'] }) disposition!: string;
}
export class SupportAgentViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() fullName!: string;
}

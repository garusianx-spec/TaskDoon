import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  SUPPORT_MAX_FILE_BYTES,
  SUPPORT_MAX_FILES,
  TICKET_DEPARTMENTS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketDepartment,
  type TicketPriority,
  type TicketStatus,
} from '@taskin/contracts';
const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);
export class SupportReplyDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() commandId!: string;
  @ApiProperty({ maxLength: 8000 }) @Transform(trim) @IsString() @Length(1, 8000) body!: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(SUPPORT_MAX_FILES)
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}
export class CreateTicketDto extends SupportReplyDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() workspaceId!: string;
  @ApiProperty({ maxLength: 160 }) @Transform(trim) @IsString() @Length(3, 160) subject!: string;
  @ApiProperty({ enum: TICKET_DEPARTMENTS }) @IsIn(TICKET_DEPARTMENTS) department!: TicketDepartment;
  @ApiProperty({ enum: TICKET_PRIORITIES }) @IsIn(TICKET_PRIORITIES) priority!: TicketPriority;
}
export class AgentReplyDto extends SupportReplyDto {
  @ApiPropertyOptional() @ValidateIf((_o, v: unknown) => v !== undefined) @IsBoolean() isInternal?: boolean;
}
export class TicketQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(1, 100) q?: string;
  @ApiPropertyOptional({ enum: TICKET_DEPARTMENTS })
  @IsOptional()
  @IsIn(TICKET_DEPARTMENTS)
  department?: TicketDepartment;
  @ApiPropertyOptional({ enum: TICKET_PRIORITIES })
  @IsOptional()
  @IsIn(TICKET_PRIORITIES)
  priority?: TicketPriority;
  @ApiPropertyOptional({ enum: TICKET_STATUSES }) @IsOptional() @IsIn(TICKET_STATUSES) status?: TicketStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 180) cursor?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
export class AgentTicketQueryDto extends TicketQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() assignedAdminId?: string;
  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  unassigned?: string;
}
export class ThreadQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 180) cursor?: string;
}
export class CloseTicketDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}
export class UpdateTicketDto extends CloseTicketDto {
  @ApiPropertyOptional({ enum: TICKET_STATUSES }) @IsOptional() @IsIn(TICKET_STATUSES) status?: TicketStatus;
  @ApiPropertyOptional({ enum: TICKET_PRIORITIES })
  @IsOptional()
  @IsIn(TICKET_PRIORITIES)
  priority?: TicketPriority;
  @ApiPropertyOptional({ type: String, nullable: true })
  @ValidateIf((_o, v: unknown) => v !== undefined && v !== null)
  @IsUUID()
  assignedAdminId?: string | null;
}
export class ReadTicketDto {
  @ApiProperty() @IsInt() @Min(0) @Max(2147483647) throughSeq!: number;
}
export class SupportUploadDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() commandId!: string;
  @ApiProperty() @IsString() @Length(1, 255) fileName!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(SUPPORT_MAX_FILE_BYTES) size!: number;
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'] })
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'])
  contentType!: string;
}
export class InitialSupportUploadDto extends SupportUploadDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() workspaceId!: string;
}

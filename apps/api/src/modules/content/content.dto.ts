import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  ActivityKind,
  ActivityPage,
  ActivityView,
  CalendarEventKind,
  CalendarEventView,
  CalendarView,
  CompleteUploadBody,
  ConvertNoteBody,
  ConvertNoteResult,
  CreateCalendarEventBody,
  CreateNoteBody,
  CreateNoteCategoryBody,
  CreateUploadBody,
  DeadlineView,
  JalaliMonthCount,
  MarkNotificationsReadBody,
  MonthlyTaskReport,
  NoteCategoryView,
  NotePage,
  NoteView,
  NotificationFilter,
  NotificationKind,
  NotificationPage,
  NotificationTargetType,
  NotificationView,
  TagTone,
  TaskPriority,
  TaskStatus,
  UpdateCalendarEventBody,
  UpdateNoteBody,
  UpdateNoteCategoryBody,
} from '@taskin/contracts';
import { IsCalendarDate, LatinDigits, OptionalNullableDate, OptionalNullableTime, OptionalNullableUuid } from '../../platform/http/dto.js';
import { AttachmentViewDto, TAG_TONES, TASK_PRIORITIES, TASK_STATUSES, TaskDetailDto } from '../work/work.dto.js';

const EVENT_KINDS: readonly CalendarEventKind[] = ['meeting', 'reminder', 'milestone'];
const NOTIFICATION_KINDS: readonly NotificationKind[] = ['task-assigned', 'status-changed', 'comment', 'mention', 'reply', 'invitation', 'event-reminder', 'member-joined'];
const ACTIVITY_KINDS: readonly ActivityKind[] = ['task-assigned', 'task-completed', 'task-commented', 'message-mention', 'file-shared', 'member-joined'];
const TARGET_TYPES: readonly NotificationTargetType[] = ['task', 'conversation', 'message', 'event', 'workspace'];
const FILTERS: readonly NotificationFilter[] = ['all', 'unread', 'mentions'];

/** The largest file any plan could allow (the enterprise plan's per-file limit is lower today). */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

export class PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) readonly cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) readonly limit?: number;
}

/* ============================== Files ============================== */

export class CreateUploadDto implements CreateUploadBody {
  @ApiProperty({ minLength: 1, maxLength: 255, example: 'گزارش فصل.pdf' }) @IsString() @Length(1, 255) readonly fileName!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(MAX_UPLOAD_BYTES) readonly size!: number;
  @ApiProperty({ example: 'application/pdf' }) @IsString() @Length(1, 127) readonly contentType!: string;
}

export class UploadPartDto {
  @ApiProperty() readonly partNumber!: number;
  @ApiProperty() readonly url!: string;
}

/** One of two plans; see `UploadPlan` in the contracts. */
export class UploadPlanDto {
  @ApiProperty({ enum: ['post', 'multipart'] }) readonly kind!: 'post' | 'multipart';
  @ApiPropertyOptional({ description: 'kind = post' }) readonly url?: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' }, description: 'kind = post' }) readonly fields?: Record<string, string>;
  @ApiPropertyOptional({ description: 'kind = multipart' }) readonly partSize?: number;
  @ApiPropertyOptional({ type: UploadPartDto, isArray: true, description: 'kind = multipart' }) readonly parts?: UploadPartDto[];
}

export class UploadViewDto {
  @ApiProperty({ type: AttachmentViewDto }) readonly attachment!: AttachmentViewDto;
  @ApiProperty({ type: UploadPlanDto }) readonly plan!: UploadPlanDto;
  @ApiProperty() readonly expiresInSeconds!: number;
}

export class CompletedPartDto {
  @ApiProperty() @IsInt() @Min(1) @Max(10000) readonly partNumber!: number;
  @ApiProperty() @IsString() @Length(1, 200) readonly etag!: string;
}

export class FileLinkQueryDto {
  @ApiPropertyOptional({ enum: ['attachment', 'inline'], default: 'attachment' })
  @IsOptional()
  @IsIn(['attachment', 'inline'])
  readonly disposition?: 'attachment' | 'inline';
}

export class CompleteUploadDto implements CompleteUploadBody {
  @ApiPropertyOptional({ type: CompletedPartDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  readonly parts?: CompletedPartDto[];
}

/* ============================== Notes ============================== */

export class NoteCategoryViewDto implements NoteCategoryView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ type: String, nullable: true }) readonly key!: string | null;
  @ApiProperty() readonly label!: string;
  @ApiProperty() readonly builtIn!: boolean;
  @ApiProperty() readonly position!: number;
  @ApiProperty() readonly noteCount!: number;
}

export class CreateNoteCategoryDto implements CreateNoteCategoryBody {
  @ApiProperty({ minLength: 1, maxLength: 40 }) @IsString() @Length(1, 40) readonly label!: string;
}

export class UpdateNoteCategoryDto implements UpdateNoteCategoryBody {
  @ApiPropertyOptional({ minLength: 1, maxLength: 40 }) @IsOptional() @IsString() @Length(1, 40) readonly label?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) readonly position?: number;
}

export class NoteViewDto implements NoteView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid', description: 'null: filed in no notebook (its notebook was deleted)' })
  readonly categoryId!: string | null;
  @ApiProperty() readonly title!: string;
  @ApiProperty() readonly body!: string;
  @ApiProperty({ enum: TAG_TONES, isArray: true }) readonly colors!: TagTone[];
  @ApiProperty() readonly pinned!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly linkedTaskId!: string | null;
  @ApiProperty() readonly version!: number;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) readonly updatedAt!: string;
}

export class NotePageDto implements NotePage {
  @ApiProperty({ type: NoteViewDto, isArray: true }) readonly items!: NoteViewDto[];
  @ApiProperty({ type: String, nullable: true }) readonly nextCursor!: string | null;
}

export class NoteListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() readonly categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) readonly q?: string;
}

export class CreateNoteDto implements CreateNoteBody {
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid', description: 'Omitted: «شخصی» while it exists; null: no notebook' })
  @OptionalNullableUuid()
  readonly categoryId?: string | null;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) readonly title?: string;
  @ApiPropertyOptional({ maxLength: 100000 }) @IsOptional() @IsString() @MaxLength(100000) readonly body?: string;
  @ApiPropertyOptional({ enum: TAG_TONES, isArray: true }) @IsOptional() @IsArray() @ArrayMaxSize(8) @IsIn(TAG_TONES, { each: true }) readonly colors?: TagTone[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() readonly pinned?: boolean;
}

export class UpdateNoteDto implements UpdateNoteBody {
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid', description: 'null takes the note out of every notebook' })
  @OptionalNullableUuid()
  readonly categoryId?: string | null;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) readonly title?: string;
  @ApiPropertyOptional({ maxLength: 100000 }) @IsOptional() @IsString() @MaxLength(100000) readonly body?: string;
  @ApiPropertyOptional({ enum: TAG_TONES, isArray: true }) @IsOptional() @IsArray() @ArrayMaxSize(8) @IsIn(TAG_TONES, { each: true }) readonly colors?: TagTone[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() readonly pinned?: boolean;
}

export class ConvertNoteDto implements ConvertNoteBody {
  @ApiProperty({ format: 'uuid' }) @IsUUID() readonly projectId!: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly columnId?: string | null;
  @ApiPropertyOptional({ enum: TASK_PRIORITIES }) @IsOptional() @IsIn(TASK_PRIORITIES) readonly priority?: TaskPriority;
  @ApiPropertyOptional({ type: String, isArray: true, format: 'uuid' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) readonly assigneeIds?: string[];
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date' }) @OptionalNullableDate() readonly dueDate?: string | null;
}

export class ConvertNoteResultDto implements ConvertNoteResult {
  @ApiProperty({ type: TaskDetailDto }) readonly task!: TaskDetailDto;
  @ApiProperty() readonly existing!: boolean;
}

/* ============================== Calendar ============================== */

export class CalendarQueryDto {
  @ApiProperty({ format: 'date' }) @LatinDigits() @IsCalendarDate() readonly from!: string;
  @ApiProperty({ format: 'date' }) @LatinDigits() @IsCalendarDate() readonly to!: string;
}

export class CalendarEventViewDto implements CalendarEventView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ enum: EVENT_KINDS }) readonly kind!: CalendarEventKind;
  @ApiProperty() readonly title!: string;
  @ApiProperty() readonly description!: string;
  @ApiProperty({ format: 'date' }) readonly date!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date' }) readonly endDate!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '09:30' }) readonly startTime!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly endTime!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly startsAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly projectId!: string | null;
  @ApiProperty({ type: String, isArray: true, format: 'uuid' }) readonly attendeeIds!: string[];
  @ApiProperty({ format: 'uuid' }) readonly createdById!: string;
  @ApiProperty() readonly version!: number;
}

export class DeadlineViewDto implements DeadlineView {
  @ApiProperty({ format: 'uuid' }) readonly taskId!: string;
  @ApiProperty() readonly code!: string;
  @ApiProperty() readonly title!: string;
  @ApiProperty({ format: 'date' }) readonly dueDate!: string;
  @ApiProperty({ enum: TASK_STATUSES }) readonly status!: TaskStatus;
  @ApiProperty({ enum: TASK_PRIORITIES }) readonly priority!: TaskPriority;
  @ApiProperty({ format: 'uuid' }) readonly projectId!: string;
}

export class CalendarViewDto implements CalendarView {
  @ApiProperty({ format: 'date' }) readonly from!: string;
  @ApiProperty({ format: 'date' }) readonly to!: string;
  @ApiProperty() readonly timeZone!: string;
  @ApiProperty({ type: CalendarEventViewDto, isArray: true }) readonly events!: CalendarEventViewDto[];
  @ApiProperty({ type: DeadlineViewDto, isArray: true }) readonly deadlines!: DeadlineViewDto[];
}

export class CreateCalendarEventDto implements CreateCalendarEventBody {
  @ApiProperty({ enum: EVENT_KINDS }) @IsIn(EVENT_KINDS) readonly kind!: CalendarEventKind;
  @ApiProperty({ minLength: 1, maxLength: 120 }) @IsString() @Length(1, 120) readonly title!: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) readonly description?: string;
  @ApiProperty({ format: 'date' }) @LatinDigits() @IsCalendarDate() readonly date!: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date' }) @OptionalNullableDate() readonly endDate?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '09:30' }) @OptionalNullableTime() readonly startTime?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '10:30' }) @OptionalNullableTime() readonly endTime?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly projectId?: string | null;
  @ApiPropertyOptional({ type: String, isArray: true, format: 'uuid' }) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) readonly attendeeIds?: string[];
}

export class UpdateCalendarEventDto implements UpdateCalendarEventBody {
  @ApiPropertyOptional({ enum: EVENT_KINDS }) @IsOptional() @IsIn(EVENT_KINDS) readonly kind?: CalendarEventKind;
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 }) @IsOptional() @IsString() @Length(1, 120) readonly title?: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) readonly description?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @LatinDigits() @IsCalendarDate() readonly date?: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date' }) @OptionalNullableDate() readonly endDate?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @OptionalNullableTime() readonly startTime?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @OptionalNullableTime() readonly endTime?: string | null;
  @ApiPropertyOptional({ type: String, isArray: true, format: 'uuid' }) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) readonly attendeeIds?: string[];
}

/* ============================== Notifications & activity ============================== */

export class NotificationViewDto implements NotificationView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ format: 'uuid' }) readonly workspaceId!: string;
  @ApiProperty({ enum: NOTIFICATION_KINDS }) readonly kind!: NotificationKind;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly actorId!: string | null;
  @ApiProperty() readonly subject!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) readonly payload!: Record<string, unknown>;
  @ApiProperty({ enum: TARGET_TYPES }) readonly targetType!: NotificationTargetType;
  @ApiProperty({ format: 'uuid' }) readonly targetId!: string;
  @ApiProperty() readonly read!: boolean;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
}

export class NotificationPageDto implements NotificationPage {
  @ApiProperty({ type: NotificationViewDto, isArray: true }) readonly items!: NotificationViewDto[];
  @ApiProperty({ type: String, nullable: true }) readonly nextCursor!: string | null;
  @ApiProperty() readonly unreadCount!: number;
}

export class InboxQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() readonly workspaceId?: string;
  @ApiPropertyOptional({ enum: FILTERS, default: 'all' }) @IsOptional() @IsIn(FILTERS) readonly filter?: NotificationFilter;
}

export class MarkNotificationsReadDto implements MarkNotificationsReadBody {
  @ApiPropertyOptional({ type: String, isArray: true, format: 'uuid' }) @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) readonly ids?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() readonly all?: boolean;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() readonly workspaceId?: string;
}

export class MarkedDto {
  @ApiProperty() readonly marked!: number;
}

export class ActivityViewDto implements ActivityView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ enum: ACTIVITY_KINDS }) readonly kind!: ActivityKind;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly actorId!: string | null;
  @ApiProperty({ enum: TARGET_TYPES }) readonly targetType!: NotificationTargetType;
  @ApiProperty({ format: 'uuid' }) readonly targetId!: string;
  @ApiProperty() readonly targetTitle!: string;
  @ApiProperty() readonly context!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly projectId!: string | null;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
}

export class ActivityPageDto implements ActivityPage {
  @ApiProperty({ type: ActivityViewDto, isArray: true }) readonly items!: ActivityViewDto[];
  @ApiProperty({ type: String, nullable: true }) readonly nextCursor!: string | null;
}

/* ============================== Reports ============================== */

export class ReportQueryDto {
  @ApiProperty({ example: 1405 }) @Type(() => Number) @IsInt() @Min(1300) @Max(1600) readonly jalaliYear!: number;
}

export class JalaliMonthCountDto implements JalaliMonthCount {
  @ApiProperty({ minimum: 1, maximum: 12 }) readonly month!: number;
  @ApiProperty() readonly name!: string;
  @ApiProperty() readonly created!: number;
  @ApiProperty() readonly completed!: number;
}

export class MonthlyTaskReportDto implements MonthlyTaskReport {
  @ApiProperty() readonly jalaliYear!: number;
  @ApiProperty() readonly timeZone!: string;
  @ApiProperty({ type: JalaliMonthCountDto, isArray: true }) readonly months!: JalaliMonthCountDto[];
}

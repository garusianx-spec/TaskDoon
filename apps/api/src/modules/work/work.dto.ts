import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  type AttachFileBody,
  type AttachmentStatus,
  type AttachmentView,
  type AvatarTone,
  type BoardView,
  type ColumnView,
  type CompleteTaskBody,
  type FileLink,
  type MoveSubtaskBody,
  type TaskSourceMessage,
  type CreateColumnBody,
  type CreateCommentBody,
  type CreateLabelBody,
  type CreateProjectBody,
  type CreateSubtaskBody,
  type CreateTaskBody,
  type DeleteColumnBody,
  type FileKind,
  type LabelView,
  type MoveTaskBody,
  PERMISSION_ACTION_IDS,
  type PermissionActionId,
  type ProjectMemberView,
  type ProjectRole,
  type ProjectView,
  type ProjectVisibility,
  type PutProjectMemberBody,
  type SmartView,
  type SubtaskView,
  type TagTone,
  type TaskCard,
  type TaskCommentView,
  type TaskDetail,
  type TaskEventView,
  type TaskPage,
  type TaskPreview,
  type TaskPriority,
  type TaskStatus,
  type UpdateColumnBody,
  type UpdateCommentBody,
  type UpdateProjectBody,
  type UpdateSubtaskBody,
  type UpdateTaskBody,
  type WorkflowView,
} from '@taskin/contracts';
import { IsCalendarDate, LatinDigits, OptionalNullableDate, OptionalNullableUuid } from '../../platform/http/dto.js';
import { AVATAR_TONES } from '../users/me.controller.js';

export const TAG_TONES: readonly TagTone[] = ['gray', 'blue', 'teal', 'green', 'amber', 'red', 'pink', 'violet'];
export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'in-progress', 'review', 'done'];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['urgent', 'high', 'medium', 'low'];
export const PROJECT_ROLES: readonly ProjectRole[] = ['lead', 'contributor', 'viewer'];
export const VISIBILITIES: readonly ProjectVisibility[] = ['workspace', 'private'];
export const SMART_VIEWS: readonly SmartView[] = ['all', 'my-tasks', 'starred', 'due-soon'];
export const FILE_KINDS: readonly FileKind[] = ['image', 'video', 'document', 'sheet', 'archive', 'audio'];
export const ATTACHMENT_STATUSES: readonly AttachmentStatus[] = ['pending', 'scanning', 'ready', 'rejected', 'deleted'];

const trueish = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

/* ============================== Projects ============================== */

export class CreateProjectDto implements CreateProjectBody {
  @ApiProperty({ example: 'CRM', description: 'Upper-case letters and digits, 2–6, starting with a letter' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z][A-Z0-9]{1,5}$/, { message: 'key must be 2–6 upper-case letters or digits, starting with a letter' })
  readonly key!: string;
  @ApiProperty({ minLength: 1, maxLength: 80 }) @IsString() @Length(1, 80) readonly name!: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) readonly description?: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly departmentId?: string | null;
  @ApiPropertyOptional({ enum: AVATAR_TONES }) @IsOptional() @IsIn(AVATAR_TONES) readonly color?: AvatarTone;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly parentId?: string | null;
  @ApiPropertyOptional({ enum: VISIBILITIES }) @IsOptional() @IsIn(VISIBILITIES) readonly visibility?: ProjectVisibility;
}

export class UpdateProjectDto implements UpdateProjectBody {
  @ApiPropertyOptional({ minLength: 1, maxLength: 80 }) @IsOptional() @IsString() @Length(1, 80) readonly name?: string;
  @ApiPropertyOptional({ maxLength: 2000 }) @IsOptional() @IsString() @MaxLength(2000) readonly description?: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly departmentId?: string | null;
  @ApiPropertyOptional({ enum: AVATAR_TONES }) @IsOptional() @IsIn(AVATAR_TONES) readonly color?: AvatarTone;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly parentId?: string | null;
  @ApiPropertyOptional({ enum: VISIBILITIES }) @IsOptional() @IsIn(VISIBILITIES) readonly visibility?: ProjectVisibility;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() readonly archived?: boolean;
}

export class PutProjectMemberDto implements PutProjectMemberBody {
  @ApiProperty({ enum: PROJECT_ROLES }) @IsIn(PROJECT_ROLES) readonly role!: ProjectRole;
}

export class ProjectViewDto implements ProjectView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly key!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty() readonly description!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly departmentId!: string | null;
  @ApiProperty({ enum: AVATAR_TONES }) readonly color!: AvatarTone;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly parentId!: string | null;
  @ApiProperty({ enum: VISIBILITIES }) readonly visibility!: ProjectVisibility;
  @ApiProperty() readonly archived!: boolean;
  @ApiProperty() readonly starred!: boolean;
  @ApiProperty({ enum: PROJECT_ROLES, nullable: true }) readonly myRole!: ProjectRole | null;
  @ApiProperty({ enum: PERMISSION_ACTION_IDS, isArray: true }) readonly myActions!: PermissionActionId[];
  @ApiProperty({ type: String, isArray: true, format: 'uuid' }) readonly memberIds!: string[];
  @ApiProperty() readonly taskCount!: number;
  @ApiProperty() readonly openTaskCount!: number;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
}

export class ProjectMemberViewDto implements ProjectMemberView {
  @ApiProperty({ format: 'uuid' }) readonly userId!: string;
  @ApiProperty({ enum: PROJECT_ROLES }) readonly role!: ProjectRole;
  @ApiProperty({ format: 'date-time' }) readonly addedAt!: string;
}

/* ============================== Board ============================== */

export class ColumnViewDto implements ColumnView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly title!: string;
  @ApiProperty({ enum: TASK_STATUSES }) readonly status!: TaskStatus;
  @ApiProperty({ enum: TAG_TONES, nullable: true }) readonly tone!: TagTone | null;
  @ApiProperty() readonly builtIn!: boolean;
  @ApiProperty() readonly position!: string;
}

export class WorkflowViewDto implements WorkflowView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ format: 'uuid', description: 'The project the workflow belongs to' }) readonly projectId!: string;
  @ApiProperty() readonly version!: number;
  @ApiProperty({ type: ColumnViewDto, isArray: true }) readonly columns!: ColumnViewDto[];
}

export class CreateColumnDto implements CreateColumnBody {
  @ApiProperty({ format: 'uuid', description: 'The project whose board gets the column' }) @IsUUID() readonly projectId!: string;
  @ApiProperty({ minLength: 1, maxLength: 32 }) @IsString() @Length(1, 32) readonly title!: string;
  @ApiPropertyOptional({ enum: TAG_TONES, nullable: true }) @IsOptional() @ValidateIf((_, value) => value !== null) @IsIn(TAG_TONES) readonly tone?: TagTone | null;
  @ApiPropertyOptional({ enum: TASK_STATUSES }) @IsOptional() @IsIn(TASK_STATUSES) readonly status?: TaskStatus;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly afterColumnId?: string | null;
}

export class UpdateColumnDto implements UpdateColumnBody {
  @ApiPropertyOptional({ minLength: 1, maxLength: 32 }) @IsOptional() @IsString() @Length(1, 32) readonly title?: string;
  @ApiPropertyOptional({ enum: TAG_TONES, nullable: true }) @IsOptional() @ValidateIf((_, value) => value !== null) @IsIn(TAG_TONES) readonly tone?: TagTone | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid', description: 'Move after this column; null moves it first' })
  @OptionalNullableUuid()
  readonly afterColumnId?: string | null;
}

export class ColumnDispositionDto {
  @ApiProperty({ enum: ['migrate', 'archive'] }) @IsIn(['migrate', 'archive']) readonly kind!: 'migrate' | 'archive';
  @ApiPropertyOptional({ format: 'uuid', description: 'Required when kind is migrate' })
  @ValidateIf((dto: ColumnDispositionDto) => dto.kind === 'migrate')
  @IsUUID()
  readonly targetColumnId?: string;
}

/** The wire shape of `DeleteColumnBody`; `toDisposition()` narrows it to the contract's union. */
export class DeleteColumnDto {
  @ApiPropertyOptional({ type: ColumnDispositionDto }) @IsOptional() @ValidateNested() @Type(() => ColumnDispositionDto) readonly disposition?: ColumnDispositionDto;

  toDisposition(): DeleteColumnBody['disposition'] {
    if (!this.disposition) return undefined;
    return this.disposition.kind === 'migrate' ? { kind: 'migrate', targetColumnId: this.disposition.targetColumnId ?? '' } : { kind: 'archive' };
  }
}

/* ============================== Tasks ============================== */

export class TaskCardDto implements TaskCard {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ example: 'CRM-104' }) readonly code!: string;
  @ApiProperty({ format: 'uuid' }) readonly projectId!: string;
  @ApiProperty() readonly title!: string;
  @ApiProperty({ enum: TASK_STATUSES }) readonly status!: TaskStatus;
  @ApiProperty({ enum: TASK_PRIORITIES }) readonly priority!: TaskPriority;
  @ApiProperty({ format: 'uuid' }) readonly columnId!: string;
  @ApiProperty() readonly position!: string;
  @ApiProperty({ type: String, isArray: true, format: 'uuid' }) readonly assigneeIds!: string[];
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly reviewerId!: string | null;
  @ApiProperty({ format: 'date' }) readonly startDate!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date' }) readonly dueDate!: string | null;
  @ApiProperty({ type: String, isArray: true, format: 'uuid' }) readonly labelIds!: string[];
  @ApiProperty() readonly starred!: boolean;
  @ApiProperty() readonly subtaskCount!: number;
  @ApiProperty() readonly subtaskDoneCount!: number;
  @ApiProperty() readonly commentCount!: number;
  @ApiProperty() readonly attachmentCount!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly completedAt!: string | null;
  @ApiProperty() readonly archived!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly sourceMessageId!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly sourceNoteId!: string | null;
  @ApiProperty() readonly version!: number;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) readonly updatedAt!: string;
}

export class SubtaskViewDto implements SubtaskView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly title!: string;
  @ApiProperty() readonly done!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly assigneeId!: string | null;
  @ApiProperty() readonly position!: string;
}

export class TaskCommentViewDto implements TaskCommentView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ format: 'uuid' }) readonly authorId!: string;
  @ApiProperty() readonly body!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly replyToId!: string | null;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly editedAt!: string | null;
}

export class AttachmentViewDto implements AttachmentView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ enum: FILE_KINDS }) readonly kind!: FileKind;
  @ApiProperty() readonly mimeType!: string;
  @ApiProperty() readonly size!: number;
  @ApiProperty({ enum: ATTACHMENT_STATUSES }) readonly status!: AttachmentStatus;
  @ApiProperty({ format: 'uuid' }) readonly uploadedById!: string;
  @ApiProperty({ format: 'date-time' }) readonly uploadedAt!: string;
}

export class TaskEventViewDto implements TaskEventView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly actorId!: string | null;
  @ApiProperty() readonly type!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) readonly payload!: Record<string, unknown>;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
}

export class TaskSourceMessageDto implements TaskSourceMessage {
  @ApiProperty({ format: 'uuid' }) readonly messageId!: string;
  @ApiProperty({ description: '`false` when the caller cannot read the conversation; the other fields are then null' }) readonly accessible!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly conversationId!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly authorId!: string | null;
  @ApiProperty({ type: String, nullable: true, maxLength: 140 }) readonly excerpt!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['text', 'voice', 'file', 'system'] }) readonly kind!: TaskSourceMessage['kind'];
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly sentAt!: string | null;
  @ApiProperty() readonly deleted!: boolean;
}

export class FileLinkDto implements FileLink {
  @ApiProperty() readonly url!: string;
  @ApiProperty({ enum: ['attachment', 'inline'] }) readonly disposition!: FileLink['disposition'];
  @ApiProperty({ format: 'date-time' }) readonly expiresAt!: string;
}

export class TaskDetailDto extends TaskCardDto implements TaskDetail {
  @ApiProperty() readonly description!: string;
  @ApiProperty({ format: 'uuid' }) readonly createdById!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly reopenColumnId!: string | null;
  @ApiProperty({ type: SubtaskViewDto, isArray: true }) readonly subtasks!: SubtaskViewDto[];
  @ApiProperty({ type: TaskCommentViewDto, isArray: true }) readonly comments!: TaskCommentViewDto[];
  @ApiProperty({ type: AttachmentViewDto, isArray: true }) readonly attachments!: AttachmentViewDto[];
  @ApiProperty({ type: TaskEventViewDto, isArray: true }) readonly timeline!: TaskEventViewDto[];
  @ApiProperty({ enum: PERMISSION_ACTION_IDS, isArray: true }) readonly myActions!: PermissionActionId[];
  @ApiProperty({ type: TaskSourceMessageDto, nullable: true }) readonly sourceMessage!: TaskSourceMessageDto | null;
}

export class BoardViewDto implements BoardView {
  @ApiProperty({ format: 'uuid' }) readonly workflowId!: string;
  @ApiProperty() readonly workflowVersion!: number;
  @ApiProperty({ type: ColumnViewDto, isArray: true }) readonly columns!: ColumnViewDto[];
  @ApiProperty({ type: TaskCardDto, isArray: true }) readonly tasks!: TaskCardDto[];
}

export class TaskPageDto implements TaskPage {
  @ApiProperty({ type: TaskCardDto, isArray: true }) readonly items!: TaskCardDto[];
  @ApiProperty({ type: String, nullable: true }) readonly nextCursor!: string | null;
}

export class TaskPreviewDto implements TaskPreview {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly code!: string;
  @ApiProperty() readonly accessible!: boolean;
  @ApiProperty({ type: String, nullable: true }) readonly title!: string | null;
  @ApiProperty({ enum: TASK_STATUSES, nullable: true }) readonly status!: TaskStatus | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly projectId!: string | null;
}

export class BoardQueryDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() readonly projectId!: string;
}

export class WorkflowQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Every project has its own workflow' }) @IsUUID() readonly projectId!: string;
}

export class TaskListQueryDto {
  @ApiPropertyOptional({ enum: SMART_VIEWS, default: 'all' }) @IsOptional() @IsIn(SMART_VIEWS) readonly smart?: SmartView;
  @ApiPropertyOptional({ format: 'uuid', description: 'The project and its sub-projects' }) @IsOptional() @IsUUID() readonly projectId?: string;
  @ApiPropertyOptional({ enum: TASK_STATUSES }) @IsOptional() @IsIn(TASK_STATUSES) readonly status?: TaskStatus;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() readonly assigneeId?: string;
  @ApiPropertyOptional({ description: 'Searches codes, titles and descriptions (Persian-normalised)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly q?: string;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @Transform(trueish) @IsBoolean() readonly includeArchived?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) readonly cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) readonly limit?: number;
}

export class GanttQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() readonly projectId?: string;
  @ApiProperty({ format: 'date' }) @LatinDigits() @IsCalendarDate() readonly from!: string;
  @ApiProperty({ format: 'date' }) @LatinDigits() @IsCalendarDate() readonly to!: string;
}

export class CreateTaskDto implements CreateTaskBody {
  @ApiProperty({ format: 'uuid' }) @IsUUID() readonly projectId!: string;
  @ApiProperty({ minLength: 1, maxLength: 200 }) @IsString() @Length(1, 200) readonly title!: string;
  @ApiPropertyOptional({ maxLength: 20000 }) @IsOptional() @IsString() @MaxLength(20000) readonly description?: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly columnId?: string | null;
  @ApiPropertyOptional({ enum: TASK_STATUSES }) @IsOptional() @IsIn(TASK_STATUSES) readonly status?: TaskStatus;
  @ApiPropertyOptional({ enum: TASK_PRIORITIES }) @IsOptional() @IsIn(TASK_PRIORITIES) readonly priority?: TaskPriority;
  @ApiPropertyOptional({ type: String, isArray: true, format: 'uuid' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) readonly assigneeIds?: string[];
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly reviewerId?: string | null;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @LatinDigits() @IsCalendarDate() readonly startDate?: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date' }) @OptionalNullableDate() readonly dueDate?: string | null;
  @ApiPropertyOptional({ type: String, isArray: true, format: 'uuid' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) readonly labelIds?: string[];
  @ApiPropertyOptional({ type: String, isArray: true }) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @Length(1, 200, { each: true }) readonly subtasks?: string[];
  @ApiPropertyOptional({ type: String, isArray: true, format: 'uuid' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) readonly attachmentIds?: string[];
}

export class UpdateTaskDto implements UpdateTaskBody {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 }) @IsOptional() @IsString() @Length(1, 200) readonly title?: string;
  @ApiPropertyOptional({ maxLength: 20000 }) @IsOptional() @IsString() @MaxLength(20000) readonly description?: string;
  @ApiPropertyOptional({ enum: TASK_PRIORITIES }) @IsOptional() @IsIn(TASK_PRIORITIES) readonly priority?: TaskPriority;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @LatinDigits() @IsCalendarDate() readonly startDate?: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date' }) @OptionalNullableDate() readonly dueDate?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly reviewerId?: string | null;
  @ApiPropertyOptional({ type: String, isArray: true, format: 'uuid' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) readonly assigneeIds?: string[];
  @ApiPropertyOptional({ type: String, isArray: true, format: 'uuid' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) readonly labelIds?: string[];
}

export class MoveTaskDto implements MoveTaskBody {
  @ApiProperty({ format: 'uuid' }) @IsUUID() readonly columnId!: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly afterId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly beforeId?: string | null;
  @ApiProperty() @IsInt() @Min(1) readonly expectedVersion!: number;
}

export class CompleteTaskDto implements CompleteTaskBody {
  @ApiProperty() @IsBoolean() readonly completed!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) readonly expectedVersion?: number;
}

export class CreateSubtaskDto implements CreateSubtaskBody {
  @ApiProperty({ minLength: 1, maxLength: 200 }) @IsString() @Length(1, 200) readonly title!: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly assigneeId?: string | null;
}

export class MoveSubtaskDto implements MoveSubtaskBody {
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid', description: 'The subtask that should end up just before this one' })
  @OptionalNullableUuid()
  readonly afterId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid', description: 'The subtask that should end up just after this one' })
  @OptionalNullableUuid()
  readonly beforeId?: string | null;
}

export class UpdateSubtaskDto implements UpdateSubtaskBody {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 }) @IsOptional() @IsString() @Length(1, 200) readonly title?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() readonly done?: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly assigneeId?: string | null;
}

export class CreateCommentDto implements CreateCommentBody {
  @ApiProperty({ minLength: 1, maxLength: 4000 }) @IsString() @Length(1, 4000) readonly body!: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) @OptionalNullableUuid() readonly replyToId?: string | null;
}

export class UpdateCommentDto implements UpdateCommentBody {
  @ApiProperty({ minLength: 1, maxLength: 4000 }) @IsString() @Length(1, 4000) readonly body!: string;
}

export class AttachFileDto implements AttachFileBody {
  @ApiProperty({ format: 'uuid' }) @IsUUID() readonly attachmentId!: string;
}

export class LabelViewDto implements LabelView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ enum: TAG_TONES }) readonly tone!: TagTone;
}

export class CreateLabelDto implements CreateLabelBody {
  @ApiProperty({ minLength: 1, maxLength: 40 }) @IsString() @Length(1, 40) readonly name!: string;
  @ApiPropertyOptional({ enum: TAG_TONES }) @IsOptional() @IsIn(TAG_TONES) readonly tone?: TagTone;
}


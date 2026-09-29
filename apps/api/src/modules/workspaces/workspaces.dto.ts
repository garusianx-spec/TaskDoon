import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  type AcceptInvitationBody,
  type AcceptInvitationResult,
  type AvatarTone,
  type CreateDepartmentBody,
  type CreateInvitationsBody,
  type CreateInvitationsResult,
  type CreateWorkspaceBody,
  type DeleteWorkspaceBody,
  type DepartmentView,
  type InvitationChannel,
  type InvitationRejection,
  type InvitationStatus,
  type InvitationView,
  type ManualPresence,
  type MemberStatus,
  type MemberView,
  type ModulePermissions,
  type MyPermissions,
  type PlanLimits,
  ROLE_IDS,
  type RoleId,
  type RolePermissions,
  type RoleView,
  type TransferOwnershipBody,
  type UpdateDepartmentBody,
  type UpdateMemberBody,
  type UpdatePresenceBody,
  type UpdateRolePermissionsBody,
  type UpdateWorkspaceBody,
  type UploadTicket,
  type WeekDay,
  type WorkspaceSettings,
  type WorkspaceView,
} from '@taskin/contracts';
import { AVATAR_TONES } from '../users/me.controller.js';

const WEEK_DAYS: readonly WeekDay[] = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const PRESENCES: readonly ManualPresence[] = ['online', 'busy', 'away'];
const CHANNELS: readonly InvitationChannel[] = ['email', 'sms'];
const ASSIGNABLE_ROLES = ROLE_IDS.filter((role) => role !== 'owner');

/* ============================== Workspaces ============================== */

export class WorkspaceSettingsPatchDto implements Partial<WorkspaceSettings> {
  @ApiPropertyOptional({ example: 'Asia/Tehran' }) @IsOptional() @IsString() @MaxLength(64) readonly timeZone?: string;
  @ApiPropertyOptional({ enum: WEEK_DAYS }) @IsOptional() @IsIn(WEEK_DAYS) readonly weekStart?: WeekDay;
  @ApiPropertyOptional({ enum: WEEK_DAYS, isArray: true }) @IsOptional() @IsArray() @ArrayMaxSize(6) @IsIn(WEEK_DAYS, { each: true }) readonly weekend?: WeekDay[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() readonly systemMessageOnConvert?: boolean;
  @ApiPropertyOptional({ type: String, isArray: true, example: ['rahnama.ir'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i, { each: true, message: 'each entry must be a domain name' })
  readonly allowedEmailDomains?: string[];
}

export class CreateWorkspaceDto implements CreateWorkspaceBody {
  @ApiProperty({ minLength: 1, maxLength: 40, example: 'هلدینگ راهنما' }) @IsString() @Length(1, 40) readonly name!: string;
  @ApiPropertyOptional({ maxLength: 160 }) @IsOptional() @IsString() @MaxLength(160) readonly description?: string;
  @ApiPropertyOptional({ enum: AVATAR_TONES }) @IsOptional() @IsIn(AVATAR_TONES) readonly tone?: AvatarTone;
  @ApiPropertyOptional({ description: 'The key of a completed icon upload ticket' }) @IsOptional() @IsString() @MaxLength(200) readonly iconUploadKey?: string;
}

export class UpdateWorkspaceDto implements UpdateWorkspaceBody {
  @ApiPropertyOptional({ minLength: 1, maxLength: 40 }) @IsOptional() @IsString() @Length(1, 40) readonly name?: string;
  @ApiPropertyOptional({ maxLength: 160 }) @IsOptional() @IsString() @MaxLength(160) readonly description?: string;
  @ApiPropertyOptional({ enum: AVATAR_TONES }) @IsOptional() @IsIn(AVATAR_TONES) readonly tone?: AvatarTone;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  readonly iconUploadKey?: string | null;
  @ApiPropertyOptional({ type: WorkspaceSettingsPatchDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkspaceSettingsPatchDto)
  readonly settings?: WorkspaceSettingsPatchDto;
}

export class DeleteWorkspaceDto implements DeleteWorkspaceBody {
  @ApiProperty({ description: 'The exact workspace name' }) @IsString() @Length(1, 40) readonly confirmName!: string;
}

export class TransferOwnershipDto implements TransferOwnershipBody {
  @ApiProperty({ format: 'uuid' }) @IsUUID() readonly userId!: string;
}

export class PlanLimitsDto implements PlanLimits {
  @ApiProperty() readonly maxMembers!: number;
  @ApiProperty() readonly storageBytes!: number;
  @ApiProperty() readonly maxFileBytes!: number;
  @ApiProperty({ type: Number, nullable: true }) readonly messageHistoryDays!: number | null;
  @ApiProperty({ type: Number, nullable: true }) readonly maxProjects!: number | null;
}

export class WorkspaceSettingsDto implements WorkspaceSettings {
  @ApiProperty() readonly timeZone!: string;
  @ApiProperty({ enum: WEEK_DAYS }) readonly weekStart!: WeekDay;
  @ApiProperty({ enum: WEEK_DAYS, isArray: true }) readonly weekend!: WeekDay[];
  @ApiProperty() readonly systemMessageOnConvert!: boolean;
  @ApiProperty({ type: String, isArray: true }) readonly allowedEmailDomains!: string[];
}

export class WorkspaceViewDto implements WorkspaceView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly slug!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty() readonly description!: string;
  @ApiProperty() readonly initials!: string;
  @ApiProperty({ enum: AVATAR_TONES }) readonly tone!: AvatarTone;
  @ApiProperty({ type: String, nullable: true }) readonly iconUrl!: string | null;
  @ApiProperty({ format: 'uuid' }) readonly ownerId!: string;
  @ApiProperty() readonly planId!: string;
  @ApiProperty({ type: PlanLimitsDto }) readonly limits!: PlanLimits;
  @ApiProperty() readonly memberCount!: number;
  @ApiProperty({ type: WorkspaceSettingsDto }) readonly settings!: WorkspaceSettings;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
}

export class UploadTicketDto implements UploadTicket {
  @ApiProperty() readonly key!: string;
  @ApiProperty() readonly url!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) readonly fields!: Record<string, string>;
  @ApiProperty() readonly maxBytes!: number;
  @ApiProperty({ type: String, isArray: true }) readonly contentTypes!: string[];
  @ApiProperty() readonly expiresInSeconds!: number;
}

/* ============================== Members & departments ============================== */

export class UpdateMemberDto implements UpdateMemberBody {
  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES }) @IsOptional() @IsIn(ROLE_IDS) readonly role?: RoleId;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  readonly departmentId?: string | null;
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MaxLength(80) readonly jobTitle?: string;
  @ApiPropertyOptional({ enum: ['active', 'suspended'] }) @IsOptional() @IsIn(['active', 'suspended']) readonly status?: 'active' | 'suspended';
}

export class UpdatePresenceDto implements UpdatePresenceBody {
  @ApiProperty({ enum: PRESENCES }) @IsIn(PRESENCES) readonly presence!: ManualPresence;
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MaxLength(80) readonly statusMessage?: string;
}

export class MemberViewDto implements MemberView {
  @ApiProperty({ format: 'uuid' }) readonly userId!: string;
  @ApiProperty() readonly fullName!: string;
  @ApiProperty() readonly phone!: string;
  @ApiProperty({ type: String, nullable: true }) readonly email!: string | null;
  @ApiProperty({ enum: AVATAR_TONES }) readonly avatarTone!: AvatarTone;
  @ApiProperty({ enum: ROLE_IDS }) readonly role!: RoleId;
  @ApiProperty() readonly isOwner!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly departmentId!: string | null;
  @ApiProperty() readonly jobTitle!: string;
  @ApiProperty({ enum: ['active', 'suspended', 'left'] }) readonly status!: MemberStatus;
  @ApiProperty({ enum: PRESENCES }) readonly presence!: ManualPresence;
  @ApiProperty({ description: 'Connected on at least one device right now' }) readonly online!: boolean;
  @ApiProperty() readonly statusMessage!: string;
  @ApiProperty({ format: 'date-time' }) readonly joinedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time', description: 'Former members only: when they were removed' })
  readonly leftAt?: string | null;
}

const trueish = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class MemberListQueryDto {
  @ApiPropertyOptional({ type: Boolean, description: 'Also former members (removed or left): names only, for the history they left' })
  @IsOptional()
  @Transform(trueish)
  @IsBoolean()
  readonly includeFormer?: boolean;
}

export class CreateDepartmentDto implements CreateDepartmentBody {
  @ApiProperty({ minLength: 1, maxLength: 60 }) @IsString() @Length(1, 60) readonly name!: string;
}

export class UpdateDepartmentDto implements UpdateDepartmentBody {
  @ApiPropertyOptional({ minLength: 1, maxLength: 60 }) @IsOptional() @IsString() @Length(1, 60) readonly name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) readonly position?: number;
}

export class DepartmentViewDto implements DepartmentView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty() readonly position!: number;
  @ApiProperty() readonly memberCount!: number;
}

/* ============================== Invitations ============================== */

export class RecipientDto {
  @ApiProperty({ example: '0912 111 2233' }) @IsString() @Length(3, 254) readonly address!: string;
  @ApiPropertyOptional({ enum: CHANNELS }) @IsOptional() @IsIn(CHANNELS) readonly channel?: InvitationChannel;
}

export class CreateInvitationsDto implements CreateInvitationsBody {
  @ApiProperty({ type: RecipientDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  readonly recipients!: RecipientDto[];
  @ApiProperty({ enum: ASSIGNABLE_ROLES }) @IsIn(ROLE_IDS) readonly role!: RoleId;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  readonly departmentId?: string | null;
  @ApiPropertyOptional({ maxLength: 280 }) @IsOptional() @IsString() @MaxLength(280) readonly message?: string;
}

export class InvitationViewDto implements InvitationView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly address!: string;
  @ApiProperty({ enum: CHANNELS }) readonly channel!: InvitationChannel;
  @ApiProperty({ enum: ROLE_IDS }) readonly role!: RoleId;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly departmentId!: string | null;
  @ApiProperty() readonly message!: string;
  @ApiProperty({ enum: ['pending', 'accepted', 'revoked', 'expired'] }) readonly status!: InvitationStatus;
  @ApiProperty({ format: 'uuid' }) readonly invitedById!: string;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) readonly expiresAt!: string;
}

export class RejectedRecipientDto {
  @ApiProperty() readonly address!: string;
  @ApiProperty({ enum: ['invalid_address', 'already_member', 'already_invited', 'domain_not_allowed'] }) readonly reason!: InvitationRejection;
}

export class CreateInvitationsResultDto implements CreateInvitationsResult {
  @ApiProperty({ type: InvitationViewDto, isArray: true }) readonly created!: InvitationView[];
  @ApiProperty({ type: RejectedRecipientDto, isArray: true }) readonly rejected!: RejectedRecipientDto[];
}

export class AcceptInvitationDto implements AcceptInvitationBody {
  @ApiProperty() @IsString() @Length(20, 128) readonly token!: string;
}

export class AcceptInvitationResultDto implements AcceptInvitationResult {
  @ApiProperty({ format: 'uuid' }) readonly workspaceId!: string;
  @ApiProperty({ enum: ROLE_IDS }) readonly role!: RoleId;
}

/* ============================== Roles ============================== */

export class ModulePermissionsDto implements ModulePermissions {
  @ApiProperty() @IsBoolean() readonly view!: boolean;
  @ApiProperty() @IsBoolean() readonly create!: boolean;
  @ApiProperty() @IsBoolean() readonly edit!: boolean;
  @ApiProperty() @IsBoolean() readonly delete!: boolean;
  @ApiProperty() @IsBoolean() readonly assign!: boolean;
}

export class RolePermissionsDto implements RolePermissions {
  @ApiProperty({ type: ModulePermissionsDto }) @ValidateNested() @Type(() => ModulePermissionsDto) readonly messages!: ModulePermissionsDto;
  @ApiProperty({ type: ModulePermissionsDto }) @ValidateNested() @Type(() => ModulePermissionsDto) readonly boards!: ModulePermissionsDto;
  @ApiProperty({ type: ModulePermissionsDto }) @ValidateNested() @Type(() => ModulePermissionsDto) readonly files!: ModulePermissionsDto;
  @ApiProperty({ type: ModulePermissionsDto }) @ValidateNested() @Type(() => ModulePermissionsDto) readonly reports!: ModulePermissionsDto;
  @ApiProperty({ type: ModulePermissionsDto }) @ValidateNested() @Type(() => ModulePermissionsDto) readonly members!: ModulePermissionsDto;
}

export class UpdateRolePermissionsDto implements UpdateRolePermissionsBody {
  @ApiProperty({ type: RolePermissionsDto }) @ValidateNested() @Type(() => RolePermissionsDto) readonly permissions!: RolePermissionsDto;
}

export class RoleViewDto implements RoleView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ enum: ROLE_IDS }) readonly key!: RoleId;
  @ApiProperty() readonly rank!: number;
  @ApiProperty() readonly locked!: boolean;
  @ApiProperty() readonly memberCount!: number;
  @ApiProperty({ type: RolePermissionsDto }) readonly permissions!: RolePermissions;
  @ApiProperty() readonly version!: number;
}

export class MyPermissionsDto implements MyPermissions {
  @ApiProperty({ format: 'uuid' }) readonly workspaceId!: string;
  @ApiProperty({ enum: ROLE_IDS }) readonly role!: RoleId;
  @ApiProperty() readonly isOwner!: boolean;
  @ApiProperty({ type: RolePermissionsDto }) readonly permissions!: RolePermissions;
  @ApiProperty() readonly rbacVersion!: number;
}

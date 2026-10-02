import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import type {
  CompletePasswordResetBody,
  ConversationKind,
  IssuePasswordResetBody,
  MembershipMode,
  MessageView,
  PasswordResetChannel,
  PasswordResetIssued,
  PasswordResetRequiredBody,
  PlatformAdminMe,
  PlatformAttachmentLink,
  PlatformAuditEntry,
  PlatformAuditPage,
  PlatformConversationDetail,
  PlatformConversationView,
  PlatformMembership,
  PlatformMessagePage,
  PlatformMessageType,
  PlatformModerationResult,
  PlatformSessionsRevoked,
  PlatformSessionStatus,
  PlatformSessionView,
  PlatformSuspension,
  PlatformUserDetail,
  PlatformUserPage,
  PlatformUserStatus,
  PlatformUserSummary,
  PlanLimits,
  PlatformPlanOption,
  PlatformWorkspaceDetail,
  PlatformWorkspaceModerationResult,
  PlatformWorkspacePage,
  PlatformWorkspaceQuota,
  PlatformWorkspaceStatus,
  PlatformWorkspaceSummary,
  ProjectRole,
  SuspendUserBody,
  SuspendWorkspaceBody,
  TransferWorkspaceOwnershipBody,
  UnsuspendUserBody,
  UnsuspendWorkspaceBody,
  WorkspaceLimitOverrides,
  WorkspaceLimitsBody,
} from '@taskin/contracts';
import { LatinDigits } from '../../platform/http/dto.js';
import { CONVERSATION_KINDS, MessageViewDto } from '../chat/chat.dto.js';
import { PlanLimitsDto } from '../workspaces/workspaces.dto.js';

const WORKSPACE_STATUSES: readonly PlatformWorkspaceStatus[] = ['active', 'suspended', 'deleted'];

export const PLATFORM_USER_STATUSES: readonly PlatformUserStatus[] = ['active', 'suspended', 'deleted'];
export const PLATFORM_SESSION_STATUSES: readonly PlatformSessionStatus[] = ['active', 'revoked', 'expired'];
export const PASSWORD_RESET_CHANNELS: readonly PasswordResetChannel[] = ['sms', 'email', 'manual'];
export const PLATFORM_MESSAGE_TYPES: readonly PlatformMessageType[] = ['text', 'voice', 'image', 'file'];
const MEMBER_STATUSES = ['active', 'suspended', 'left'] as const;
const PROJECT_ROLES: readonly ProjectRole[] = ['lead', 'contributor', 'viewer'];
const MEMBERSHIP_MODES: readonly MembershipMode[] = ['manual', 'project_synced'];
/** Opaque paging cursors: base64url. */
const CURSOR = /^[A-Za-z0-9_-]{1,200}$/;

/* ------------------------------------------------------------------ requests */

export class PlatformUserQueryDto {
  @ApiPropertyOptional({ description: 'Name, phone or email contains' }) @IsOptional() @IsString() @MaxLength(80) readonly q?: string;
  @ApiPropertyOptional({ description: 'Any written form of a mobile number; a full number matches exactly, part of one as a substring' })
  @IsOptional()
  @LatinDigits()
  @IsString()
  @MaxLength(24)
  readonly phone?: string;
  @ApiPropertyOptional({ description: 'Email contains' }) @IsOptional() @IsString() @MaxLength(254) readonly email?: string;
  @ApiPropertyOptional({ enum: PLATFORM_USER_STATUSES }) @IsOptional() @IsIn(PLATFORM_USER_STATUSES) readonly status?: PlatformUserStatus;
  @ApiPropertyOptional({ enum: ['admin', 'user'], description: 'Platform role: flagged platform admins, or everyone else' })
  @IsOptional()
  @IsIn(['admin', 'user'])
  readonly platformRole?: 'admin' | 'user';
  @ApiPropertyOptional() @IsOptional() @Matches(CURSOR) readonly cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) readonly limit?: number;
}

export class PlatformSessionQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'revoked', 'all'], default: 'all' }) @IsOptional() @IsIn(['active', 'revoked', 'all']) readonly status?: 'active' | 'revoked' | 'all';
}

export class IssuePasswordResetDto implements IssuePasswordResetBody {
  @ApiProperty({ enum: PASSWORD_RESET_CHANNELS }) @IsIn(PASSWORD_RESET_CHANNELS) readonly channel!: PasswordResetChannel;
}

export class CompletePasswordResetDto implements CompletePasswordResetBody {
  @ApiProperty({ description: 'The single-use code from the link' }) @IsString() @Matches(/^[A-Za-z0-9_-]{20,128}$/) readonly token!: string;
  @ApiProperty({ format: 'password', minLength: 8, maxLength: 128 }) @IsString() @Length(8, 128) readonly newPassword!: string;
}

/** Whose data this look is for: recorded in the platform audit log. */
export class PlatformTargetQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'The person being inspected (recorded in the audit log)' })
  @IsOptional()
  @IsUUID()
  readonly targetUserId?: string;
}

export class PlatformMessageQueryDto extends PlatformTargetQueryDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Sent at or after' }) @IsOptional() @IsISO8601({ strict: true }) readonly from?: string;
  @ApiPropertyOptional({ format: 'date-time', description: 'Sent before' }) @IsOptional() @IsISO8601({ strict: true }) readonly to?: string;
  @ApiPropertyOptional({ enum: PLATFORM_MESSAGE_TYPES }) @IsOptional() @IsIn(PLATFORM_MESSAGE_TYPES) readonly type?: PlatformMessageType;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() readonly senderId?: string;
  @ApiPropertyOptional({ minimum: 1, description: 'Older messages: those before this seq' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) readonly beforeSeq?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) readonly limit?: number;
}

export class PlatformAuditQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() readonly adminId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() readonly targetUserId?: string;
  @ApiPropertyOptional({ description: 'Action, or its prefix (`admin.messages`)' }) @IsOptional() @Matches(/^[a-z_.]{1,64}$/) readonly action?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Actions on, or looks at, this workspace' }) @IsOptional() @IsUUID() readonly workspaceId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(CURSOR) readonly cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) readonly limit?: number;
}

export class PlatformWorkspaceQueryDto {
  @ApiPropertyOptional({ description: 'Name or slug contains' }) @IsOptional() @IsString() @MaxLength(80) readonly q?: string;
  @ApiPropertyOptional({ enum: WORKSPACE_STATUSES }) @IsOptional() @IsIn(WORKSPACE_STATUSES) readonly status?: PlatformWorkspaceStatus;
  @ApiPropertyOptional() @IsOptional() @Matches(CURSOR) readonly cursor?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) readonly limit?: number;
}

/* ------------------------------------------------------------------ responses */

export class PlatformAdminMeDto implements PlatformAdminMe {
  @ApiProperty({ format: 'uuid' }) readonly userId!: string;
  @ApiProperty() readonly fullName!: string;
  @ApiProperty({ description: 'The session was opened with a password and not yet confirmed with an SMS code' }) readonly smsConfirmationRequired!: boolean;
  @ApiProperty() readonly stepUpRequired!: boolean;
  @ApiProperty() readonly available!: boolean;
}

export class PlatformUserSummaryDto implements PlatformUserSummary {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly fullName!: string;
  @ApiProperty({ example: '+989121234567' }) readonly phone!: string;
  @ApiProperty({ type: String, nullable: true }) readonly email!: string | null;
  @ApiProperty({ enum: PLATFORM_USER_STATUSES }) readonly status!: PlatformUserStatus;
  @ApiProperty() readonly isPlatformAdmin!: boolean;
  @ApiProperty() readonly hasPassword!: boolean;
  @ApiProperty() readonly passwordResetRequired!: boolean;
  @ApiProperty() readonly workspaceCount!: number;
  @ApiProperty() readonly activeSessionCount!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly lastActiveAt!: string | null;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
}

export class PlatformUserPageDto implements PlatformUserPage {
  @ApiProperty({ type: PlatformUserSummaryDto, isArray: true }) readonly items!: PlatformUserSummaryDto[];
  @ApiProperty({ type: String, nullable: true }) readonly nextCursor!: string | null;
}

export class PlatformProjectMembershipDto {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly key!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ enum: PROJECT_ROLES }) readonly role!: ProjectRole;
}

export class PlatformMembershipDto implements PlatformMembership {
  @ApiProperty({ format: 'uuid' }) readonly workspaceId!: string;
  @ApiProperty() readonly workspaceName!: string;
  @ApiProperty() readonly workspaceSlug!: string;
  @ApiProperty() readonly workspaceDeleted!: boolean;
  @ApiProperty() readonly isOwner!: boolean;
  @ApiProperty() readonly roleKey!: string;
  @ApiProperty() readonly roleName!: string;
  @ApiProperty({ enum: MEMBER_STATUSES }) readonly memberStatus!: PlatformMembership['memberStatus'];
  @ApiProperty({ type: String, nullable: true }) readonly department!: string | null;
  @ApiProperty() readonly jobTitle!: string;
  @ApiProperty({ format: 'date-time' }) readonly joinedAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly leftAt!: string | null;
  @ApiProperty({ type: PlatformProjectMembershipDto, isArray: true }) readonly projects!: PlatformProjectMembershipDto[];
}

export class PlatformSuspensionDto implements PlatformSuspension {
  @ApiProperty({ format: 'date-time' }) readonly at!: string;
  @ApiProperty({ type: String, nullable: true }) readonly reason!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly adminId!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly adminName!: string | null;
}

export class PlatformUserDetailDto extends PlatformUserSummaryDto implements PlatformUserDetail {
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly passwordChangedAt!: string | null;
  @ApiProperty({ type: PlatformMembershipDto, isArray: true }) readonly memberships!: PlatformMembershipDto[];
  @ApiPropertyOptional({ type: PlatformSuspensionDto, nullable: true, description: 'While suspended: when, why and by whom' })
  readonly suspension?: PlatformSuspensionDto | null;
}

export class PlatformSessionViewDto implements PlatformSessionView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ enum: PLATFORM_SESSION_STATUSES }) readonly status!: PlatformSessionStatus;
  @ApiProperty({ type: String, nullable: true }) readonly deviceLabel!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly userAgent!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Chrome 128' }) readonly client!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Android 14' }) readonly os!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['mobile', 'tablet', 'desktop'] }) readonly deviceType!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly ip!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly lastIp!: string | null;
  @ApiProperty({ type: String, isArray: true }) readonly amr!: string[];
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) readonly lastActiveAt!: string;
  @ApiProperty({ format: 'date-time' }) readonly expiresAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly revokedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly revokeReason!: string | null;
}

export class PlatformSessionsRevokedDto implements PlatformSessionsRevoked {
  @ApiProperty() readonly revoked!: number;
}

export class PasswordResetIssuedDto implements PasswordResetIssued {
  @ApiProperty({ enum: PASSWORD_RESET_CHANNELS }) readonly channel!: PasswordResetChannel;
  @ApiProperty({ format: 'date-time' }) readonly expiresAt!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Masked phone or email' }) readonly sentTo!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '`manual` only, shown once' }) readonly code!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '`manual` only, shown once' }) readonly link!: string | null;
}

export class PlatformConversationViewDto implements PlatformConversationView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ format: 'uuid' }) readonly workspaceId!: string;
  @ApiProperty() readonly workspaceName!: string;
  @ApiProperty({ enum: CONVERSATION_KINDS }) readonly kind!: ConversationKind;
  @ApiProperty() readonly title!: string;
  @ApiProperty() readonly isPrivate!: boolean;
  @ApiProperty({ enum: MEMBERSHIP_MODES }) readonly membershipMode!: MembershipMode;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly projectId!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly projectName!: string | null;
  @ApiProperty() readonly memberCount!: number;
  @ApiProperty() readonly role!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly leftAt!: string | null;
  @ApiProperty() readonly messageCount!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly lastMessageAt!: string | null;
  @ApiProperty() readonly archived!: boolean;
}

export class PlatformConversationMemberDto {
  @ApiProperty({ format: 'uuid' }) readonly userId!: string;
  @ApiProperty() readonly fullName!: string;
  @ApiProperty() readonly role!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly leftAt!: string | null;
}

export class PlatformConversationDetailDto implements PlatformConversationDetail {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ format: 'uuid' }) readonly workspaceId!: string;
  @ApiProperty() readonly workspaceName!: string;
  @ApiProperty({ enum: CONVERSATION_KINDS }) readonly kind!: ConversationKind;
  @ApiProperty() readonly title!: string;
  @ApiProperty() readonly isPrivate!: boolean;
  @ApiProperty({ enum: MEMBERSHIP_MODES }) readonly membershipMode!: MembershipMode;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly projectId!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly projectName!: string | null;
  @ApiProperty() readonly memberCount!: number;
  @ApiProperty() readonly messageCount!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly lastMessageAt!: string | null;
  @ApiProperty() readonly archived!: boolean;
  @ApiProperty({ type: PlatformConversationMemberDto, isArray: true }) readonly members!: PlatformConversationMemberDto[];
}

export class PlatformMessagePageDto implements PlatformMessagePage {
  @ApiProperty({ type: MessageViewDto, isArray: true }) readonly items!: MessageView[];
  @ApiProperty({ type: Number, nullable: true }) readonly olderBeforeSeq!: number | null;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' }, description: 'Author id → name' })
  readonly authors!: Record<string, string>;
}

export class PlatformAttachmentLinkDto implements PlatformAttachmentLink {
  @ApiProperty() readonly url!: string;
  @ApiProperty({ format: 'date-time' }) readonly expiresAt!: string;
}

export class PlatformAuditEntryDto implements PlatformAuditEntry {
  @ApiProperty() readonly id!: number;
  @ApiProperty({ format: 'uuid' }) readonly adminId!: string;
  @ApiProperty() readonly adminName!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) readonly targetUserId!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly targetName!: string | null;
  @ApiProperty() readonly action!: string;
  @ApiProperty({ type: String, nullable: true }) readonly resourceType!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly resourceId!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly ip!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly userAgent!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly requestId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) readonly traceId?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) readonly workspaceId?: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true }) readonly metadata!: Record<string, unknown> | null;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
}

export class PlatformAuditPageDto implements PlatformAuditPage {
  @ApiProperty({ type: PlatformAuditEntryDto, isArray: true }) readonly items!: PlatformAuditEntryDto[];
  @ApiProperty({ type: String, nullable: true }) readonly nextCursor!: string | null;
}

export class PlatformWorkspaceSummaryDto implements PlatformWorkspaceSummary {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty() readonly slug!: string;
  @ApiProperty() readonly plan!: string;
  @ApiProperty({ format: 'uuid' }) readonly ownerId!: string;
  @ApiProperty() readonly ownerName!: string;
  @ApiProperty() readonly memberCount!: number;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly deletedAt!: string | null;
  @ApiPropertyOptional({ enum: WORKSPACE_STATUSES }) readonly status?: PlatformWorkspaceStatus;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' }) readonly suspendedAt?: string | null;
}

export class PlatformWorkspacePageDto implements PlatformWorkspacePage {
  @ApiProperty({ type: PlatformWorkspaceSummaryDto, isArray: true }) readonly items!: PlatformWorkspaceSummaryDto[];
  @ApiProperty({ type: String, nullable: true }) readonly nextCursor!: string | null;
}

export class PlatformWorkspaceRoleDto {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly key!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty() readonly rank!: number;
  @ApiProperty({ type: String, isArray: true, example: ['messages:view', 'boards:edit'] }) readonly grants!: string[];
  @ApiProperty() readonly memberCount!: number;
}

export class PlatformWorkspaceMemberDto {
  @ApiProperty({ format: 'uuid' }) readonly userId!: string;
  @ApiProperty() readonly fullName!: string;
  @ApiProperty() readonly phone!: string;
  @ApiProperty() readonly roleKey!: string;
  @ApiProperty() readonly roleName!: string;
  @ApiProperty({ enum: MEMBER_STATUSES }) readonly status!: PlatformWorkspaceDetail['members'][number]['status'];
  @ApiProperty() readonly isOwner!: boolean;
  @ApiProperty({ format: 'date-time' }) readonly joinedAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readonly leftAt!: string | null;
  @ApiPropertyOptional({ enum: PLATFORM_USER_STATUSES }) readonly accountStatus?: PlatformUserStatus;
  @ApiPropertyOptional() readonly hasPassword?: boolean;
}

export class PlatformPlanOptionDto implements PlatformPlanOption {
  @ApiProperty() readonly id!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ type: PlanLimitsDto }) readonly limits!: PlanLimits;
}

/** Any subset of the plan's limits, each replacing the plan's; `null` is unlimited where allowed. */
export class WorkspaceLimitOverridesDto implements WorkspaceLimitOverrides {
  @ApiPropertyOptional({ minimum: 1, maximum: 100_000 }) @ValidateIf((_, value) => value !== undefined) @IsInt() @Min(1) @Max(100_000) maxMembers?: number;
  @ApiPropertyOptional({ minimum: 1, description: 'Bytes' }) @ValidateIf((_, value) => value !== undefined) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) storageBytes?: number;
  @ApiPropertyOptional({ minimum: 1, description: 'Bytes' }) @ValidateIf((_, value) => value !== undefined) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) maxFileBytes?: number;
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, description: '`null`: unlimited' }) @IsOptional() @IsInt() @Min(1) @Max(36_500) messageHistoryDays?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, description: '`null`: unlimited' }) @IsOptional() @IsInt() @Min(1) @Max(100_000) maxProjects?: number | null;
}

export class PlatformWorkspaceUsageDto {
  @ApiProperty() readonly members!: number;
  @ApiProperty() readonly storageUsedBytes!: number;
  @ApiProperty() readonly projects!: number;
}

export class PlatformWorkspaceQuotaDto implements PlatformWorkspaceQuota {
  @ApiProperty() readonly planId!: string;
  @ApiProperty() readonly planName!: string;
  @ApiProperty({ type: WorkspaceLimitOverridesDto, nullable: true }) readonly overrides!: WorkspaceLimitOverrides | null;
  @ApiProperty({ type: PlanLimitsDto }) readonly effective!: PlanLimits;
  @ApiProperty({ type: PlatformWorkspaceUsageDto }) readonly usage!: PlatformWorkspaceUsageDto;
}

export class PlatformWorkspaceDetailDto extends PlatformWorkspaceSummaryDto implements PlatformWorkspaceDetail {
  @ApiProperty({ type: PlatformWorkspaceRoleDto, isArray: true }) readonly roles!: PlatformWorkspaceRoleDto[];
  @ApiProperty({ type: PlatformWorkspaceMemberDto, isArray: true }) readonly members!: PlatformWorkspaceMemberDto[];
  @ApiPropertyOptional({ type: PlatformSuspensionDto, nullable: true }) readonly suspension?: PlatformSuspensionDto | null;
  @ApiPropertyOptional({ type: PlatformWorkspaceQuotaDto }) readonly quota?: PlatformWorkspaceQuotaDto;
  @ApiPropertyOptional({ type: PlatformPlanOptionDto, isArray: true }) readonly planOptions?: PlatformPlanOptionDto[];
}

/* ---------------------------------------------------------------- phase 2: moderation */

/** Surrounding spaces do not count towards a reason's length. */
const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SuspendUserDto implements SuspendUserBody {
  @ApiProperty({ minLength: 3, maxLength: 500, description: 'Why, for the audit log' }) @Transform(trimmed) @IsString() @Length(3, 500) readonly reason!: string;
}

export class UnsuspendUserDto implements UnsuspendUserBody {
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @Transform(trimmed) @IsString() @MaxLength(500) readonly reason?: string;
}

export class PasswordResetRequiredDto implements PasswordResetRequiredBody {
  @ApiProperty({ description: '`true`: the password stops working until it is reset' }) @IsBoolean() readonly required!: boolean;
  @ApiPropertyOptional({ description: 'End every session too (default `true` when requiring a reset)' }) @IsOptional() @IsBoolean() readonly signOut?: boolean;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @Transform(trimmed) @IsString() @MaxLength(500) readonly reason?: string;
}

export class PlatformModerationResultDto implements PlatformModerationResult {
  @ApiProperty({ type: PlatformUserSummaryDto }) readonly user!: PlatformUserSummaryDto;
  @ApiProperty() readonly sessionsRevoked!: number;
  @ApiProperty({ description: '`false` when the account was already in the requested state' }) readonly changed!: boolean;
}

/* ---------------------------------------------------------------- phase 3: workspaces */

export class SuspendWorkspaceDto implements SuspendWorkspaceBody {
  @ApiProperty({ minLength: 3, maxLength: 500, description: 'Why, for the audit log' }) @Transform(trimmed) @IsString() @Length(3, 500) readonly reason!: string;
}

export class UnsuspendWorkspaceDto implements UnsuspendWorkspaceBody {
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @Transform(trimmed) @IsString() @MaxLength(500) readonly reason?: string;
}

export class TransferWorkspaceOwnershipDto implements TransferWorkspaceOwnershipBody {
  @ApiProperty({ format: 'uuid', description: 'An active member whose account is active' }) @IsUUID() readonly userId!: string;
  @ApiProperty({ minLength: 3, maxLength: 500 }) @Transform(trimmed) @IsString() @Length(3, 500) readonly reason!: string;
}

export class WorkspaceLimitsDto implements WorkspaceLimitsBody {
  @ApiPropertyOptional({ example: 'team' }) @IsOptional() @IsString() @Matches(/^[a-z0-9_-]{1,32}$/) readonly planId?: string;
  @ApiPropertyOptional({ type: WorkspaceLimitOverridesDto, nullable: true, description: 'Replaces the overrides; `null` clears them' })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkspaceLimitOverridesDto)
  readonly overrides?: WorkspaceLimitOverridesDto | null;
  @ApiProperty({ minLength: 3, maxLength: 500 }) @Transform(trimmed) @IsString() @Length(3, 500) readonly reason!: string;
}

export class PlatformWorkspaceModerationResultDto implements PlatformWorkspaceModerationResult {
  @ApiProperty({ type: PlatformWorkspaceSummaryDto }) readonly workspace!: PlatformWorkspaceSummaryDto;
  @ApiProperty({ description: '`false` when the workspace was already in the requested state' }) readonly changed!: boolean;
}

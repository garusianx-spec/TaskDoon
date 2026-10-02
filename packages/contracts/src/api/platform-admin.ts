import type { ConversationKind, RoleId } from '../domain.js';
import type { MembershipMode, MessageView } from './chat.js';
import type { ProjectRole } from './work.js';
import type { PlanLimits } from './workspaces.js';

/**
 * Platform super admin (phase 1): the operators of TaskDoon itself, across every workspace. Only
 * accounts flagged by the CLI reach these routes, after a password step-up; everyone else gets a
 * 404. Every look at a person's sessions, conversations, messages or files is written to the
 * platform audit log.
 */

export interface PlatformAdminMe {
  readonly userId: string;
  readonly fullName: string;
  /**
   * The session was opened with a password and not yet confirmed with an SMS code: the other
   * admin routes answer SMS_CONFIRMATION_REQUIRED (checked before the step-up).
   */
  readonly smsConfirmationRequired: boolean;
  /** No password step-up in the last 15 minutes: the other admin routes answer STEP_UP_REQUIRED. */
  readonly stepUpRequired: boolean;
  /** The admin database role is configured here (otherwise the admin routes answer 503). */
  readonly available: boolean;
}

export type PlatformUserStatus = 'active' | 'suspended' | 'deleted';

export interface PlatformUserSummary {
  readonly id: string;
  readonly fullName: string;
  /** E.164. */
  readonly phone: string;
  readonly email: string | null;
  readonly status: PlatformUserStatus;
  readonly isPlatformAdmin: boolean;
  readonly hasPassword: boolean;
  /** A reset code is outstanding: the old password no longer works. */
  readonly passwordResetRequired: boolean;
  readonly workspaceCount: number;
  readonly activeSessionCount: number;
  readonly lastActiveAt: string | null;
  readonly createdAt: string;
}

export interface PlatformUserPage {
  readonly items: readonly PlatformUserSummary[];
  readonly nextCursor: string | null;
}

export interface PlatformMembership {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly workspaceSlug: string;
  readonly workspaceDeleted: boolean;
  readonly isOwner: boolean;
  /** The workspace role: owner, admin, manager, member, guest (or a custom key). */
  readonly roleKey: RoleId | string;
  readonly roleName: string;
  readonly memberStatus: 'active' | 'suspended' | 'left';
  readonly department: string | null;
  readonly jobTitle: string;
  readonly joinedAt: string;
  readonly leftAt: string | null;
  readonly projects: readonly { readonly id: string; readonly key: string; readonly name: string; readonly role: ProjectRole }[];
}

export interface PlatformUserDetail extends PlatformUserSummary {
  readonly passwordChangedAt: string | null;
  readonly memberships: readonly PlatformMembership[];
  /** While the account is suspended: when, why and by whom (from the platform audit log). */
  readonly suspension?: PlatformSuspension | null;
}

export interface PlatformSuspension {
  readonly at: string;
  readonly reason: string | null;
  readonly adminId: string | null;
  readonly adminName: string | null;
}

export type PlatformSessionStatus = 'active' | 'revoked' | 'expired';

export interface PlatformSessionView {
  readonly id: string;
  readonly status: PlatformSessionStatus;
  readonly deviceLabel: string | null;
  readonly userAgent: string | null;
  /** Parsed from the user agent: `Chrome 128`, `Android 14`, `mobile` … */
  readonly client: string | null;
  readonly os: string | null;
  readonly deviceType: string | null;
  /** Where the session started (honours X-Forwarded-For behind the trusted proxy). */
  readonly ip: string | null;
  /** Where it last refreshed. */
  readonly lastIp: string | null;
  readonly amr: readonly string[];
  readonly createdAt: string;
  readonly lastActiveAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly revokeReason: string | null;
}

/** `POST /admin/users/:userId/sessions/revoke-all`. */
export interface PlatformSessionsRevoked {
  readonly revoked: number;
}

export type PasswordResetChannel = 'sms' | 'email' | 'manual';

export interface IssuePasswordResetBody {
  /** `sms` / `email`: a link is sent. `manual`: the code is returned once, to hand over in person. */
  readonly channel: PasswordResetChannel;
}

export interface PasswordResetIssued {
  readonly channel: PasswordResetChannel;
  readonly expiresAt: string;
  /** Masked phone or email the link went to. */
  readonly sentTo: string | null;
  /** `manual` only, shown once: the single-use code and the link that carries it. Never stored in clear. */
  readonly code: string | null;
  readonly link: string | null;
}

/** `POST /password-reset`: the person sets a new password with the code (public, rate-limited). */
export interface CompletePasswordResetBody {
  readonly token: string;
  readonly newPassword: string;
}

export interface PlatformConversationView {
  readonly id: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly kind: ConversationKind;
  /** Direct chats: the people's names. */
  readonly title: string;
  readonly isPrivate: boolean;
  readonly membershipMode: MembershipMode;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly memberCount: number;
  /** The inspected person's role there, and when they left (if they did). */
  readonly role: string;
  readonly leftAt: string | null;
  readonly messageCount: number;
  readonly lastMessageAt: string | null;
  readonly archived: boolean;
}

export interface PlatformConversationDetail extends Omit<PlatformConversationView, 'role' | 'leftAt'> {
  readonly members: readonly { readonly userId: string; readonly fullName: string; readonly role: string; readonly leftAt: string | null }[];
}

export type PlatformMessageType = 'text' | 'voice' | 'image' | 'file';

export interface PlatformMessagePage {
  /** Oldest first. Deleted messages stay listed, without their content. */
  readonly items: readonly MessageView[];
  /** Pass as `beforeSeq` for older messages; `null` at the start. */
  readonly olderBeforeSeq: number | null;
  /** Names of the authors on this page. */
  readonly authors: Readonly<Record<string, string>>;
}

export interface PlatformAttachmentLink {
  readonly url: string;
  readonly expiresAt: string;
}

export interface PlatformAuditEntry {
  readonly id: number;
  readonly adminId: string;
  readonly adminName: string;
  readonly targetUserId: string | null;
  readonly targetName: string | null;
  readonly action: string;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly requestId: string | null;
  /** The request's trace id; `null` for entries written before it was recorded. */
  readonly traceId?: string | null;
  /** Phase 3: the workspace an action concerned, when there is one. */
  readonly workspaceId?: string | null;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly createdAt: string;
}

export interface PlatformAuditPage {
  readonly items: readonly PlatformAuditEntry[];
  readonly nextCursor: string | null;
}

export interface PlatformWorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly plan: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly memberCount: number;
  readonly createdAt: string;
  readonly deletedAt: string | null;
  /** Phase 3: `deleted` wins over `suspended`. */
  readonly status?: PlatformWorkspaceStatus;
  readonly suspendedAt?: string | null;
}

export type PlatformWorkspaceStatus = 'active' | 'suspended' | 'deleted';

export interface PlatformWorkspacePage {
  readonly items: readonly PlatformWorkspaceSummary[];
  readonly nextCursor: string | null;
}

export interface PlatformWorkspaceDetail extends PlatformWorkspaceSummary {
  readonly roles: readonly {
    readonly id: string;
    readonly key: string;
    readonly name: string;
    readonly rank: number;
    /** Granted matrix cells, `module:action` (the owner holds every cell). */
    readonly grants: readonly string[];
    readonly memberCount: number;
  }[];
  readonly members: readonly {
    readonly userId: string;
    readonly fullName: string;
    readonly phone: string;
    readonly roleKey: string;
    readonly roleName: string;
    readonly status: 'active' | 'suspended' | 'left';
    readonly isOwner: boolean;
    readonly joinedAt: string;
    readonly leftAt: string | null;
    /** Phase 3: the person's account, apart from their membership here. */
    readonly accountStatus?: PlatformUserStatus;
    /** Phase 3: whether they have a password (a new owner without one is warned about). */
    readonly hasPassword?: boolean;
  }[];
  /** Phase 3: while suspended, when, why and by whom (from the platform audit log). */
  readonly suspension?: PlatformSuspension | null;
  readonly quota?: PlatformWorkspaceQuota;
  /** Phase 3: the plans a workspace can be moved to. */
  readonly planOptions?: readonly PlatformPlanOption[];
}

/* ---------------------------------------------------------------- phase 2: moderation */

/** `POST /admin/users/:userId/suspend`: the account stops working at once (every session ends). */
export interface SuspendUserBody {
  /** Why, for the audit log and the next admin (3 to 500 characters). */
  readonly reason: string;
}

/** `POST /admin/users/:userId/unsuspend`: the person may sign in again. */
export interface UnsuspendUserBody {
  readonly reason?: string;
}

/** `PUT /admin/users/:userId/password-reset-required`. */
export interface PasswordResetRequiredBody {
  /** `true`: the password stops working until it is reset (by SMS code or an admin reset link). */
  readonly required: boolean;
  /** End every session as well (default `true` when requiring a reset). */
  readonly signOut?: boolean;
  readonly reason?: string;
}

/** What a moderation action left behind. */
export interface PlatformModerationResult {
  readonly user: PlatformUserSummary;
  /** Sessions ended by this action. */
  readonly sessionsRevoked: number;
  /** `false` when the account was already in the requested state. */
  readonly changed: boolean;
}

/* ---------------------------------------------------------------- phase 3: workspaces */

export interface PlatformPlanOption {
  readonly id: string;
  readonly name: string;
  readonly limits: PlanLimits;
}

/** A workspace's plan, the admin's overrides of it, what applies, and what is in use. */
export interface PlatformWorkspaceQuota {
  readonly planId: string;
  readonly planName: string;
  /** Only the limits an admin set; each one replaces the plan's. */
  readonly overrides: WorkspaceLimitOverrides | null;
  /** The plan's limits with the overrides applied: what the workspace is held to. */
  readonly effective: PlanLimits;
  readonly usage: {
    /** Seats in use (active and suspended members). */
    readonly members: number;
    readonly storageUsedBytes: number;
    /** Projects not in the trash. */
    readonly projects: number;
  };
}

/** Any subset of the plan's limits; `null` means unlimited where the plan allows that. */
export type WorkspaceLimitOverrides = { -readonly [K in keyof PlanLimits]?: PlanLimits[K] };

/** `POST /admin/workspaces/:workspaceId/suspend`: its members are refused until it is lifted. */
export interface SuspendWorkspaceBody {
  /** Why, for the audit log (3 to 500 characters). */
  readonly reason: string;
}

/** `POST /admin/workspaces/:workspaceId/unsuspend`. */
export interface UnsuspendWorkspaceBody {
  readonly reason?: string;
}

/** `POST /admin/workspaces/:workspaceId/transfer-ownership`: an emergency override. */
export interface TransferWorkspaceOwnershipBody {
  /** An active member whose account is active. */
  readonly userId: string;
  readonly reason: string;
}

/** `PUT /admin/workspaces/:workspaceId/limits`. */
export interface WorkspaceLimitsBody {
  /** Move the workspace to this plan. */
  readonly planId?: string;
  /** Replaces the overrides; `null` clears them; omitted leaves them as they are. */
  readonly overrides?: WorkspaceLimitOverrides | null;
  readonly reason: string;
}

/** What a workspace action left behind. */
export interface PlatformWorkspaceModerationResult {
  readonly workspace: PlatformWorkspaceSummary;
  /** `false` when the workspace was already in the requested state. */
  readonly changed: boolean;
}

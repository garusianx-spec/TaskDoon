import type { AvatarTone, InvitationChannel, PresenceState, RoleId, RolePermissions } from '../domain.js';
import type { MeUser } from './auth.js';

/* ============================== Me ============================== */

/** One entry of the workspace switcher. */
export interface MeWorkspace {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly initials: string;
  readonly tone: AvatarTone;
  readonly iconUrl: string | null;
  readonly role: RoleId;
  readonly isOwner: boolean;
}

export interface MeResponse {
  readonly user: MeUser;
  readonly workspaces: readonly MeWorkspace[];
}

export interface UpdateMeBody {
  readonly fullName?: string;
  readonly email?: string | null;
  readonly avatarTone?: AvatarTone;
}

/* ============================== Workspaces ============================== */

export type WeekDay = 'saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';

export interface WorkspaceSettings {
  /** IANA zone that calendar dates, "today" and reminders are computed in. */
  readonly timeZone: string;
  readonly weekStart: WeekDay;
  readonly weekend: readonly WeekDay[];
  /** Post a system message in the conversation when one of its messages becomes a task. */
  readonly systemMessageOnConvert: boolean;
  /** When non-empty, email invitations may only go to these domains. */
  readonly allowedEmailDomains: readonly string[];
}

export interface PlanLimits {
  readonly maxMembers: number;
  readonly storageBytes: number;
  readonly maxFileBytes: number;
  /** `null` keeps the whole history. */
  readonly messageHistoryDays: number | null;
  /** `null` is unlimited. */
  readonly maxProjects: number | null;
}

export interface WorkspaceView {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly initials: string;
  readonly tone: AvatarTone;
  /** A short-lived signed URL, or `null` when the workspace shows its monogram. */
  readonly iconUrl: string | null;
  readonly ownerId: string;
  readonly planId: string;
  readonly limits: PlanLimits;
  readonly memberCount: number;
  readonly settings: WorkspaceSettings;
  readonly createdAt: string;
}

export interface CreateWorkspaceBody {
  readonly name: string;
  readonly description?: string;
  readonly tone?: AvatarTone;
  /** The `key` of a completed icon upload ticket. */
  readonly iconUploadKey?: string;
}

export interface UpdateWorkspaceBody {
  readonly name?: string;
  readonly description?: string;
  readonly tone?: AvatarTone;
  /** A new icon's upload key, or `null` to go back to the monogram. */
  readonly iconUploadKey?: string | null;
  readonly settings?: Partial<WorkspaceSettings>;
}

export interface DeleteWorkspaceBody {
  /** Must equal the workspace name exactly, as typed in the confirmation dialog. */
  readonly confirmName: string;
}

export interface TransferOwnershipBody {
  readonly userId: string;
}

/** A presigned POST: the browser uploads the file straight to object storage with these fields. */
export interface UploadTicket {
  readonly key: string;
  readonly url: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly maxBytes: number;
  readonly contentTypes: readonly string[];
  readonly expiresInSeconds: number;
}

/* ============================== Members & departments ============================== */

export type MemberStatus = 'active' | 'suspended' | 'left';

/** Presence a member can set; `offline` is derived from connectivity and never stored. */
export type ManualPresence = Exclude<PresenceState, 'offline'>;

export interface MemberView {
  readonly userId: string;
  readonly fullName: string;
  readonly phone: string;
  readonly email: string | null;
  readonly avatarTone: AvatarTone;
  readonly role: RoleId;
  readonly isOwner: boolean;
  readonly departmentId: string | null;
  readonly jobTitle: string;
  readonly status: MemberStatus;
  readonly presence: ManualPresence;
  /** Connected on at least one device right now (from the realtime gateway). */
  readonly online: boolean;
  readonly statusMessage: string;
  readonly joinedAt: string;
  /**
   * Former members (`status: 'left'`, listed with `includeFormer`) keep their name on what they
   * wrote; their phone and email are not shown. Re-invited within 40 days, they get their
   * conversations and projects back.
   */
  readonly leftAt?: string | null;
}

export interface UpdateMemberBody {
  readonly role?: RoleId;
  readonly departmentId?: string | null;
  readonly jobTitle?: string;
  readonly status?: Exclude<MemberStatus, 'left'>;
}

export interface UpdatePresenceBody {
  readonly presence: ManualPresence;
  readonly statusMessage?: string;
}

export interface DepartmentView {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly memberCount: number;
}

export interface CreateDepartmentBody {
  readonly name: string;
}

export interface UpdateDepartmentBody {
  readonly name?: string;
  readonly position?: number;
}

/* ============================== Invitations ============================== */

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface CreateInvitationsBody {
  /** Raw entries as typed; each is normalised and classified server-side. */
  readonly recipients: readonly { readonly address: string; readonly channel?: InvitationChannel }[];
  readonly role: RoleId;
  readonly departmentId?: string | null;
  readonly message?: string;
}

export interface InvitationView {
  readonly id: string;
  /** A lower-cased email, or an E.164 mobile number. */
  readonly address: string;
  readonly channel: InvitationChannel;
  readonly role: RoleId;
  readonly departmentId: string | null;
  readonly message: string;
  readonly status: InvitationStatus;
  readonly invitedById: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export type InvitationRejection = 'invalid_address' | 'already_member' | 'already_invited' | 'domain_not_allowed';

export interface CreateInvitationsResult {
  readonly created: readonly InvitationView[];
  readonly rejected: readonly {
    readonly address: string;
    readonly reason: InvitationRejection;
  }[];
}

export interface AcceptInvitationBody {
  readonly token: string;
}

export interface AcceptInvitationResult {
  readonly workspaceId: string;
  readonly role: RoleId;
}

/* ============================== Roles & permissions ============================== */

export interface RoleView {
  readonly id: string;
  readonly key: RoleId;
  readonly rank: number;
  readonly locked: boolean;
  readonly memberCount: number;
  readonly permissions: RolePermissions;
  /** Echo as `If-Match` when replacing the row, so two admins cannot overwrite each other. */
  readonly version: number;
}

export interface UpdateRolePermissionsBody {
  readonly permissions: RolePermissions;
}

/** What the signed-in member may do in one workspace; the UI gates controls with it. */
export interface MyPermissions {
  readonly workspaceId: string;
  readonly role: RoleId;
  readonly isOwner: boolean;
  readonly permissions: RolePermissions;
  readonly rbacVersion: number;
}

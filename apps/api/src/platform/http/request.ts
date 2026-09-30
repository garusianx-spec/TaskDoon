import type { AuthMethod, RoleId } from '@taskin/contracts';

/** Who is calling, established by JwtAuthGuard from the access token. */
export interface AuthPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly amr: readonly AuthMethod[];
  /** Unix seconds of the OTP sign-in that started the session. */
  readonly authTime: number;
  /** Unix seconds of the last password re-verification, if any. */
  readonly stepUpAt: number | null;
  readonly securityVersion: number;
  /** Unix seconds when the access token expires (sockets keep it to enforce the expiry). */
  readonly expiresAt: number;
}

/** The caller's standing in the workspace named by the route, established by WorkspaceMemberGuard. */
export interface MembershipContext {
  readonly workspaceId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly roleKey: RoleId;
  readonly rank: number;
  readonly isOwner: boolean;
  readonly ownerUserId: string;
  /** Granted matrix cells as `module:action`; the owner implicitly holds all of them. */
  readonly grants: readonly string[];
  readonly rbacVersion: number;
}

export interface AuthenticatedRequest {
  auth?: AuthPrincipal;
  member?: MembershipContext;
}

import type { AvatarTone } from '../domain.js';

/**
 * Authentication contracts. The phone number is the account: sign-in is phone → SMS code. Only
 * owners and admins hold a password, and it is a second factor for sensitive actions (step-up),
 * never a way to sign in on its own.
 *
 * The access token travels in `Authorization: Bearer`. The refresh token never reaches script: it
 * lives in an HttpOnly cookie scoped to `/api/v1/auth`, and the refresh and logout calls must echo
 * the `__Host-taskin_csrf` cookie in an `X-CSRF-Token` header.
 */

export interface OtpRequestBody {
  /** Any written form of an Iranian mobile number: `0912…`, `+98 912 …`, Persian digits. */
  readonly phone: string;
}

/** Identical whether or not the number has an account, so the endpoint cannot enumerate users. */
export interface OtpChallenge {
  readonly challengeId: string;
  readonly codeLength: number;
  readonly expiresInSeconds: number;
  /** Seconds before another code may be requested for this number. */
  readonly resendInSeconds: number;
}

export interface OtpVerifyBody {
  readonly challengeId: string;
  readonly code: string;
  /** Shown in the active-sessions list, e.g. «کروم روی ویندوز». */
  readonly deviceLabel?: string;
}

export type OtpVerifyResult =
  | { readonly status: 'signed_in'; readonly session: AuthSession }
  | {
      readonly status: 'signup_required';
      /** Proves the phone was verified; exchange it at `POST /auth/signup` within its lifetime. */
      readonly signupToken: string;
      readonly expiresInSeconds: number;
    };

export interface SignupBody {
  readonly signupToken: string;
  readonly fullName: string;
  readonly deviceLabel?: string;
}

export interface MeUser {
  readonly id: string;
  /** E.164, e.g. `+989121234567`. */
  readonly phone: string;
  readonly email: string | null;
  readonly fullName: string;
  readonly avatarTone: AvatarTone;
  readonly locale: string;
  readonly timeZone: string;
  /** Owners and admins must have one; the UI prompts before any elevation. */
  readonly hasPassword: boolean;
}

/** Returned by sign-in, sign-up, refresh and step-up. The refresh token is set as a cookie. */
export interface AuthSession {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresInSeconds: number;
  readonly sessionId: string;
  readonly user: MeUser;
}

export interface StepUpBody {
  readonly password: string;
}

export interface SetPasswordBody {
  /** Required when a password already exists, unless the session stepped up in the last 15 minutes. */
  readonly currentPassword?: string;
  readonly newPassword: string;
}

/** How a session proved who it is, per RFC 8176: `otp` always, `pwd` after a step-up. */
export type AuthMethod = 'otp' | 'pwd';

export interface SessionView {
  readonly id: string;
  readonly deviceLabel: string | null;
  readonly userAgent: string | null;
  readonly ip: string | null;
  readonly city: string | null;
  readonly createdAt: string;
  readonly lastActiveAt: string;
  /** The session making this request; it can sign out but not revoke itself from the list. */
  readonly current: boolean;
}

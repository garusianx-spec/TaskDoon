import type { AuthSession, MeUser, OtpChallenge, OtpVerifyResult } from '@taskin/contracts';
import { ApiProblem, http, installCredentials } from '@/lib/api-client';

/**
 * The signed-in session (RFC §5.1). The access token lives in memory only; the refresh token is
 * an HttpOnly cookie the script never sees. `restore()` turns that cookie into a session after a
 * reload, and a timer refreshes the access token a minute before it expires. Listeners hear
 * about every new token (the socket passes it on in-band) and about the session ending.
 */
export interface LiveSession {
  readonly accessToken: string;
  readonly sessionId: string;
  readonly user: MeUser;
  /** Epoch milliseconds. */
  readonly expiresAt: number;
}

export interface AdminPasswordChallenge {
  readonly status: 'password_required' | 'admin_setup_required';
  readonly temporaryToken: string;
  readonly expiresInSeconds: number;
}

type Listener = (session: LiveSession | null) => void;

let current: LiveSession | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight: { readonly generation: number; readonly promise: Promise<boolean> } | null = null;
/** Why the last session ended, when the server said: the account was suspended. */
let endReason: 'suspended' | null = null;
/** This device is signing out: the server's own `session:revoked` for it needs no refresh. */
let signingOut = false;
let sessionGeneration = 0;
const listeners = new Set<Listener>();

/** Refresh this long before the access token expires. */
const REFRESH_AHEAD_MS = 60_000;
const SIGNED_OUT_KEY = 'taskin.signed-out';

export const session = {
  get current(): LiveSession | null {
    return current;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** After a reload: trade the refresh cookie for a session, or `null` when there is none. */
  async restore(): Promise<LiveSession | null> {
    // A failed logout request must not silently restore this browser on the next page load.
    try {
      if (!current && localStorage.getItem(SIGNED_OUT_KEY) === '1') return null;
    } catch {
      // Storage may be unavailable; the server's revocation remains authoritative.
    }
    // The readable CSRF cookie is set and cleared with the (unreadable) refresh cookie: without
    // it there is no session to restore, and asking would only be refused.
    if (!current && !('x-csrf-token' in csrfHeader())) return null;
    return (await refresh()) ? current : null;
  },

  requestCode(phone: string): Promise<OtpChallenge> {
    return http.post<OtpChallenge>('/auth/otp/request', { phone }, { authenticated: false });
  },

  /** Signs in, or says a new number must pick a name first (`signupToken`). */
  async verifyCode(
    challengeId: string,
    code: string,
  ): Promise<{ readonly signupToken: string } | AdminPasswordChallenge | LiveSession> {
    const result = await http.post<OtpVerifyResult>(
      '/auth/otp/verify',
      { challengeId, code, deviceLabel: deviceLabel() },
      { authenticated: false },
    );
    if (result.status === 'signup_required') return { signupToken: result.signupToken };
    if (result.status === 'password_required' || result.status === 'admin_setup_required') {
      end();
      return result;
    }
    return adopt(result.session);
  },

  /** Completes the second factor. A temporary challenge is never an API credential. */
  async completeAdminPassword(temporaryToken: string, password: string): Promise<LiveSession> {
    return adopt(
      await http.post<AuthSession>(
        '/auth/admin/password',
        { temporaryToken, password, deviceLabel: deviceLabel() },
        { authenticated: false },
      ),
    );
  },

  requestAdminSetup(temporaryToken: string): Promise<void> {
    return http.post<void>('/auth/admin/setup/request', { temporaryToken }, { authenticated: false });
  },
  async completeAdminSetup(temporaryToken: string, code: string, newPassword: string): Promise<void> {
    await http.post<void>(
      '/auth/admin/setup/complete',
      { temporaryToken, code, newPassword },
      { authenticated: false },
    );
    end();
  },

  requestAdminRecovery(temporaryToken: string): Promise<void> {
    return http.post<void>('/auth/admin/recovery/request', { temporaryToken }, { authenticated: false });
  },

  async completeAdminRecovery(temporaryToken: string, code: string, newPassword: string): Promise<void> {
    await http.post<void>(
      '/auth/admin/recovery/complete',
      { temporaryToken, code, newPassword },
      { authenticated: false },
    );
    end();
  },

  requestEmailVerification(): Promise<void> {
    return http.post<void>('/auth/email/verification/request');
  },

  confirmEmailVerification(code: string): Promise<void> {
    return http.post<void>('/auth/email/verification/confirm', { code });
  },

  /** The alternative to the SMS code, for an account that has set a password. */
  async passwordSignIn(phone: string, password: string): Promise<LiveSession> {
    return adopt(
      await http.post<AuthSession>(
        '/auth/password/login',
        { phone, password, deviceLabel: deviceLabel() },
        { authenticated: false },
      ),
    );
  },

  /** «فراموشی رمز عبور»: texts a reset code (the same answer whether or not the number has an account). */
  requestPasswordReset(phone: string): Promise<OtpChallenge> {
    return http.post<OtpChallenge>('/auth/password/forgot', { phone }, { authenticated: false });
  },

  /** A new password with that code. Every session of the account ends; sign in again afterwards. */
  async resetPassword(challengeId: string, code: string, newPassword: string): Promise<void> {
    await http.post<void>(
      '/auth/password/recover',
      { challengeId, code, newPassword },
      { authenticated: false },
    );
  },

  /** Texts a code to this account's own phone, to confirm a session opened with the password. */
  requestConfirmCode(): Promise<OtpChallenge> {
    return http.post<OtpChallenge>('/auth/otp/confirm/request');
  },

  async confirmCode(challengeId: string, code: string): Promise<void> {
    adopt(await http.post<AuthSession>('/auth/otp/confirm', { challengeId, code }));
  },

  async signUp(signupToken: string, fullName: string): Promise<LiveSession> {
    return adopt(
      await http.post<AuthSession>(
        '/auth/signup',
        { signupToken, fullName, deviceLabel: deviceLabel() },
        { authenticated: false },
      ),
    );
  },

  /** Owners and admins need a password (a second factor, never a way to sign in). */
  async setPassword(newPassword: string, currentPassword?: string): Promise<void> {
    await http.post<void>('/auth/password', { newPassword, ...(currentPassword ? { currentPassword } : {}) });
    if (current) set({ ...current, user: { ...current.user, hasPassword: true } });
  },

  /** Re-checks the password; the new token allows sensitive actions for 15 minutes. */
  async stepUp(password: string): Promise<void> {
    adopt(await http.post<AuthSession>('/auth/step-up', { password }));
  },

  updateUser(user: MeUser): void {
    if (current) set({ ...current, user });
  },

  /** Signs this device out. The local session ends even if the server cannot be reached. */
  async signOut(): Promise<void> {
    signingOut = true;
    sessionGeneration += 1;
    clearTimeout(refreshTimer);
    try {
      localStorage.setItem(SIGNED_OUT_KEY, '1');
    } catch {
      // Still revoke the server session when storage is unavailable.
    }
    try {
      await http.post<void>('/auth/logout', undefined, { headers: csrfHeader(), authenticated: true });
    } catch {
      // The cookie is cleared by the server when it answers; either way this tab is done.
    }
    end();
    signingOut = false;
  },

  /** The server ended the session (revoked elsewhere, or the refresh token was reused). */
  end,

  /**
   * A socket heard `session:revoked`. One refresh asks the server why, so a suspended account
   * can say so on the sign-in screen; only the generation that heard it is ended.
   */
  async revoked(): Promise<void> {
    const generation = sessionGeneration;
    if (current && !signingOut) await refresh().catch(() => false);
    if (generation === sessionGeneration) end();
  },

  /** `suspended` when the last session ended because the account is suspended; cleared by a sign-in. */
  endReason(): 'suspended' | null {
    return endReason;
  },
};

installCredentials({ token: () => current?.accessToken ?? null, refresh });

function set(next: LiveSession | null): void {
  current = next;
  clearTimeout(refreshTimer);
  if (next) {
    const delay = Math.max(5_000, next.expiresAt - Date.now() - REFRESH_AHEAD_MS);
    refreshTimer = setTimeout(() => void refresh().catch(() => undefined), delay);
  }
  for (const listener of listeners) listener(next);
}

function adopt(body: AuthSession, fromRefresh = false): LiveSession {
  if (!fromRefresh) {
    sessionGeneration += 1;
    try {
      localStorage.removeItem(SIGNED_OUT_KEY);
    } catch {
      // A successful sign-in still works without browser storage.
    }
  }
  const next: LiveSession = {
    accessToken: body.accessToken,
    sessionId: body.sessionId,
    user: body.user,
    expiresAt: Date.now() + body.expiresInSeconds * 1000,
  };
  endReason = null;
  set(next);
  return next;
}

function end(): void {
  sessionGeneration += 1;
  if (current !== null) set(null);
}

/** Concurrent 401s share a refresh only within the same session generation. */
function refresh(): Promise<boolean> {
  if (signingOut) return Promise.resolve(false);
  const generation = sessionGeneration;
  if (inFlight?.generation === generation) return inFlight.promise;
  const flight = {
    generation,
    promise: (async () => {
      try {
        const body = await http.post<AuthSession>('/auth/refresh', undefined, {
          headers: csrfHeader(),
          authenticated: false,
        });
        if (generation !== sessionGeneration || signingOut) return false;
        adopt(body, true);
        return true;
      } catch (error) {
        if (generation !== sessionGeneration || signingOut) return false;
        // Only a confirmed invalid credential ends the session. An outage is not a sign-out.
        if (
          error instanceof ApiProblem &&
          (error.code === 'UNAUTHENTICATED' ||
            error.code === 'REFRESH_INVALID' ||
            error.code === 'SESSION_REVOKED' ||
            error.code === 'ACCOUNT_SUSPENDED')
        ) {
          if (error.code === 'ACCOUNT_SUSPENDED') endReason = 'suspended';
          end();
          return false;
        }
        throw error;
      }
    })(),
  };
  inFlight = flight;
  flight.promise = flight.promise.finally(() => {
    // An older request may finish while a newer generation's refresh is still pending.
    if (inFlight === flight) inFlight = null;
  });
  return flight.promise;
}

/** The refresh and logout calls echo the readable CSRF cookie (`__Host-` prefixed behind TLS). */
function csrfHeader(): Record<string, string> {
  const cookies = document.cookie.split(';').map((entry) => entry.trim());
  for (const name of ['__Host-taskin_csrf', 'taskin_csrf']) {
    const found = cookies.find((entry) => entry.startsWith(`${name}=`));
    if (found) return { 'x-csrf-token': decodeURIComponent(found.slice(name.length + 1)) };
  }
  return {};
}

/** «کروم روی ویندوز» — how this device appears in the active-sessions list. */
function deviceLabel(): string {
  const agent = navigator.userAgent;
  const browser = /Edg\//.test(agent)
    ? 'اج'
    : /Firefox\//.test(agent)
      ? 'فایرفاکس'
      : /Chrome\//.test(agent)
        ? 'کروم'
        : /Safari\//.test(agent)
          ? 'سافاری'
          : 'مرورگر';
  const system = /Android/.test(agent)
    ? 'اندروید'
    : /iPhone|iPad/.test(agent)
      ? 'iOS'
      : /Windows/.test(agent)
        ? 'ویندوز'
        : /Mac OS X/.test(agent)
          ? 'مک'
          : /Linux/.test(agent)
            ? 'لینوکس'
            : 'دستگاه ناشناس';
  return `${browser} روی ${system}`;
}

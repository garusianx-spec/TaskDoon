import type { AuthSession, MeUser, OtpChallenge, OtpVerifyResult } from '@taskin/contracts';
import { ApiProblem, http, installCredentials } from './http';

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

type Listener = (session: LiveSession | null) => void;

let current: LiveSession | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<boolean> | null = null;
const listeners = new Set<Listener>();

/** Refresh this long before the access token expires. */
const REFRESH_AHEAD_MS = 60_000;

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
    // The readable CSRF cookie is set and cleared with the (unreadable) refresh cookie: without
    // it there is no session to restore, and asking would only be refused.
    if (!current && !('x-csrf-token' in csrfHeader())) return null;
    return (await refresh()) ? current : null;
  },

  requestCode(phone: string): Promise<OtpChallenge> {
    return http.post<OtpChallenge>('/auth/otp/request', { phone }, { authenticated: false });
  },

  /** Signs in, or says a new number must pick a name first (`signupToken`). */
  async verifyCode(challengeId: string, code: string): Promise<{ readonly signupToken: string } | LiveSession> {
    const result = await http.post<OtpVerifyResult>('/auth/otp/verify', { challengeId, code, deviceLabel: deviceLabel() }, { authenticated: false });
    if (result.status === 'signup_required') return { signupToken: result.signupToken };
    return adopt(result.session);
  },

  async signUp(signupToken: string, fullName: string): Promise<LiveSession> {
    return adopt(await http.post<AuthSession>('/auth/signup', { signupToken, fullName, deviceLabel: deviceLabel() }, { authenticated: false }));
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
    try {
      await http.post<void>('/auth/logout', undefined, { headers: csrfHeader(), authenticated: true });
    } catch {
      // The cookie is cleared by the server when it answers; either way this tab is done.
    }
    end();
  },

  /** The server ended the session (revoked elsewhere, or the refresh token was reused). */
  end,
};

installCredentials({ token: () => current?.accessToken ?? null, refresh });

function set(next: LiveSession | null): void {
  current = next;
  clearTimeout(refreshTimer);
  if (next) {
    const delay = Math.max(5_000, next.expiresAt - Date.now() - REFRESH_AHEAD_MS);
    refreshTimer = setTimeout(() => void refresh(), delay);
  }
  for (const listener of listeners) listener(next);
}

function adopt(body: AuthSession): LiveSession {
  const next: LiveSession = {
    accessToken: body.accessToken,
    sessionId: body.sessionId,
    user: body.user,
    expiresAt: Date.now() + body.expiresInSeconds * 1000,
  };
  set(next);
  return next;
}

function end(): void {
  if (current !== null) set(null);
}

/** One refresh at a time: concurrent 401s share it. Resolves false when the session is over. */
function refresh(): Promise<boolean> {
  inFlight ??= (async () => {
    try {
      adopt(await http.post<AuthSession>('/auth/refresh', undefined, { headers: csrfHeader(), authenticated: false }));
      return true;
    } catch (error) {
      // A network failure keeps the session (the next call retries); a refusal ends it.
      if (error instanceof ApiProblem && error.code === 'NETWORK') return current !== null;
      end();
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
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

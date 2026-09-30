import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../../config/app-config.js';
import { randomToken } from '../../platform/crypto/crypto.js';

export const AUTH_PATH = '/api/v1/auth';

interface CookieSpec {
  readonly name: string;
  readonly options: CookieOptions;
}

/**
 * The two auth cookies (RFC §5.1). The refresh token is HttpOnly and scoped to the auth routes
 * (`__Secure-` prefix: a `__Host-` cookie must have `Path=/`). The CSRF token is readable by the
 * web app's script and scoped to the whole origin, so the app can echo it in `X-CSRF-Token`.
 * Without `COOKIE_SECURE` (plain-http tooling only) the prefixes are dropped, as browsers require.
 */
export function authCookies(config: AppConfig): { refresh: CookieSpec; csrf: CookieSpec } {
  const secure = config.env.COOKIE_SECURE;
  return {
    refresh: {
      name: secure ? '__Secure-taskin_rt' : 'taskin_rt',
      options: { httpOnly: true, secure, sameSite: 'strict', path: AUTH_PATH },
    },
    csrf: {
      name: secure ? '__Host-taskin_csrf' : 'taskin_csrf',
      options: { httpOnly: false, secure, sameSite: 'strict', path: '/' },
    },
  };
}

export function setAuthCookies(response: Response, config: AppConfig, refreshToken: string, expiresAt: Date): void {
  const { refresh, csrf } = authCookies(config);
  response.cookie(refresh.name, refreshToken, { ...refresh.options, expires: expiresAt });
  response.cookie(csrf.name, randomToken(24), { ...csrf.options, expires: expiresAt });
}

export function clearAuthCookies(response: Response, config: AppConfig): void {
  const { refresh, csrf } = authCookies(config);
  response.clearCookie(refresh.name, refresh.options);
  response.clearCookie(csrf.name, csrf.options);
}

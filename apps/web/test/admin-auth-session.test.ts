import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '@taskin/contracts';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../src/api/http', () => ({
  ApiProblem: class extends Error {},
  http: { post },
  installCredentials: vi.fn(),
}));

import { session } from '../src/api/session';

const grant: AuthSession = {
  accessToken: 'full-session', tokenType: 'Bearer', expiresInSeconds: 900, sessionId: 'session-1',
  user: { id: 'user-1', phone: '+989901819085', email: 'admin@example.test', fullName: 'مدیر آزمون', avatarTone: 'brand', locale: 'fa-IR', timeZone: 'Asia/Tehran', hasPassword: true },
};

beforeEach(() => {
  post.mockReset();
  vi.stubGlobal('navigator', { userAgent: 'Chrome/120 Linux' });
});
afterEach(() => {
  session.end();
  vi.unstubAllGlobals();
});

describe('conditional admin sign-in', () => {
  it('does not adopt a temporary token or leave an existing in-memory session active after OTP', async () => {
    post.mockResolvedValueOnce(grant);
    await session.passwordSignIn('09121234567', 'Example123!');
    expect(session.current).not.toBeNull();
    const challenge = { status: 'password_required', temporaryToken: 'restricted-challenge', expiresInSeconds: 300 };
    post.mockResolvedValueOnce(challenge);
    expect(await session.verifyCode('otp-1', '123456')).toEqual(challenge);
    expect(session.current).toBeNull();
    expect(post).toHaveBeenLastCalledWith('/auth/otp/verify', expect.objectContaining({ challengeId: 'otp-1', code: '123456' }), { authenticated: false });
  });

  it('adopts a session only after a successful admin password challenge', async () => {
    post.mockRejectedValueOnce(new Error('wrong password'));
    await expect(session.completeAdminPassword('restricted-challenge', 'wrong')).rejects.toThrow('wrong password');
    expect(session.current).toBeNull();
    post.mockResolvedValueOnce(grant);
    await session.completeAdminPassword('restricted-challenge', 'Example123!');
    expect(session.current?.accessToken).toBe('full-session');
    expect(post).toHaveBeenLastCalledWith('/auth/admin/password', expect.objectContaining({ temporaryToken: 'restricted-challenge', password: 'Example123!' }), { authenticated: false });
  });

  it('resets through email without silently issuing a password-only session', async () => {
    post.mockResolvedValue(undefined);
    await session.requestAdminRecovery('restricted-challenge');
    await session.completeAdminRecovery('restricted-challenge', 'opaque-email-code', 'FreshPassword123!');
    expect(session.current).toBeNull();
    expect(post.mock.calls.map(([path]) => path)).toEqual(['/auth/admin/recovery/request', '/auth/admin/recovery/complete']);
    expect(post).toHaveBeenLastCalledWith('/auth/admin/recovery/complete', { temporaryToken: 'restricted-challenge', code: 'opaque-email-code', newPassword: 'FreshPassword123!' }, { authenticated: false });
  });

  it('verifies only the signed-in profile email without allowing the client to choose a recovery destination', async () => {
    post.mockResolvedValue(undefined);
    await session.requestEmailVerification();
    await session.confirmEmailVerification('opaque-verification-code');
    expect(post.mock.calls).toEqual([
      ['/auth/email/verification/request'],
      ['/auth/email/verification/confirm', { code: 'opaque-verification-code' }],
    ]);
  });
});

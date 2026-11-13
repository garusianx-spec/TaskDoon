import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '@taskin/contracts';
import { ApiProblem, http } from '@/lib/api-client';
import { session } from '@/features/auth/api/session';

const grant: AuthSession = {
  accessToken: 'test-access',
  tokenType: 'Bearer',
  expiresInSeconds: 900,
  sessionId: 'test-session',
  user: {
    id: 'user',
    phone: '',
    email: null,
    fullName: 'آزمون',
    avatarTone: 'brand',
    locale: 'fa-IR',
    timeZone: 'Asia/Tehran',
    hasPassword: false,
  },
};

beforeEach(() => vi.stubGlobal('document', { cookie: 'taskin_csrf=test-csrf' }));
afterEach(() => {
  session.end();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('session restoration', () => {
  it('restores a valid session using the CSRF cookie', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValueOnce(grant);
    expect(await session.restore()).toMatchObject({ sessionId: 'test-session' });
    expect(post).toHaveBeenCalledWith('/auth/refresh', undefined, {
      authenticated: false,
      headers: { 'x-csrf-token': 'test-csrf' },
    });
  });

  it('returns no session when the server rejects the credential', async () => {
    vi.spyOn(http, 'post').mockRejectedValueOnce(new ApiProblem(401, 'REFRESH_INVALID', '', null));
    expect(await session.restore()).toBeNull();
  });

  it.each([new ApiProblem(0, 'NETWORK', '', null), new ApiProblem(503, 'INTERNAL', '', null)])(
    'reports a temporary failure instead of signing out',
    async (error) => {
      vi.spyOn(http, 'post').mockRejectedValueOnce(error);
      await expect(session.restore()).rejects.toBe(error);
    },
  );

  it('does not restore after an offline sign-out, but permits a new explicit sign-in', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('navigator', { userAgent: 'test' });
    const post = vi.spyOn(http, 'post').mockRejectedValueOnce(new ApiProblem(0, 'NETWORK', '', null));
    await session.signOut();
    expect(await session.restore()).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
    post.mockResolvedValueOnce(grant);
    await session.passwordSignIn('test', 'test');
    session.end();
    post.mockResolvedValueOnce(grant);
    expect(await session.restore()).toMatchObject({ sessionId: 'test-session' });
  });

  it('ignores a late refresh response after explicit sign-out', async () => {
    let resolve!: (body: AuthSession) => void;
    const pending = new Promise<AuthSession>((done) => {
      resolve = done;
    });
    vi.spyOn(http, 'post').mockReturnValueOnce(pending).mockResolvedValueOnce(undefined);
    const restoring = session.restore();
    await session.signOut();
    resolve(grant);
    expect(await restoring).toBeNull();
    expect(session.current).toBeNull();
  });
});

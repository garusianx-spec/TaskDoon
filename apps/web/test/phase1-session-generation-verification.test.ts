import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '@taskin/contracts';
import { ApiProblem, http } from '@/lib/api-client';
import { session } from '@/features/auth/api/session';

const oldGrant: AuthSession = {
  accessToken: 'synthetic-old',
  tokenType: 'Bearer',
  expiresInSeconds: 900,
  sessionId: 'session-old',
  user: {
    id: 'synthetic-user',
    phone: '',
    email: null,
    fullName: 'آزمون',
    avatarTone: 'brand',
    locale: 'fa-IR',
    timeZone: 'Asia/Tehran',
    hasPassword: true,
  },
};
const newGrant: AuthSession = { ...oldGrant, accessToken: 'synthetic-new', sessionId: 'session-new' };

function deferred() {
  let resolve!: (value: AuthSession) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<AuthSession>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.stubGlobal('document', { cookie: 'taskin_csrf=synthetic' });
  vi.stubGlobal('navigator', { userAgent: 'test' });
  vi.stubGlobal('localStorage', { getItem: () => null, removeItem: vi.fn() });
});
afterEach(() => {
  session.end();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('published Phase 1 session-generation gate', () => {
  it('keeps a newly signed-in session after a late REFRESH_INVALID from the old session', async () => {
    const pending = deferred();
    vi.spyOn(http, 'post')
      .mockResolvedValueOnce(oldGrant)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(newGrant);
    await session.passwordSignIn('synthetic', 'synthetic');
    const restoring = session.restore();
    await session.passwordSignIn('synthetic', 'synthetic');
    expect(session.current?.sessionId).toBe('session-new');
    pending.reject(new ApiProblem(401, 'REFRESH_INVALID', 'synthetic refusal', null));
    await restoring;
    expect(session.current?.sessionId).toBe('session-new');
  });

  it('keeps a newly signed-in session when the old-session revocation handler finishes late', async () => {
    const pending = deferred();
    vi.spyOn(http, 'post')
      .mockResolvedValueOnce(oldGrant)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(newGrant);
    await session.passwordSignIn('synthetic', 'synthetic');
    const revoking = session.revoked();
    await session.passwordSignIn('synthetic', 'synthetic');
    expect(session.current?.sessionId).toBe('session-new');
    pending.resolve(oldGrant);
    await revoking;
    expect(session.current?.sessionId).toBe('session-new');
  });

  it('still ends the unchanged session when refresh is confirmed invalid', async () => {
    vi.spyOn(http, 'post')
      .mockResolvedValueOnce(oldGrant)
      .mockRejectedValueOnce(new ApiProblem(401, 'REFRESH_INVALID', '', null));
    await session.passwordSignIn('synthetic', 'synthetic');
    expect(await session.restore()).toBeNull();
    expect(session.current).toBeNull();
  });

  it('still ends the unchanged session when its revocation handler completes', async () => {
    vi.spyOn(http, 'post').mockResolvedValueOnce(oldGrant).mockResolvedValueOnce(oldGrant);
    await session.passwordSignIn('synthetic', 'synthetic');
    await session.revoked();
    expect(session.current).toBeNull();
  });

  it('shares an in-flight refresh between callers of the same generation', async () => {
    const pending = deferred();
    const post = vi.spyOn(http, 'post').mockResolvedValueOnce(oldGrant).mockReturnValueOnce(pending.promise);
    await session.passwordSignIn('synthetic', 'synthetic');
    const first = session.restore();
    const second = session.restore();
    expect(post.mock.calls.filter(([path]) => path === '/auth/refresh')).toHaveLength(1);
    pending.resolve(oldGrant);
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result?.sessionId)).toEqual(['session-old', 'session-old']);
  });

  it.each(['success', 'invalid', 'unavailable', 'suspended'] as const)(
    'keeps the new generation’s request in flight after an old %s response',
    async (outcome) => {
      const older = deferred();
      const newer = deferred();
      const post = vi
        .spyOn(http, 'post')
        .mockResolvedValueOnce(oldGrant)
        .mockReturnValueOnce(older.promise)
        .mockResolvedValueOnce(newGrant)
        .mockReturnValueOnce(newer.promise);
      await session.passwordSignIn('synthetic', 'synthetic');
      const oldRestoration = session.restore();
      await session.passwordSignIn('synthetic', 'synthetic');
      const newRestoration = session.restore();
      if (outcome === 'success') older.resolve(oldGrant);
      else
        older.reject(
          outcome === 'unavailable'
            ? new ApiProblem(0, 'NETWORK', '', null)
            : new ApiProblem(
                outcome === 'suspended' ? 403 : 401,
                outcome === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'REFRESH_INVALID',
                '',
                null,
              ),
        );
      expect(await oldRestoration).toBeNull();
      const sharedRestoration = session.restore();
      // The newer request must start independently and survive the older request's cleanup.
      expect(post.mock.calls.filter(([path]) => path === '/auth/refresh')).toHaveLength(2);
      expect(session.current?.sessionId).toBe('session-new');
      expect(session.endReason()).toBeNull();
      newer.resolve(newGrant);
      const results = await Promise.all([newRestoration, sharedRestoration]);
      expect(results.map((result) => result?.sessionId)).toEqual(['session-new', 'session-new']);
      // Completion of the current request must release its slot for a later refresh.
      post.mockResolvedValueOnce(newGrant);
      expect((await session.restore())?.sessionId).toBe('session-new');
      expect(post.mock.calls.filter(([path]) => path === '/auth/refresh')).toHaveLength(3);
    },
  );
});

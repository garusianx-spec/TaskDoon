import { afterEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/features/auth/api/session';
import { LiveStore } from '@/store/live/live-store';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('invitation link capture before sign-in', () => {
  it.each([
    ['/invite/path-token', '', 'path-token'],
    ['/invite', '?token=legacy-token', 'legacy-token'],
    ['/invite/path-token', '?token=ignored-query-token', 'path-token'],
  ])('captures %s across the existing sign-in gate', async (pathname, search, token) => {
    const saved = new Map<string, string>();
    vi.stubGlobal('window', {
      location: { pathname, search },
      sessionStorage: {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, value),
      },
    });
    vi.spyOn(session, 'restore').mockResolvedValue(null);
    const store = new LiveStore();
    await store.start();
    expect(store.current.phase).toBe('signed-out');
    expect(store.invited).toBe(true);
    expect([...saved.values()]).toEqual([token]);
  });
});

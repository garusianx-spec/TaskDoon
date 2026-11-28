import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { session } from '@/features/auth/api/session';
import { api } from '@/api/endpoints';
import { LiveGate } from '@/features/auth/components/LiveGate';
import { LiveStore } from '@/store/live/live-store';

vi.mock('next/navigation', () => ({
  usePathname: () => '/tasks',
  useRouter: () => ({}),
}));

afterEach(() => vi.restoreAllMocks());

describe('workspace session gate', () => {
  it.each([
    ['restoring', false, 'در حال بارگذاری فضای کاری'],
    ['loading', false, 'در حال بارگذاری فضای کاری'],
    ['ready', false, 'در حال بارگذاری فضای کاری'],
    ['restore-error', false, 'تلاش دوباره'],
  ] as const)('renders a workspace status surface in phase %s', (phase, ready, message) => {
    const store = new LiveStore();
    const html = renderToStaticMarkup(
      createElement(LiveGate, {
        status: { ...store.current, phase },
        store,
        ready,
        children: 'workspace content',
      }),
    );
    expect(html).toContain(message);
    expect(html).not.toContain('ناوبری ورود');
    expect(html).not.toContain('workspace content');
  });

  it('stays on the loading screen until restoration completes and then loads the workspace', async () => {
    let resolve!: (value: NonNullable<typeof session.current>) => void;
    const pending = new Promise<NonNullable<typeof session.current>>((done) => {
      resolve = done;
    });
    vi.spyOn(session, 'restore').mockReturnValue(pending);
    const store = new LiveStore();
    const load = vi.spyOn(store, 'load').mockResolvedValue();
    const started = store.start();
    expect(store.current.phase).toBe('restoring');
    resolve({
      sessionId: 'test',
      accessToken: 'test',
      expiresAt: 0,
      user: {} as NonNullable<typeof session.current>['user'],
    });
    await started;
    expect(load).toHaveBeenCalledOnce();
  });

  it('opens sign-in for an invalid session, but exposes retry after an outage', async () => {
    vi.spyOn(session, 'restore')
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(null);
    const invalid = new LiveStore();
    await invalid.start();
    expect(invalid.current.phase).toBe('signed-out');
    const offline = new LiveStore();
    await offline.start();
    expect(offline.current.phase).toBe('restore-error');
    await offline.retryRestore();
    expect(offline.current.phase).toBe('signed-out');
  });

  it('does not show sign-in when workspace loading fails after session restoration', async () => {
    vi.spyOn(session, 'restore').mockResolvedValue({
      sessionId: 'test',
      accessToken: 'test',
      expiresAt: 0,
      user: {} as NonNullable<typeof session.current>['user'],
    });
    vi.spyOn(api.me, 'get').mockRejectedValue(new Error('unavailable'));
    const store = new LiveStore();
    await store.start();
    expect(store.current.phase).toBe('restore-error');
  });
});

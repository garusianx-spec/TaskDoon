'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { LiveStatus, LiveStore } from '@/store/live/live-store';
import { Button, IconButton } from '@/components/ui';
import { Logo } from '@/components/brand/Logo';
import { CloseIcon, WarningIcon } from '@/components/icons';
import { SystemBroadcastBanner } from '@/components/layout/SystemBroadcastBanner';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { FirstWorkspace } from '@/features/auth/components/FirstWorkspace';
import { SignInScreen } from '@/features/auth/components/SignInScreen';

const TOAST_MS = 6_000;

export type GateViewKind = 'signed-out' | 'restore-error' | 'no-workspace' | 'loading' | 'ready';

/** Pure gate view resolver so loading/session-restoring never collapses into the signed-out login shell. */
export function resolveGateView(phase: LiveStatus['phase'], ready: boolean): GateViewKind {
  if (phase === 'signed-out') return 'signed-out';
  if (phase === 'restore-error') return 'restore-error';
  if (phase === 'no-workspace') return 'no-workspace';
  if (phase === 'restoring' || phase === 'loading' || !ready) return 'loading';
  return 'ready';
}

/**
 * What the live app shows before and around the workspace: the session being restored, the
 * sign-in screen, the first-workspace step, the neutral workspace loading state, and — once it
 * is ready — the workspace itself with its error toasts and connection notice.
 */
export function LiveGate({
  status,
  store,
  ready,
  children,
}: {
  readonly status: LiveStatus;
  readonly store: LiveStore;
  readonly ready: boolean;
  readonly children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { phase, toast } = status;
  const view = resolveGateView(phase, ready);

  // Signing in from the signed-out screen lands on the desk, not back on "you signed out".
  useEffect(() => {
    if (phase === 'ready' && pathname.startsWith('/signed-out')) router.replace('/feed');
  }, [phase, pathname, router]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => store.dismissToast(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, store]);

  let body: ReactNode;
  if (view === 'signed-out') body = <SignInScreen store={store} />;
  else if (view === 'restore-error')
    body = (
      <AuthCard
        labelledBy="restore-error-title"
        title="وضعیت ورود بررسی نشد."
        description="دوباره تلاش کنید."
      >
        <Button onClick={() => void store.retryRestore()}>تلاش دوباره</Button>
      </AuthCard>
    );
  else if (view === 'no-workspace')
    body = (
      <>
        <SystemBroadcastBanner />
        <FirstWorkspace store={store} user={status.user} />
      </>
    );
  else if (view === 'loading') body = <WorkspaceLoading />;
  else body = children;

  return (
    <>
      {body}
      {phase === 'ready' && ready && status.connection === 'offline' && (
        <p
          role="status"
          className="pointer-events-none fixed inset-x-0 top-2 z-[60] mx-auto w-fit rounded-full bg-warning-50 px-3 py-1 text-caption font-medium text-warning-700 shadow-sm"
        >
          اتصال بلادرنگ برقرار نیست؛ در حال اتصال دوباره…
        </p>
      )}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4 lg:bottom-6"
      >
        {toast && (
          <div
            role="alert"
            className="pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border border-secondary bg-surface px-4 py-3 text-body-sm text-fg-primary shadow-lg"
          >
            <WarningIcon size={18} className="mt-0.5 shrink-0 text-warning-600" />
            <span className="flex-1">{toast.text}</span>
            <IconButton
              label="بستن"
              size="xs"
              variant="ghost"
              icon={<CloseIcon size={16} />}
              onClick={() => store.dismissToast(toast.id)}
            />
          </div>
        )}
      </div>
    </>
  );
}

/** Neutral workspace loading state: preserves authenticated context tokens without flashing the login shell. */
export function WorkspaceLoading() {
  return (
    <main
      dir="rtl"
      aria-busy="true"
      aria-labelledby="workspace-loading-title"
      className="flex min-h-dvh items-center justify-center bg-canvas p-6"
    >
      <div
        role="status"
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-secondary bg-surface px-6 py-8 text-center shadow-sm"
      >
        <Logo className="h-7 w-auto" />
        <div
          role="progressbar"
          aria-label="بارگذاری فضای کاری"
          className="size-8 animate-spin rounded-full border-2 border-brand border-t-transparent"
        />
        <div className="flex flex-col gap-1">
          <h1 id="workspace-loading-title" className="text-heading-sm font-bold text-fg-primary">
            در حال آماده‌سازی فضای کاری…
          </h1>
          <p className="text-body-sm text-fg-tertiary">اطلاعات فضای کاری شما در حال بارگذاری است.</p>
        </div>
      </div>
    </main>
  );
}

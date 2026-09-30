'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { LiveStatus, LiveStore } from '@/store/live/live-store';
import { IconButton } from '@/components/ui';
import { CloseIcon, WarningIcon } from '@/components/icons';
import { AuthCard } from './AuthCard';
import { FirstWorkspace } from './FirstWorkspace';
import { SignInScreen } from './SignInScreen';

const TOAST_MS = 6_000;

/**
 * What the live app shows before and around the workspace: the session being restored, the
 * sign-in screen, the first-workspace step, the loading state, and — once it is ready — the
 * workspace itself with its error toasts and connection notice.
 */
export function LiveGate({ status, store, ready, children }: { readonly status: LiveStatus; readonly store: LiveStore; readonly ready: boolean; readonly children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { phase, toast } = status;

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
  if (phase === 'signed-out') body = <SignInScreen store={store} />;
  else if (phase === 'no-workspace') body = <FirstWorkspace store={store} user={status.user} />;
  else if (phase === 'restoring' || !ready) body = <Loading />;
  else body = children;

  return (
    <>
      {body}
      {phase === 'ready' && ready && status.connection === 'offline' && (
        <p role="status" className="pointer-events-none fixed inset-x-0 top-2 z-[60] mx-auto w-fit rounded-full bg-warning-50 px-3 py-1 text-caption font-medium text-warning-700 shadow-sm">
          اتصال بلادرنگ برقرار نیست؛ در حال اتصال دوباره…
        </p>
      )}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4 lg:bottom-6">
        {toast && (
          <div role="alert" className="pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border border-secondary bg-surface px-4 py-3 text-body-sm text-fg-primary shadow-lg">
            <WarningIcon size={18} className="mt-0.5 shrink-0 text-warning-600" />
            <span className="flex-1">{toast.text}</span>
            <IconButton label="بستن" size="xs" variant="ghost" icon={<CloseIcon size={16} />} onClick={() => store.dismissToast(toast.id)} />
          </div>
        )}
      </div>
    </>
  );
}

function Loading() {
  return (
    <AuthCard labelledBy="loading-title" title="در حال آماده‌سازی…" description="فضای کاری شما بارگذاری می‌شود.">
      <div role="progressbar" aria-label="بارگذاری" className="mx-auto size-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
    </AuthCard>
  );
}

'use client';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import type { MeUser } from '@taskin/contracts';
import { session } from '@/features/auth/api/session';
import { SignInScreen } from '@/features/auth/components/SignInScreen';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui';
const UserContext = createContext<MeUser | null>(null);
export function useSupportUser() {
  const user = useContext(UserContext);
  if (!user) throw new Error('Support session required');
  return user;
}
type Phase = 'restoring' | 'error' | 'checked';
const subscribe = (notify: () => void) => session.subscribe(notify);
const snapshot = () => session.current;
const serverSnapshot = () => null;
export function SupportSession({ children }: { children: ReactNode }) {
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [phase, setPhase] = useState<Phase>('restoring');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.resolve(session.current ?? session.restore()).then(
      () => {
        if (active) setPhase('checked');
      },
      () => {
        if (active) setPhase('error');
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  if (!current && phase === 'restoring')
    return (
      <AuthCard title="در حال بررسی ورود…" description="پشتیبانی آماده می‌شود." labelledBy="support-session">
        <p role="status">در حال بارگذاری…</p>
      </AuthCard>
    );
  if (!current && phase === 'error')
    return (
      <AuthCard
        title="وضعیت ورود بررسی نشد"
        description="اتصال را بررسی و دوباره تلاش کنید."
        labelledBy="support-session"
      >
        <Button
          onClick={() => {
            setPhase('restoring');
            setAttempt((v) => v + 1);
          }}
        >
          تلاش دوباره
        </Button>
      </AuthCard>
    );
  if (!current) return <SignInScreen store={{ invited: false, signedIn: async () => undefined }} />;
  return (
    <UserContext.Provider value={current.user}>
      <div className="min-h-dvh bg-canvas text-fg-primary">
        <header className="sticky top-0 z-sticky flex min-h-16 items-center justify-between gap-3 border-b border-secondary bg-surface/80 px-4 backdrop-blur-md">
          <Link className="inline-flex min-h-11 items-center font-bold" href="/support/tickets">
            پشتیبانی تسک‌دون
          </Link>
          <div className="flex items-center gap-2">
            <Link className="inline-flex min-h-11 items-center text-body-sm text-fg-brand" href="/feed">
              بازگشت به فضای کاری
            </Link>
            <ThemeToggle placement="bottom" />
          </div>
        </header>
        <main id="support-main" className="mx-auto w-full max-w-5xl p-4 sm:p-6">
          {children}
        </main>
      </div>
    </UserContext.Provider>
  );
}

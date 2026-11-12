'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { useAdmin } from '@/features/admin/hooks/AdminSession';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { SignInScreen } from '@/features/auth/components/SignInScreen';
import { Button } from '@/components/ui';
import { AdminShell } from '@/components/layout/AdminShell';
import { SmsConfirmPrompt, StepUpPrompt } from '@/features/admin/components/AdminVerificationPrompts';

/** What `/admin` shows in each phase of the admin session; the shell only once all checks pass. */
export function AdminGuard({ children }: { readonly children: ReactNode }) {
  const { phase, probe, signOut } = useAdmin();
  switch (phase.kind) {
    case 'demo':
      return (
        <AuthCard
          labelledBy="admin-title"
          title="پنل مدیریت پلتفرم"
          description="این بخش فقط در نسخه متصل به سرور در دسترس است؛ نسخه نمایشی داده‌ای برای مدیریت ندارد."
        />
      );
    case 'restoring':
      return (
        <AuthCard labelledBy="admin-title" title="پنل مدیریت پلتفرم" description="در حال بررسی نشست…">
          <div
            role="progressbar"
            aria-label="بارگذاری"
            className="mx-auto size-8 animate-spin rounded-full border-2 border-brand border-t-transparent"
          />
        </AuthCard>
      );
    case 'signed-out':
      return <SignInScreen adminPanel store={{ invited: false, signedIn: probe }} />;
    case 'not-admin':
      // Indistinguishable from an address that does not exist, as the API answers 404.
      return (
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
          <p className="text-display font-extrabold text-fg-brand numeric">۴۰۴</p>
          <h1 className="text-heading font-bold text-fg-primary">این صفحه پیدا نشد</h1>
          <p className="max-w-md text-body text-fg-tertiary">
            نشانی واردشده در فضای کاری شما وجود ندارد یا دسترسی آن برداشته شده است.
          </p>
          <Link
            href="/feed"
            className="rounded-lg bg-brand-solid px-4 py-2.5 text-body font-semibold text-fg-on-brand shadow-xs transition-colors hover:bg-brand-solid-hover"
          >
            بازگشت به میز کار
          </Link>
        </main>
      );
    case 'unavailable':
      return (
        <AuthCard
          labelledBy="admin-title"
          title="پنل مدیریت پلتفرم"
          description="پایگاه داده مدیریت پلتفرم روی این سرور راه‌اندازی نشده است (DATABASE_PLATFORM_ADMIN_URL)."
        >
          <Button variant="secondary" fullWidth onClick={() => void signOut()}>
            خروج
          </Button>
        </AuthCard>
      );
    case 'error':
      return (
        <AuthCard labelledBy="admin-title" title="پنل مدیریت پلتفرم" description={phase.message}>
          <Button fullWidth onClick={() => void probe()}>
            تلاش دوباره
          </Button>
        </AuthCard>
      );
    case 'sms-confirm':
      return <SmsConfirmPrompt name={phase.admin.fullName} />;
    case 'step-up':
      return <StepUpPrompt name={phase.admin.fullName} />;
    case 'ready':
      return <AdminShell>{children}</AdminShell>;
  }
}

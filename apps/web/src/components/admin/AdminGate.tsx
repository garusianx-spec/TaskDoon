'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { formatMobile, normaliseIranMobile, toLatinDigits } from '@taskin/text';
import { toPersianDigits } from '@taskin/jalali';
import { problemMessage } from '@/api/messages';
import { session } from '@/api/session';
import { useAdmin } from '@/admin/AdminSession';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button, Input } from '@/components/ui';
import { ArrowRightIcon, KeyIcon, LockIcon, MobileIcon } from '@/components/icons';
import { AdminShell } from './AdminShell';

/** What `/admin` shows in each phase of the admin session; the shell only once all checks pass. */
export function AdminGate({ children }: { readonly children: ReactNode }) {
  const { phase, probe, signOut } = useAdmin();
  switch (phase.kind) {
    case 'demo':
      return (
        <AuthCard labelledBy="admin-title" title="پنل مدیریت پلتفرم" description="این بخش فقط در نسخه متصل به سرور در دسترس است؛ نسخه نمایشی داده‌ای برای مدیریت ندارد." />
      );
    case 'restoring':
      return (
        <AuthCard labelledBy="admin-title" title="پنل مدیریت پلتفرم" description="در حال بررسی نشست…">
          <div role="progressbar" aria-label="بارگذاری" className="mx-auto size-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </AuthCard>
      );
    case 'signed-out':
      return <AdminSignIn onSignedIn={probe} />;
    case 'not-admin':
      // Indistinguishable from an address that does not exist, as the API answers 404.
      return (
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
          <p className="numeric text-display font-extrabold text-fg-brand">۴۰۴</p>
          <h1 className="text-heading font-bold text-fg-primary">این صفحه پیدا نشد</h1>
          <p className="max-w-md text-body text-fg-tertiary">نشانی واردشده در فضای کاری شما وجود ندارد یا دسترسی آن برداشته شده است.</p>
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
        <AuthCard labelledBy="admin-title" title="پنل مدیریت پلتفرم" description="پایگاه داده مدیریت پلتفرم روی این سرور راه‌اندازی نشده است (DATABASE_PLATFORM_ADMIN_URL).">
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

type SignInStep =
  | { readonly kind: 'phone' }
  | { readonly kind: 'password' }
  | { readonly kind: 'code'; readonly phone: string; readonly challengeId: string; readonly codeLength: number; readonly resendAt: number };

/**
 * Mobile number → SMS code, or mobile number → password (the panel then asks for an SMS code
 * once). No sign-up here: platform admins are existing accounts.
 */
function AdminSignIn({ onSignedIn }: { readonly onSignedIn: () => Promise<void> }) {
  const [step, setStep] = useState<SignInStep>({ kind: 'phone' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fieldRef.current?.focus();
  }, [step.kind]);

  const goTo = (next: SignInStep) => {
    setError(null);
    setPassword('');
    setStep(next);
  };

  useEffect(() => {
    if (step.kind !== 'code') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step.kind]);

  const attempt = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const requestCode = (mobile: string) =>
    attempt(async () => {
      const challenge = await session.requestCode(mobile);
      setCode('');
      setStep({ kind: 'code', phone: mobile, challengeId: challenge.challengeId, codeLength: challenge.codeLength, resendAt: Date.now() + challenge.resendInSeconds * 1000 });
    });

  const onPhone = (event: FormEvent) => {
    event.preventDefault();
    const mobile = normaliseIranMobile(phone);
    if (!mobile) {
      setError('شماره موبایل معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷.');
      return;
    }
    void requestCode(mobile);
  };

  const onCode = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== 'code') return;
    void attempt(async () => {
      const result = await session.verifyCode(step.challengeId, toLatinDigits(code).trim());
      if ('signupToken' in result) {
        setStep({ kind: 'phone' });
        setError('این شماره در تسک‌دون حساب ندارد.');
        return;
      }
      await onSignedIn();
    });
  };

  const onPassword = (event: FormEvent) => {
    event.preventDefault();
    const mobile = normaliseIranMobile(phone);
    if (!mobile) {
      setError('شماره موبایل معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷.');
      return;
    }
    if (!password) {
      setError('رمز عبور را وارد کنید.');
      return;
    }
    void attempt(async () => {
      await session.passwordSignIn(mobile, password);
      setPassword('');
      await onSignedIn();
    });
  };

  if (step.kind === 'password') {
    return (
      <AuthCard labelledBy="admin-title" title="ورود به پنل مدیریت پلتفرم" description="با رمز عبور وارد شوید؛ پس از آن یک بار کد پیامکی هم خواسته می‌شود.">
        <form className="flex flex-col gap-4" onSubmit={onPassword} noValidate>
          <Input
            ref={fieldRef}
            label="شماره موبایل"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            dir="ltr"
            placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            iconStart={<MobileIcon size={18} />}
          />
          <Input
            label="رمز عبور"
            name="password"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            iconStart={<LockIcon size={18} />}
            error={error ?? undefined}
          />
          <Button type="submit" fullWidth size="lg" loading={busy}>
            ورود
          </Button>
          <Button variant="link" type="button" iconStart={<ArrowRightIcon size={16} />} onClick={() => goTo({ kind: 'phone' })}>
            ورود با کد پیامکی
          </Button>
        </form>
      </AuthCard>
    );
  }

  if (step.kind === 'code') {
    const wait = Math.max(0, Math.ceil((step.resendAt - now) / 1000));
    return (
      <AuthCard labelledBy="admin-title" title="کد ورود را وارد کنید" description={`کد ${toPersianDigits(step.codeLength)} رقمی به ${formatMobile(step.phone)} پیامک شد.`}>
        <form className="flex flex-col gap-4" onSubmit={onCode} noValidate>
          <Input
            ref={fieldRef}
            label="کد ورود"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            className="text-center tracking-[0.5em]"
            maxLength={step.codeLength}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            iconStart={<KeyIcon size={18} />}
            error={error ?? undefined}
          />
          <Button type="submit" fullWidth size="lg" loading={busy} disabled={toLatinDigits(code).trim().length !== step.codeLength}>
            ورود
          </Button>
          <div className="flex items-center justify-between text-caption text-fg-tertiary">
            <Button variant="link" type="button" iconStart={<ArrowRightIcon size={16} />} onClick={() => setStep({ kind: 'phone' })}>
              تغییر شماره
            </Button>
            <Button variant="link" type="button" disabled={wait > 0 || busy} onClick={() => void requestCode(step.phone)}>
              {wait > 0 ? `ارسال دوباره تا ${toPersianDigits(wait)} ثانیه` : 'ارسال دوباره کد'}
            </Button>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard labelledBy="admin-title" title="ورود به پنل مدیریت پلتفرم" description="فقط مدیران پلتفرم تسک‌دون به این بخش دسترسی دارند.">
      <form className="flex flex-col gap-4" onSubmit={onPhone} noValidate>
        <Input
          ref={fieldRef}
          label="شماره موبایل"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          iconStart={<MobileIcon size={18} />}
          error={error ?? undefined}
        />
        <Button type="submit" fullWidth size="lg" loading={busy}>
          دریافت کد ورود
        </Button>
        <Button variant="link" type="button" iconStart={<LockIcon size={16} />} onClick={() => goTo({ kind: 'password' })}>
          ورود با رمز عبور
        </Button>
      </form>
    </AuthCard>
  );
}

/**
 * A session opened with a password shows the phone too before the panel opens: a code texted to
 * the admin's own number, once per session. The password step-up follows as usual.
 */
function SmsConfirmPrompt({ name }: { readonly name: string }) {
  const { steppedUp, signOut } = useAdmin();
  const [challenge, setChallenge] = useState<{ readonly challengeId: string; readonly codeLength: number; readonly resendAt: number } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (challenge) fieldRef.current?.focus();
  }, [challenge]);

  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const sent = await session.requestConfirmCode();
      setCode('');
      setChallenge({ challengeId: sent.challengeId, codeLength: sent.codeLength, resendAt: Date.now() + sent.resendInSeconds * 1000 });
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      await session.confirmCode(challenge.challengeId, toLatinDigits(code).trim());
      await steppedUp();
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const wait = challenge ? Math.max(0, Math.ceil((challenge.resendAt - now) / 1000)) : 0;
  return (
    <AuthCard
      labelledBy="admin-title"
      title="تأیید با کد پیامکی"
      description={`${name}، با رمز عبور وارد شده‌اید. برای باز شدن پنل مدیریت، کدی را که به شماره موبایل حساب پیامک می‌شود وارد کنید.`}
    >
      {challenge ? (
        <form className="flex flex-col gap-4" onSubmit={(event) => void onConfirm(event)} noValidate>
          <Input
            ref={fieldRef}
            label="کد تأیید"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            className="text-center tracking-[0.5em]"
            maxLength={challenge.codeLength}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            iconStart={<KeyIcon size={18} />}
            error={error ?? undefined}
          />
          <Button type="submit" fullWidth size="lg" loading={busy} disabled={toLatinDigits(code).trim().length !== challenge.codeLength}>
            تأیید
          </Button>
          <Button variant="link" type="button" disabled={wait > 0 || busy} onClick={() => void send()}>
            {wait > 0 ? `ارسال دوباره تا ${toPersianDigits(wait)} ثانیه` : 'ارسال دوباره کد'}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="text-caption text-status-blocked">
              {error}
            </p>
          )}
          <Button fullWidth size="lg" loading={busy} onClick={() => void send()}>
            ارسال کد تأیید
          </Button>
          <Button variant="link" type="button" onClick={() => void signOut()}>
            خروج از حساب
          </Button>
        </div>
      )}
    </AuthCard>
  );
}

/**
 * The password step-up every admin screen needs (valid 15 minutes). An admin without a password
 * sets one first, which the server allows only right after an SMS sign-in.
 */
function StepUpPrompt({ name }: { readonly name: string }) {
  const { steppedUp, signOut } = useAdmin();
  const needsPassword = session.current?.user.hasPassword === false;
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      if (needsPassword) await session.setPassword(password);
      await session.stepUp(password);
      setPassword('');
      await steppedUp();
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      labelledBy="admin-title"
      title={needsPassword ? 'رمز عبور مدیر را تعیین کنید' : 'تأیید رمز عبور'}
      description={
        needsPassword
          ? `${name}، برای کار با پنل مدیریت ابتدا رمز عبوری بگذارید؛ دست‌کم ۸ نویسه، با حروف و عدد یا نماد.`
          : `${name}، برای دیدن داده‌های کاربران رمز عبور خود را دوباره وارد کنید؛ تا ۱۵ دقیقه معتبر است.`
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)} noValidate>
        <Input
          ref={fieldRef}
          label="رمز عبور"
          name="password"
          type="password"
          dir="ltr"
          autoComplete={needsPassword ? 'new-password' : 'current-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          iconStart={<LockIcon size={18} />}
          error={error ?? undefined}
        />
        <Button type="submit" fullWidth size="lg" loading={busy} disabled={!password}>
          {needsPassword ? 'ذخیره و ادامه' : 'تأیید و ادامه'}
        </Button>
        <Button variant="link" type="button" onClick={() => void signOut()}>
          خروج از حساب
        </Button>
      </form>
    </AuthCard>
  );
}

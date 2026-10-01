'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { normaliseIranMobile, toLatinDigits, formatMobile } from '@taskin/text';
import { toPersianDigits } from '@taskin/jalali';
import { session } from '@/api/session';
import { codeMessage, problemMessage } from '@/api/messages';
import type { LiveStore } from '@/store/live/live-store';
import { Button, Input } from '@/components/ui';
import { ArrowRightIcon, KeyIcon, LockIcon, MobileIcon, UserIcon, WarningIcon } from '@/components/icons';
import { AuthCard } from './AuthCard';

type Step =
  | { readonly kind: 'phone' }
  | { readonly kind: 'code'; readonly phone: string; readonly challengeId: string; readonly codeLength: number; readonly resendAt: number }
  | { readonly kind: 'name'; readonly signupToken: string }
  | { readonly kind: 'password' }
  | { readonly kind: 'forgot' }
  | { readonly kind: 'reset'; readonly phone: string; readonly challengeId: string; readonly codeLength: number; readonly resendAt: number };

const MIN_PASSWORD = 8;

/**
 * Sign-in (RFC §5.2): the phone number is the account. Mobile number → SMS code → in, or, for a
 * new number, a name first. An account that has set a password may use phone and password
 * instead; a forgotten password is replaced with a code texted to the phone. Codes are typed in
 * any digit script.
 */
export function SignInScreen({ store }: { readonly store: LiveStore }) {
  const [step, setStep] = useState<Step>({ kind: 'phone' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Signed out because the account was suspended: said once, above the first step. */
  const [suspended] = useState(() => session.endReason() === 'suspended');
  const [now, setNow] = useState(() => Date.now());
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fieldRef.current?.focus();
  }, [step.kind]);

  useEffect(() => {
    if (step.kind !== 'code' && step.kind !== 'reset') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step.kind]);

  /** Another way in (or back): the typed number stays, the rest starts over. */
  const goTo = (next: Step) => {
    setError(null);
    setCode('');
    setPassword('');
    setRepeat('');
    setStep(next);
  };

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
      if ('signupToken' in result) setStep({ kind: 'name', signupToken: result.signupToken });
      else await store.signedIn();
    });
  };

  const onName = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== 'name') return;
    const fullName = name.trim();
    if (fullName.length < 2) {
      setError('نام و نام خانوادگی را کامل بنویسید.');
      return;
    }
    void attempt(async () => {
      await session.signUp(step.signupToken, fullName);
      await store.signedIn();
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
      await store.signedIn();
    });
  };

  const requestReset = (mobile: string) =>
    attempt(async () => {
      const challenge = await session.requestPasswordReset(mobile);
      setCode('');
      setStep({ kind: 'reset', phone: mobile, challengeId: challenge.challengeId, codeLength: challenge.codeLength, resendAt: Date.now() + challenge.resendInSeconds * 1000 });
    });

  const onForgot = (event: FormEvent) => {
    event.preventDefault();
    const mobile = normaliseIranMobile(phone);
    if (!mobile) {
      setError('شماره موبایل معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷.');
      return;
    }
    void requestReset(mobile);
  };

  const onReset = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== 'reset') return;
    if (toLatinDigits(code).trim().length !== step.codeLength) {
      setError(`کد ${toPersianDigits(step.codeLength)} رقمی پیامک‌شده را وارد کنید.`);
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`رمز عبور تازه دست‌کم ${toPersianDigits(MIN_PASSWORD)} نویسه باشد، با حروف و عدد یا نماد.`);
      return;
    }
    if (password !== repeat) {
      setError('تکرار رمز عبور با خود آن یکی نیست.');
      return;
    }
    void attempt(async () => {
      await session.resetPassword(step.challengeId, toLatinDigits(code).trim(), password);
      // Every session ended with the old password; the new one signs this device in.
      await session.passwordSignIn(step.phone, password);
      await store.signedIn();
    });
  };

  const suspendedNotice = suspended && (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-status-blocked-line bg-status-blocked-subtle px-3 py-2 text-body-sm text-status-blocked">
      <WarningIcon size={18} className="mt-0.5 shrink-0" />
      <span>{codeMessage('ACCOUNT_SUSPENDED')}</span>
    </p>
  );

  if (step.kind === 'password') {
    return (
      <AuthCard labelledBy="sign-in-title" title="ورود با رمز عبور" description="با شماره موبایل و رمز عبوری که در «امنیت و ورود» گذاشته‌اید وارد شوید.">
        <form className="flex flex-col gap-4" onSubmit={onPassword} noValidate>
          {suspendedNotice}
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
          <div className="flex items-center justify-between text-caption text-fg-tertiary">
            <Button variant="link" type="button" iconStart={<ArrowRightIcon size={16} />} onClick={() => goTo({ kind: 'phone' })}>
              ورود با کد پیامکی
            </Button>
            <Button variant="link" type="button" onClick={() => goTo({ kind: 'forgot' })}>
              فراموشی رمز عبور
            </Button>
          </div>
        </form>
      </AuthCard>
    );
  }

  if (step.kind === 'forgot') {
    return (
      <AuthCard labelledBy="sign-in-title" title="فراموشی رمز عبور" description="کد بازنشانی به شماره موبایل حساب پیامک می‌شود؛ با آن رمز تازه‌ای بگذارید.">
        <form className="flex flex-col gap-4" onSubmit={onForgot} noValidate>
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
            ارسال کد بازنشانی
          </Button>
          <Button variant="link" type="button" iconStart={<ArrowRightIcon size={16} />} onClick={() => goTo({ kind: 'password' })}>
            بازگشت به ورود با رمز
          </Button>
        </form>
      </AuthCard>
    );
  }

  if (step.kind === 'reset') {
    const wait = Math.max(0, Math.ceil((step.resendAt - now) / 1000));
    return (
      <AuthCard labelledBy="sign-in-title" title="گذاشتن رمز عبور تازه" description={`کد ${toPersianDigits(step.codeLength)} رقمی بازنشانی به ${formatMobile(step.phone)} پیامک شد.`}>
        <form className="flex flex-col gap-4" onSubmit={onReset} noValidate>
          <Input
            ref={fieldRef}
            label="کد بازنشانی"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            className="text-center tracking-[0.5em]"
            maxLength={step.codeLength}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            iconStart={<KeyIcon size={18} />}
          />
          <Input
            label="رمز عبور تازه"
            name="new-password"
            type="password"
            autoComplete="new-password"
            dir="ltr"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            iconStart={<LockIcon size={18} />}
            hint={`دست‌کم ${toPersianDigits(MIN_PASSWORD)} نویسه، با حروف و عدد یا نماد.`}
          />
          <Input
            label="تکرار رمز عبور تازه"
            name="repeat-password"
            type="password"
            autoComplete="new-password"
            dir="ltr"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            iconStart={<LockIcon size={18} />}
            error={error ?? undefined}
          />
          <Button type="submit" fullWidth size="lg" loading={busy}>
            ذخیره رمز و ورود
          </Button>
          <div className="flex items-center justify-between text-caption text-fg-tertiary">
            <Button variant="link" type="button" iconStart={<ArrowRightIcon size={16} />} onClick={() => goTo({ kind: 'forgot' })}>
              تغییر شماره
            </Button>
            <Button variant="link" type="button" disabled={wait > 0 || busy} onClick={() => void requestReset(step.phone)}>
              {wait > 0 ? `ارسال دوباره تا ${toPersianDigits(wait)} ثانیه` : 'ارسال دوباره کد'}
            </Button>
          </div>
        </form>
      </AuthCard>
    );
  }

  if (step.kind === 'code') {
    const wait = Math.max(0, Math.ceil((step.resendAt - now) / 1000));
    return (
      <AuthCard labelledBy="sign-in-title" title="کد ورود را وارد کنید" description={`کد ${toPersianDigits(step.codeLength)} رقمی به ${formatMobile(step.phone)} پیامک شد.`}>
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

  if (step.kind === 'name') {
    return (
      <AuthCard labelledBy="sign-in-title" title="به تسک‌دون خوش آمدید" description="برای ساخت حساب، نام خود را همان‌طور که همکاران می‌شناسند بنویسید.">
        <form className="flex flex-col gap-4" onSubmit={onName} noValidate>
          <Input
            ref={fieldRef}
            label="نام و نام خانوادگی"
            name="fullName"
            autoComplete="name"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            iconStart={<UserIcon size={18} />}
            error={error ?? undefined}
          />
          <Button type="submit" fullWidth size="lg" loading={busy}>
            ساخت حساب و ورود
          </Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      labelledBy="sign-in-title"
      title={store.invited ? 'پیوستن به فضای کاری' : 'ورود به تسک‌دون'}
      description={
        store.invited
          ? 'به یک فضای کاری دعوت شده‌اید. با شماره موبایلی که دعوت‌نامه به آن رسیده وارد شوید.'
          : 'با شماره موبایل خود وارد شوید؛ کد ورود پیامک می‌شود.'
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onPhone} noValidate>
        {suspendedNotice}
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

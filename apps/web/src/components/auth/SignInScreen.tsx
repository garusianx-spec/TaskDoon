'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { normaliseIranMobile, toLatinDigits } from '@taskin/text';
import { toPersianDigits } from '@taskin/jalali';
import { session } from '@/api/session';
import { ApiProblem } from '@/api/http';
import { codeMessage, problemMessage } from '@/api/messages';
import type { LiveStore } from '@/store/live/live-store';
import { Button } from '@/components/ui';
import { AuthFormError as FormError, AuthInput as Input, OtpInput, PasswordInput } from './AuthFields';
import { challengeTiming, maskedMobile } from '@/lib/auth-input';
import { ArrowRightIcon, KeyIcon, LockIcon, MobileIcon, UserIcon, WarningIcon } from '@/components/icons';
import { AuthCard } from './AuthCard';
import { AuthPolicies } from './AuthPolicies';

type SmsStep = {
  readonly kind: 'code' | 'reset';
  readonly phone: string;
  readonly challengeId: string;
  readonly codeLength: number;
  readonly resendAt: number;
  readonly expiresAt: number;
  readonly exhausted?: boolean;
};

type Step =
  | { readonly kind: 'phone' }
  | SmsStep
  | { readonly kind: 'name'; readonly signupToken: string }
  | { readonly kind: 'admin-setup'; readonly temporaryToken: string; readonly expiresAt: number; readonly sent: boolean }
  | { readonly kind: 'admin-password'; readonly temporaryToken: string; readonly expiresAt: number }
  | { readonly kind: 'admin-recovery'; readonly temporaryToken: string; readonly expiresAt: number }
  | { readonly kind: 'password' }
  | { readonly kind: 'forgot' };

type ErrorTarget = 'form' | 'phone' | 'code' | 'name' | 'password' | 'repeat' | 'resend';

function ChallengeEnded({ exhausted, waiting }: { readonly exhausted?: boolean; readonly waiting: boolean }) {
  return <p role="status" className="auth-inline-note">
    {exhausted ? 'تعداد تلاش‌ها بیش از حد مجاز شد.' : 'کد منقضی شده است.'}{' '}
    {waiting ? 'پس از پایان شمارش، کد تازه‌ای بگیرید.' : 'برای ادامه کد تازه‌ای بگیرید.'}
  </p>;
}

const MIN_PASSWORD = 8;

/**
 * Sign-in (RFC §5.2): the phone number is the account. Mobile number → SMS code → in, or, for a
 * new number, a name first. An account that has set a password may use phone and password
 * instead; a forgotten password is replaced with a code texted to the phone. Codes are typed in
 * any digit script.
 */
export function SignInScreen({ store, adminPanel = false }: { readonly store: Pick<LiveStore, 'signedIn' | 'invited'>; readonly adminPanel?: boolean }) {
  const [step, setStep] = useState<Step>({ kind: 'phone' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [feedback, setFeedback] = useState<{ readonly target: ErrorTarget; readonly message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Signed out because the account was suspended: said once, above the first step. */
  const [suspended] = useState(() => session.endReason() === 'suspended');
  const [now, setNow] = useState(() => Date.now());
  const fieldRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);

  const setError = (message: string | null, target: ErrorTarget = 'form') => {
    setFeedback(message ? { message, target } : null);
  };
  const errorFor = (target: ErrorTarget) => feedback?.target === target ? feedback.message : undefined;
  const formError = errorFor('form');

  const activeChallenge = 'challengeId' in step ? step.challengeId : null;
  useEffect(() => {
    fieldRef.current?.focus();
  }, [step.kind, activeChallenge]);

  useEffect(() => {
    if (step.kind !== 'code' && step.kind !== 'reset' && step.kind !== 'admin-password' && step.kind !== 'admin-recovery' && step.kind !== 'admin-setup') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step.kind]);

  useEffect(() => {
    if ((step.kind === 'admin-password' || step.kind === 'admin-recovery' || step.kind === 'admin-setup') && now >= step.expiresAt) {
      setStep({ kind: 'phone' });
      setPassword('');
      setRepeat('');
      setCode('');
      setFeedback({ target: 'form', message: 'مهلت تأیید ورود تمام شد؛ کد پیامکی تازه‌ای بگیرید.' });
    }
  }, [now, step]);

  /** Another way in (or back): the typed number stays, the rest starts over. */
  const goTo = (next: Step) => {
    setError(null);
    setNotice(null);
    setCode('');
    setPassword('');
    setRepeat('');
    setStep(next);
  };

  const attempt = async (work: () => Promise<void>, deliveryError: 'form' | 'resend' = 'form') => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      const failureCode = failure instanceof ApiProblem ? failure.code : null;
      const verifyingSms = deliveryError !== 'resend' && (step.kind === 'code' || step.kind === 'reset');
      if (verifyingSms && (failureCode === 'OTP_EXPIRED' || failureCode === 'OTP_ATTEMPTS_EXCEEDED')) {
        const expiredAt = Date.now();
        setNow(expiredAt);
        setStep(previous => previous.kind === 'code' || previous.kind === 'reset'
          ? { ...previous, expiresAt: expiredAt, exhausted: failureCode === 'OTP_ATTEMPTS_EXCEEDED' }
          : previous);
      } else {
        setError(problemMessage(failure), verifyingSms && failureCode === 'OTP_INVALID' ? 'code' : deliveryError);
      }
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  };

  const requestCode = (mobile: string) =>
    attempt(async () => {
      const challenge = await session.requestCode(mobile);
      setCode('');
      setNow(Date.now());
      setStep({ kind: 'code', phone: mobile, challengeId: challenge.challengeId, ...challengeTiming(challenge, Date.now()) });
    }, step.kind === 'code' ? 'resend' : 'form');

  const onPhone = (event: FormEvent) => {
    event.preventDefault();
    const mobile = normaliseIranMobile(phone);
    if (!mobile) {
      setError('شماره موبایل معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷.', 'phone');
      return;
    }
    void requestCode(mobile);
  };

  const onCode = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== 'code' || busy) return;
    if (Date.now() >= step.expiresAt) { setNow(Date.now()); return; }
    if (toLatinDigits(code).trim().length !== step.codeLength) { setError(`کد ${toPersianDigits(step.codeLength)} رقمی را کامل وارد کنید.`, 'code'); return; }
    void attempt(async () => {
      const result = await session.verifyCode(step.challengeId, toLatinDigits(code).trim());
      if ('signupToken' in result) {
        if (adminPanel) {
          goTo({ kind: 'phone' });
          setError('این شماره در تسک‌دون حساب ندارد.');
        } else setStep({ kind: 'name', signupToken: result.signupToken });
      } else if ('temporaryToken' in result) {
        setCode('');
        setPassword('');
        setNow(Date.now());
        setStep(result.status === 'admin_setup_required'
          ? { kind: 'admin-setup', temporaryToken: result.temporaryToken, expiresAt: Date.now() + result.expiresInSeconds * 1000, sent: false }
          : { kind: 'admin-password', temporaryToken: result.temporaryToken, expiresAt: Date.now() + result.expiresInSeconds * 1000 });
      } else await store.signedIn();
    });
  };

  const onAdminPassword = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== 'admin-password' || busy || !password) return;
    void attempt(async () => {
      await session.completeAdminPassword(step.temporaryToken, password);
      goTo({ kind: 'phone' });
      await store.signedIn();
    });
  };

  const onAdminRecovery = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== 'admin-recovery' || busy) return;
    if (!code.trim()) {
      setError('کد بازیابی ایمیل‌شده را وارد کنید.', 'code');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError('رمز تازه دست‌کم ۸ نویسه، با حروف و عدد یا نماد باشد.', 'password');
      return;
    }
    if (password !== repeat) {
      setError('تکرار رمز عبور با خود آن یکی نیست.', 'repeat');
      return;
    }
    void attempt(async () => {
      await session.completeAdminRecovery(step.temporaryToken, code.trim(), password);
      goTo({ kind: 'phone' });
      setNotice('رمز تازه ذخیره شد. برای ورود، کد پیامکی تازه‌ای بگیرید.');
    });
  };

  const onName = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== 'name') return;
    const fullName = name.trim();
    if (fullName.length < 2 || fullName.length > 80) {
      setError('نام و نام خانوادگی را کامل بنویسید.', 'name');
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
      setError('شماره موبایل معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷.', 'phone');
      return;
    }
    if (!password) {
      setError('رمز عبور را وارد کنید.', 'password');
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
      setNow(Date.now());
      setStep({ kind: 'reset', phone: mobile, challengeId: challenge.challengeId, ...challengeTiming(challenge, Date.now()) });
    }, step.kind === 'reset' ? 'resend' : 'form');

  const onForgot = (event: FormEvent) => {
    event.preventDefault();
    const mobile = normaliseIranMobile(phone);
    if (!mobile) {
      setError('شماره موبایل معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷.', 'phone');
      return;
    }
    void requestReset(mobile);
  };

  const onReset = (event: FormEvent) => {
    event.preventDefault();
    if (step.kind !== 'reset' || busy) return;
    if (Date.now() >= step.expiresAt) { setNow(Date.now()); return; }
    if (toLatinDigits(code).trim().length !== step.codeLength) {
      setError(`کد ${toPersianDigits(step.codeLength)} رقمی پیامک‌شده را وارد کنید.`, 'code');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`رمز عبور تازه دست‌کم ${toPersianDigits(MIN_PASSWORD)} نویسه باشد، با حروف و عدد یا نماد.`, 'password');
      return;
    }
    if (password !== repeat) {
      setError('تکرار رمز عبور با خود آن یکی نیست.', 'repeat');
      return;
    }
    void attempt(async () => {
      await session.resetPassword(step.challengeId, toLatinDigits(code).trim(), password);
      // The recovery code is now consumed. A network failure during sign-in must not replay it.
      setPhone(step.phone);
      setCode('');
      setRepeat('');
      setStep({ kind: 'password' });
      setNotice('رمز عبور تازه ذخیره شد.');
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

  if (step.kind === 'admin-setup') {
    return (
      <AuthCard labelledBy="sign-in-title" title="راه‌اندازی دسترسی مدیریت" description="شماره موبایل تأیید شد. ایمیل بازیابی تعیین‌شده را تأیید کنید و رمز مدیر را بسازید.">
        <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={event => {
          event.preventDefault();
          if (busy) return;
          if (!step.sent) { void attempt(async () => { await session.requestAdminSetup(step.temporaryToken); setStep({ ...step, sent: true }); }); return; }
          if (password !== repeat) { setError('تکرار رمز عبور با خود آن یکی نیست.', 'repeat'); return; }
          void attempt(async () => { await session.completeAdminSetup(step.temporaryToken, code.trim(), password); goTo({ kind: 'phone' }); setNotice('دسترسی مدیریت فعال شد. با کد پیامکی تازه و رمز مدیر وارد شوید.'); });
        }}><fieldset disabled={busy} className="auth-fields">
          {step.sent ? <>
            <Input ref={fieldRef} label="کد راه‌اندازی ایمیل" dir="ltr" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} />
            <PasswordInput label="رمز مدیر جدید" dir="ltr" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} hint="دست‌کم ۸ نویسه، با حروف و عدد یا نماد." />
            <PasswordInput label="تکرار رمز مدیر" dir="ltr" autoComplete="new-password" value={repeat} onChange={event => { setRepeat(event.target.value); setError(null); }} error={errorFor('repeat')} />
          </> : <p className="text-body-sm text-fg-secondary">کد راه‌اندازی فقط به ایمیل بازیابی ثبت‌شده ارسال می‌شود. در صورت نداشتن دسترسی، با مدیر ارشد تماس بگیرید.</p>}
          <FormError message={formError} />
          <Button type="submit" fullWidth loading={busy} disabled={step.sent && (!code.trim() || password.length < MIN_PASSWORD)}>{step.sent ? 'فعال‌سازی دسترسی مدیریت' : 'ارسال کد راه‌اندازی ایمیل'}</Button>
          <Button type="button" variant="link" disabled={busy} onClick={() => goTo({ kind: 'phone' })}>شروع دوباره ورود</Button>
        </fieldset></form>
      </AuthCard>
    );
  }

  if (step.kind === 'admin-password' || step.kind === 'admin-recovery') {
    const recovering = step.kind === 'admin-recovery';
    return (
      <AuthCard labelledBy="sign-in-title" title={recovering ? 'بازیابی رمز مدیر' : 'تأیید رمز مدیر'} description={recovering ? 'اگر ایمیل تأییدشده‌ای برای حساب ثبت باشد، کد بازیابی به آن ارسال می‌شود. کد را از ایمیل کپی کنید.' : 'شماره موبایل تأیید شد. برای تکمیل ورود، رمز مدیر را وارد کنید.'}>
        <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={recovering ? onAdminRecovery : onAdminPassword} noValidate><fieldset disabled={busy} className="auth-fields">
          {recovering && (
            <Input ref={fieldRef} label="کد بازیابی ایمیل" name="recovery-code" autoComplete="one-time-code" dir="ltr" value={code} onChange={(event) => { setCode(event.target.value); setError(null); }} iconStart={<KeyIcon size={18} />} error={errorFor('code')} />
          )}
          <PasswordInput ref={recovering ? undefined : fieldRef} label={recovering ? 'رمز عبور تازه' : 'رمز مدیر'} name={recovering ? 'new-password' : 'admin-password'} autoComplete={recovering ? 'new-password' : 'current-password'} dir="ltr" value={password} onChange={(event) => { setPassword(event.target.value); setError(null); }} iconStart={<LockIcon size={18} />} error={errorFor('password')} />
          {recovering && (
            <PasswordInput label="تکرار رمز عبور تازه" name="repeat-password" autoComplete="new-password" dir="ltr" value={repeat} onChange={(event) => { setRepeat(event.target.value); setError(null); }} error={errorFor('repeat')} />
          )}
          <FormError message={formError} />
          <Button type="submit" fullWidth size="lg" loading={busy} disabled={!password || (recovering && !code.trim())}>{recovering ? 'ذخیره رمز تازه' : 'تکمیل ورود'}</Button>
          {!recovering && (
            <Button variant="link" type="button" disabled={busy} onClick={() => void attempt(async () => {
              await session.requestAdminRecovery(step.temporaryToken);
              goTo({ ...step, kind: 'admin-recovery' });
            })}>بازیابی با ایمیل تأییدشده</Button>
          )}
          {recovering && (
            <Button variant="link" type="button" disabled={busy} onClick={() => goTo({ ...step, kind: 'admin-password' })}>بازگشت به رمز مدیر</Button>
          )}
          <Button variant="link" type="button" disabled={busy} iconStart={<ArrowRightIcon size={16} />} onClick={() => goTo({ kind: 'phone' })}>شروع دوباره ورود</Button>
        </fieldset></form>
      </AuthCard>
    );
  }

  if (step.kind === 'password') {
    return (
      <AuthCard labelledBy="sign-in-title" title="ورود با رمز عبور" description="با شماره موبایل و رمز عبوری که در «امنیت و ورود» گذاشته‌اید وارد شوید.">
        <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={onPassword} noValidate><fieldset disabled={busy} className="auth-fields">
          {suspendedNotice}
          {notice && <p role="status" className="auth-inline-note">{notice}</p>}
          <Input
            ref={fieldRef}
            label="شماره موبایل"
            name="phone"
            type="tel"
            maxLength={24}
            hint="با صفر آغاز کنید یا شماره را با کد ۹۸+ وارد کنید."
            iconEnd={<bdi className="text-caption text-fg-secondary" dir="ltr">+98</bdi>}
            inputMode="tel"
            autoComplete="username"
            dir="ltr"
            placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷"
            value={phone}
            onChange={(event) => { setPhone(event.target.value); setError(null); }}
            iconStart={<MobileIcon size={18} />}
            error={errorFor('phone')}
          />
          <PasswordInput
            label="رمز عبور"
            name="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(event) => { setPassword(event.target.value); setError(null); }}
            iconStart={<LockIcon size={18} />}
            error={errorFor('password')}
          />
          <FormError message={formError} />
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
        </fieldset></form>
      </AuthCard>
    );
  }

  if (step.kind === 'forgot') {
    return (
      <AuthCard labelledBy="sign-in-title" title="فراموشی رمز عبور" description="کد بازنشانی به شماره موبایل حساب پیامک می‌شود؛ با آن رمز تازه‌ای بگذارید.">
        <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={onForgot} noValidate><fieldset disabled={busy} className="auth-fields">
          <Input
            ref={fieldRef}
            label="شماره موبایل"
            name="phone"
            type="tel"
            maxLength={24}
            hint="با صفر آغاز کنید یا شماره را با کد ۹۸+ وارد کنید."
            iconEnd={<bdi className="text-caption text-fg-secondary" dir="ltr">+98</bdi>}
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷"
            value={phone}
            onChange={(event) => { setPhone(event.target.value); setError(null); }}
            iconStart={<MobileIcon size={18} />}
            error={errorFor('phone')}
          />
          <FormError message={formError} />
          <Button type="submit" fullWidth size="lg" loading={busy}>
            ارسال کد بازنشانی
          </Button>
          <Button variant="link" type="button" iconStart={<ArrowRightIcon size={16} />} onClick={() => goTo({ kind: 'password' })}>
            بازگشت به ورود با رمز
          </Button>
        </fieldset></form>
      </AuthCard>
    );
  }

  if (step.kind === 'reset') {
    const wait = Math.max(0, Math.ceil((step.resendAt - now) / 1000));
    const expired = now >= step.expiresAt;
    return (
      <AuthCard labelledBy="sign-in-title" title="گذاشتن رمز عبور تازه" description={<>کد {toPersianDigits(step.codeLength)} رقمی بازنشانی به <bdi dir="ltr">{toPersianDigits(maskedMobile(step.phone))}</bdi> پیامک شد.</>}>
        <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={onReset} noValidate><fieldset disabled={busy} className="auth-fields">
          {expired && <ChallengeEnded exhausted={step.exhausted} waiting={wait > 0} />}
          <OtpInput
            ref={fieldRef}
            label="کد بازنشانی"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            className="text-center tracking-[0.5em]"
            length={step.codeLength}
            value={code}
            readOnly={expired}
            onValueChange={value => { setCode(value); setError(null); }}
            iconStart={<KeyIcon size={18} />}
            error={expired ? undefined : errorFor('code')}
          />
          <PasswordInput
            label="رمز عبور تازه"
            name="new-password"
            autoComplete="new-password"
            dir="ltr"
            value={password}
            onChange={(event) => { setPassword(event.target.value); setError(null); }}
            iconStart={<LockIcon size={18} />}
            hint={`دست‌کم ${toPersianDigits(MIN_PASSWORD)} نویسه، با حروف و عدد یا نماد.`}
            error={expired ? undefined : errorFor('password')}
          />
          <PasswordInput
            label="تکرار رمز عبور تازه"
            name="repeat-password"
            autoComplete="new-password"
            dir="ltr"
            value={repeat}
            onChange={(event) => { setRepeat(event.target.value); setError(null); }}
            iconStart={<LockIcon size={18} />}
            error={expired ? undefined : errorFor('repeat')}
          />
          <FormError message={errorFor('resend') ?? (expired ? undefined : formError)} />
          <Button type="submit" fullWidth size="lg" loading={busy} disabled={expired}>
            ذخیره رمز و ورود
          </Button>
          <div className="flex items-center justify-between text-caption text-fg-tertiary">
            <Button variant="link" type="button" iconStart={<ArrowRightIcon size={16} />} onClick={() => goTo({ kind: 'forgot' })}>
              تغییر شماره
            </Button>
            <Button variant={expired && wait === 0 ? 'secondary' : 'link'} type="button" disabled={wait > 0 || busy} onClick={() => void requestReset(step.phone)}>
              {wait > 0 ? `ارسال دوباره تا ${toPersianDigits(wait)} ثانیه` : 'ارسال دوباره کد'}
            </Button>
          </div>
        </fieldset></form>
      </AuthCard>
    );
  }

  if (step.kind === 'code') {
    const wait = Math.max(0, Math.ceil((step.resendAt - now) / 1000));
    const expired = now >= step.expiresAt;
    return (
      <AuthCard labelledBy="sign-in-title" title="کد ورود را وارد کنید" description={<>کد {toPersianDigits(step.codeLength)} رقمی به <bdi dir="ltr">{toPersianDigits(maskedMobile(step.phone))}</bdi> پیامک شد.</>}>
        <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={onCode} noValidate><fieldset disabled={busy} className="auth-fields">
          {expired && <ChallengeEnded exhausted={step.exhausted} waiting={wait > 0} />}
          <OtpInput
            ref={fieldRef}
            label="کد ورود"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            className="text-center tracking-[0.5em]"
            length={step.codeLength}
            value={code}
            readOnly={expired}
            onValueChange={value => { setCode(value); setError(null); }}
            iconStart={<KeyIcon size={18} />}
            error={expired ? undefined : errorFor('code')}
          />
          <FormError message={errorFor('resend') ?? (expired ? undefined : formError)} />
          <Button type="submit" fullWidth size="lg" loading={busy} disabled={busy || expired || toLatinDigits(code).trim().length !== step.codeLength}>
            ورود
          </Button>
          <div className="flex items-center justify-between text-caption text-fg-tertiary">
            <Button variant="link" type="button" disabled={busy} iconStart={<ArrowRightIcon size={16} />} onClick={() => goTo({ kind: 'phone' })}>
              تغییر شماره
            </Button>
            <Button variant={expired && wait === 0 ? 'secondary' : 'link'} type="button" disabled={wait > 0 || busy} onClick={() => void requestCode(step.phone)}>
              {wait > 0 ? `ارسال دوباره تا ${toPersianDigits(wait)} ثانیه` : 'ارسال دوباره کد'}
            </Button>
          </div>
        </fieldset></form>
      </AuthCard>
    );
  }

  if (step.kind === 'name') {
    return (
      <AuthCard labelledBy="sign-in-title" title="به تسک‌دون خوش آمدید" description="برای ساخت حساب، نام خود را همان‌طور که همکاران می‌شناسند بنویسید.">
        <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={onName} noValidate><fieldset disabled={busy} className="auth-fields">
          <Input
            ref={fieldRef}
            label="نام و نام خانوادگی"
            name="fullName"
            autoComplete="name"
            maxLength={80}
            value={name}
            onChange={(event) => { setName(event.target.value); setError(null); }}
            iconStart={<UserIcon size={18} />}
            error={errorFor('name')}
          />
          <FormError message={formError} />
          <Button type="submit" fullWidth size="lg" loading={busy}>
            ساخت حساب و ورود
          </Button>
          <Button type="button" variant="link" onClick={() => goTo({ kind: 'phone' })}>شروع دوباره با شماره موبایل</Button>
        </fieldset></form>
        <AuthPolicies />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      labelledBy="sign-in-title"
      title={adminPanel ? 'ورود به پنل مدیریت پلتفرم' : store.invited ? 'پیوستن به فضای کاری' : 'ورود به تسک‌دون'}
      description={
        store.invited
          ? 'به یک فضای کاری دعوت شده‌اید. با شماره موبایلی که دعوت‌نامه به آن رسیده وارد شوید.'
          : 'با شماره موبایل خود وارد شوید؛ کد ورود پیامک می‌شود.'
      }
    >
      <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={onPhone} noValidate><fieldset disabled={busy} className="auth-fields">
        {suspendedNotice}
        {notice && <p role="status" className="text-body-sm text-status-done">{notice}</p>}
        <Input
          ref={fieldRef}
          label="شماره موبایل"
          name="phone"
          type="tel"
            maxLength={24}
            hint="با صفر آغاز کنید یا شماره را با کد ۹۸+ وارد کنید."
            iconEnd={<bdi className="text-caption text-fg-secondary" dir="ltr">+98</bdi>}
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷"
          value={phone}
          onChange={(event) => { setPhone(event.target.value); setError(null); }}
          iconStart={<MobileIcon size={18} />}
          error={errorFor('phone')}
        />
        <FormError message={formError} />
        <Button type="submit" fullWidth size="lg" loading={busy}>
          دریافت کد ورود
        </Button>
        {!adminPanel && (
          <Button variant="link" type="button" iconStart={<LockIcon size={16} />} onClick={() => goTo({ kind: 'password' })}>
            ورود با رمز عبور
          </Button>
        )}
      </fieldset></form>
      {!adminPanel && <AuthPolicies />}
    </AuthCard>
  );
}

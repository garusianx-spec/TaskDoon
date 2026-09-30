'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { normaliseIranMobile, toLatinDigits, formatMobile } from '@taskin/text';
import { toPersianDigits } from '@taskin/jalali';
import { session } from '@/api/session';
import { problemMessage } from '@/api/messages';
import type { LiveStore } from '@/store/live/live-store';
import { Button, Input } from '@/components/ui';
import { ArrowRightIcon, KeyIcon, MobileIcon, UserIcon } from '@/components/icons';
import { AuthCard } from './AuthCard';

type Step =
  | { readonly kind: 'phone' }
  | { readonly kind: 'code'; readonly phone: string; readonly challengeId: string; readonly codeLength: number; readonly resendAt: number }
  | { readonly kind: 'name'; readonly signupToken: string };

/**
 * Sign-in (RFC §5.2): the phone number is the account. Mobile number → SMS code → in, or, for a
 * new number, a name first. Codes are typed in any digit script.
 */
export function SignInScreen({ store }: { readonly store: LiveStore }) {
  const [step, setStep] = useState<Step>({ kind: 'phone' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const fieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fieldRef.current?.focus();
  }, [step.kind]);

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
      </form>
    </AuthCard>
  );
}

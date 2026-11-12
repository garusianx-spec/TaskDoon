'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toLatinDigits } from '@taskin/text';
import { toPersianDigits } from '@taskin/jalali';
import { problemMessage } from '@/lib/api-problem';
import { session } from '@/features/auth/api/session';
import { useAdmin } from '@/features/admin/hooks/AdminSession';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { Button, Input } from '@/components/ui';
import { KeyIcon, LockIcon } from '@/components/icons';

/**
 * A session opened with a password shows the phone too before the panel opens: a code texted to
 * the admin's own number, once per session. The password step-up follows as usual.
 */
export function SmsConfirmPrompt({ name }: { readonly name: string }) {
  const { steppedUp, signOut } = useAdmin();
  const [challenge, setChallenge] = useState<{
    readonly challengeId: string;
    readonly codeLength: number;
    readonly resendAt: number;
  } | null>(null);
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
      setChallenge({
        challengeId: sent.challengeId,
        codeLength: sent.codeLength,
        resendAt: Date.now() + sent.resendInSeconds * 1000,
      });
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
          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={busy}
            disabled={toLatinDigits(code).trim().length !== challenge.codeLength}
          >
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
export function StepUpPrompt({ name }: { readonly name: string }) {
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

'use client';

import { useState } from 'react';
import type { User } from '@taskin/contracts';
import { formatJalali,toPersianDigits } from '@taskin/jalali';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { Button,Input } from '@/components/ui';
import { CheckCircleIcon,EyeIcon,EyeSlashIcon,KeyIcon } from '@/components/icons';
import { PasswordStrengthMeter } from '@/features/account/components/PasswordStrengthMeter';

interface PasswordManagementProps {
  readonly open: boolean;
  readonly user: Pick<User, 'email' | 'phone'>;
  readonly passwordChangedAt: string;
  readonly onPasswordChanged: () => void;
  readonly live?: PasswordManagementSession;
}

export interface PasswordManagementSession {
  readonly hasPassword: boolean;
  readonly onChangePassword: (current: string | null, next: string) => Promise<string | null>;
}

const MIN_LENGTH = 8;

export function PasswordManagement({ open, user, passwordChangedAt, onPasswordChanged, live }: PasswordManagementProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  /** Setting a first admin password needs no current one. */
  const needsCurrent = !live || live.hasPassword;

  useResetOnOpen(open, () => {
    setBusy(false);
    setServerError(null);
    setCurrent('');
    setNext('');
    setConfirm('');
    setReveal(false);
    setTouched(false);
    setSaved(false);
  });

  const currentError = needsCurrent && touched && !current ? 'رمز عبور فعلی را وارد کنید.' : undefined;
  const nextError = !touched
    ? undefined
    : next.length < MIN_LENGTH
      ? `رمز عبور جدید دست‌کم ${toPersianDigits(MIN_LENGTH)} نویسه باشد.`
      : next === current
        ? 'رمز عبور جدید باید با رمز فعلی متفاوت باشد.'
        : undefined;
  const confirmError = touched && confirm !== next ? 'تکرار رمز عبور با رمز جدید یکسان نیست.' : undefined;

  const submitPassword = async () => {
    if (busy) return;
    setTouched(true);
    setSaved(false);
    setServerError(null);
    if ((needsCurrent && !current) || next.length < MIN_LENGTH || next === current || confirm !== next) return;
    if (live) {
      setBusy(true);
      const failure = await live.onChangePassword(needsCurrent ? current : null, next);
      setBusy(false);
      if (failure) {
        setServerError(failure);
        return;
      }
    }
    onPasswordChanged();
    setCurrent('');
    setNext('');
    setConfirm('');
    setTouched(false);
    setSaved(true);
  };

  const inputType = reveal ? 'text' : 'password';
  const revealToggle = (
    <button
      type="button"
      onClick={() => setReveal((value) => !value)}
      aria-label={reveal ? 'پنهان کردن رمزها' : 'نمایش رمزها'}
      aria-pressed={reveal}
      className="flex rounded text-fg-quaternary transition-colors hover:text-fg-secondary"
    >
      {reveal ? <EyeSlashIcon size={18} /> : <EyeIcon size={18} />}
    </button>
  );

  return (
  <section aria-labelledby="security-password" className="flex flex-col gap-3">
    <div className="flex flex-wrap items-baseline gap-2">
      <h3 id="security-password" className="flex items-center gap-2 text-title-sm font-semibold text-fg-primary">
        <KeyIcon size={18} className="text-fg-quaternary" />
        {live ? (live.hasPassword ? 'تغییر رمز مدیر' : 'تعیین رمز مدیر') : 'تغییر رمز عبور'}
      </h3>
      {!live && (
        <span className="numeric text-micro text-fg-tertiary">
          {`آخرین تغییر: ${formatJalali(passwordChangedAt, 'medium')}`}
        </span>
      )}
    </div>
    {live && (
      <p className="text-caption text-fg-tertiary">
        ورود مدیران پلتفرم با کد پیامکی و سپس این رمز تکمیل می‌شود. مالکان و مدیران برای کارهای حساس، مانند حذف
        فضای کاری یا تغییر دسترسی‌ها، این رمز را دوباره وارد می‌کنند. با تغییر رمز، نشست‌های دیگر شما بسته می‌شوند.
      </p>
    )}

    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submitPassword();
      }}
    >
      {/* Lets password managers associate the fields with this account. */}
      <input type="text" autoComplete="username" value={user.email || user.phone} readOnly hidden />
      {needsCurrent && (
        <Input
          label="رمز عبور فعلی"
          type={inputType}
          autoComplete="current-password"
          dir="ltr"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          error={currentError}
          iconEnd={revealToggle}
        />
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="رمز عبور جدید"
          type={inputType}
          autoComplete="new-password"
          dir="ltr"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          error={nextError}
        />
        <Input
          label="تکرار رمز عبور جدید"
          type={inputType}
          autoComplete="new-password"
          dir="ltr"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={confirmError}
        />
      </div>

      <PasswordStrengthMeter password={next} minimumLength={MIN_LENGTH} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" loading={busy}>
          {live && !live.hasPassword ? 'ذخیره رمز مدیر' : 'به‌روزرسانی رمز عبور'}
        </Button>
        {serverError && (
          <span role="alert" className="text-caption font-medium text-status-blocked">
            {serverError}
          </span>
        )}
        {saved && (
          <span role="status" className="inline-flex items-center gap-1.5 text-caption font-medium text-status-done">
            <CheckCircleIcon size={16} />
            رمز عبور با موفقیت تغییر کرد.
          </span>
        )}
      </div>
    </form>
  </section>
  );
}

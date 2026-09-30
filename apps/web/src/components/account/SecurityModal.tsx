'use client';

import { useState } from 'react';
import type { LoginSession, User } from '@taskin/contracts';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { cn } from '@/lib/cn';
import { formatJalali, toPersianDigits } from '@taskin/jalali';
import { Badge, Button, IconButton, Input, Modal, RelativeTime, SwitchField } from '@/components/ui';
import {
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  KeyIcon,
  LogoutIcon,
  MobileIcon,
  MonitorIcon,
  ShieldIcon,
} from '@/components/icons';

export interface SecurityModalProps {
  readonly open: boolean;
  readonly user: User;
  readonly twoFactorEnabled: boolean;
  readonly passwordChangedAt: string;
  readonly sessions: readonly LoginSession[];
  readonly onClose: () => void;
  readonly onPasswordChanged: () => void;
  readonly onToggleTwoFactor: (enabled: boolean) => void;
  readonly onRevokeSession: (sessionId: string) => void;
  readonly onRevokeOtherSessions: () => void;
  /**
   * The live app. Sign-in is by SMS code, so the password here is the admin password the server
   * checks for sensitive actions; `onChangePassword` resolves to an error message, or null.
   */
  readonly live?: {
    readonly hasPassword: boolean;
    readonly onChangePassword: (current: string | null, next: string) => Promise<string | null>;
  };
}

const MIN_LENGTH = 8;

interface Strength {
  readonly score: 0 | 1 | 2 | 3 | 4;
  readonly label: string;
}

/** Length plus character-class variety; enough to steer people away from `12345678`. */
function measureStrength(password: string): Strength {
  if (!password) return { score: 0, label: '' };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  let score = 0;
  if (password.length >= MIN_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (classes >= 2) score += 1;
  if (classes >= 3) score += 1;
  const clamped = Math.min(4, Math.max(1, score)) as Strength['score'];
  const labels: Readonly<Record<Strength['score'], string>> = {
    0: '',
    1: 'ضعیف',
    2: 'متوسط',
    3: 'خوب',
    4: 'قوی',
  };
  return { score: clamped, label: labels[clamped] };
}

const STRENGTH_TONE: Readonly<Record<Strength['score'], string>> = {
  0: 'bg-sunken',
  1: 'bg-status-blocked',
  2: 'bg-status-progress',
  3: 'bg-status-done',
  4: 'bg-status-done',
};

/**
 * "امنیت و ورود": password rotation, SMS two-step sign-in and the list of signed-in devices.
 * In the demo the password form validates locally and records the change time. Live (`live`),
 * the account signs in with SMS codes and the form sets or changes the admin password on the
 * server; the two-step switch is gone, since the code is already the first factor.
 */
export function SecurityModal({
  open,
  user,
  twoFactorEnabled,
  passwordChangedAt,
  sessions,
  onClose,
  onPasswordChanged,
  onToggleTwoFactor,
  onRevokeSession,
  onRevokeOtherSessions,
  live,
}: SecurityModalProps) {
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

  const strength = measureStrength(next);
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

  const others = sessions.filter((session) => !session.current);
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
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="امنیت و ورود"
      description={
        live
          ? 'رمز مدیر و دستگاه‌هایی که با حساب شما وارد شده‌اند.'
          : 'رمز عبور، ورود دومرحله‌ای و دستگاه‌هایی که با حساب شما وارد شده‌اند.'
      }
      icon={<ShieldIcon size={20} />}
      footer={
        <Button variant="secondary" onClick={onClose}>
          بستن
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
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
              ورود به حساب با کد پیامکی است. مالکان و مدیران برای کارهای حساس، مانند حذف فضای کاری یا تغییر دسترسی‌ها، این رمز را وارد
              می‌کنند. با تغییر رمز، نشست‌های دیگر شما بسته می‌شوند.
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

            <div className="flex items-center gap-3">
              <div
                className="flex flex-1 gap-1"
                role="meter"
                aria-label="قدرت رمز عبور جدید"
                aria-valuemin={0}
                aria-valuemax={4}
                aria-valuenow={strength.score}
                aria-valuetext={strength.label || 'وارد نشده'}
              >
                {[1, 2, 3, 4].map((step) => (
                  <span
                    key={step}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-colors',
                      step <= strength.score ? STRENGTH_TONE[strength.score] : 'bg-sunken',
                    )}
                  />
                ))}
              </div>
              <span className="w-10 text-micro font-medium text-fg-tertiary">{strength.label}</span>
            </div>

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

        {!live && (
          <section aria-label="ورود دومرحله‌ای" className="rounded-xl border border-secondary p-4">
            <SwitchField
              checked={twoFactorEnabled}
              onCheckedChange={onToggleTwoFactor}
              title="ورود دومرحله‌ای با پیامک"
              description={
                <span className="numeric">
                  {twoFactorEnabled
                    ? `در هر ورود، کد یک‌بارمصرف به ${toPersianDigits(user.phone)} ارسال می‌شود.`
                    : 'با فعال‌سازی، ورود به حساب علاوه بر رمز عبور به کد پیامکی نیاز دارد.'}
                </span>
              }
            />
          </section>
        )}

        <section aria-labelledby="security-sessions" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="security-sessions" className="text-title-sm font-semibold text-fg-primary">
              نشست‌های فعال
            </h3>
            {others.length > 0 && (
              <Button
                size="xs"
                variant="secondary"
                className="ms-auto"
                iconStart={<LogoutIcon size={14} />}
                onClick={onRevokeOtherSessions}
              >
                خروج از همه نشست‌های دیگر
              </Button>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => {
              const DeviceIcon = /اندروید|آی‌اواس|موبایل/.test(session.device) ? MobileIcon : MonitorIcon;
              return (
                <li
                  key={session.id}
                  className="flex items-center gap-3 rounded-lg border border-secondary bg-surface px-3 py-2.5"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-fg-secondary">
                    <DeviceIcon size={18} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-body-sm font-semibold text-fg-primary">{session.device}</span>
                      {session.current && (
                        <Badge tone="success" size="sm" dot>
                          همین دستگاه
                        </Badge>
                      )}
                    </span>
                    <span className="numeric truncate text-micro text-fg-tertiary">
                      {`${session.location}، `}
                      {session.current ? 'فعال در حال حاضر' : <RelativeTime iso={session.lastActiveAt} />}
                    </span>
                  </span>
                  {!session.current && (
                    <IconButton
                      label={`خروج از نشست ${session.device}`}
                      icon={<LogoutIcon size={16} />}
                      size="sm"
                      className="hover:text-status-blocked"
                      onClick={() => onRevokeSession(session.id)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Modal>
  );
}

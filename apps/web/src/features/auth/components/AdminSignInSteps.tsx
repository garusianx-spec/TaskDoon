'use client';

import { Button } from '@/components/ui';
import {
  AuthFormError as FormError,
  AuthInput as Input,
  PasswordInput,
} from '@/features/auth/components/AuthFields';
import { ArrowRightIcon, KeyIcon, LockIcon } from '@/components/icons';
import { AuthCard } from '@/features/auth/components/AuthCard';
import type { SignInFlow } from '@/features/auth/hooks/useSignInFlow';
import type { Step } from '@/features/auth/types/sign-in';
import { MIN_PASSWORD } from '@/features/auth/lib/auth-input';

export function AdminSetupStep({
  flow,
  step,
}: {
  readonly flow: SignInFlow;
  readonly step: Extract<Step, { kind: 'admin-setup' }>;
}) {
  const {
    busy,
    fieldRef,
    code,
    setCode,
    password,
    setPassword,
    repeat,
    setRepeat,
    setError,
    errorFor,
    formError,
    onAdminSetup,
    goTo,
  } = flow;
  return (
    <AuthCard
      labelledBy="sign-in-title"
      title="راه‌اندازی دسترسی مدیریت"
      description="شماره موبایل تأیید شد. ایمیل بازیابی تعیین‌شده را تأیید کنید و رمز مدیر را بسازید."
    >
      <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={onAdminSetup}>
        <fieldset disabled={busy} className="auth-fields">
          {step.sent ? (
            <>
              <Input
                ref={fieldRef}
                label="کد راه‌اندازی ایمیل"
                dir="ltr"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <PasswordInput
                label="رمز مدیر جدید"
                dir="ltr"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                hint="دست‌کم ۸ نویسه، با حروف و عدد یا نماد."
              />
              <PasswordInput
                label="تکرار رمز مدیر"
                dir="ltr"
                autoComplete="new-password"
                value={repeat}
                onChange={(event) => {
                  setRepeat(event.target.value);
                  setError(null);
                }}
                error={errorFor('repeat')}
              />
            </>
          ) : (
            <p className="text-body-sm text-fg-secondary">
              کد راه‌اندازی فقط به ایمیل بازیابی ثبت‌شده ارسال می‌شود. در صورت نداشتن دسترسی، با مدیر ارشد
              تماس بگیرید.
            </p>
          )}
          <FormError message={formError} />
          <Button
            type="submit"
            fullWidth
            loading={busy}
            disabled={step.sent && (!code.trim() || password.length < MIN_PASSWORD)}
          >
            {step.sent ? 'فعال‌سازی دسترسی مدیریت' : 'ارسال کد راه‌اندازی ایمیل'}
          </Button>
          <Button type="button" variant="link" disabled={busy} onClick={() => goTo({ kind: 'phone' })}>
            شروع دوباره ورود
          </Button>
        </fieldset>
      </form>
    </AuthCard>
  );
}

export function AdminPasswordStep({
  flow,
  step,
}: {
  readonly flow: SignInFlow;
  readonly step: Extract<Step, { kind: 'admin-password' | 'admin-recovery' }>;
}) {
  const {
    busy,
    fieldRef,
    code,
    setCode,
    password,
    setPassword,
    repeat,
    setRepeat,
    setError,
    errorFor,
    formError,
    onAdminPassword,
    onAdminRecovery,
    requestAdminRecovery,
    goTo,
  } = flow;
  const recovering = step.kind === 'admin-recovery';
  return (
    <AuthCard
      labelledBy="sign-in-title"
      title={recovering ? 'بازیابی رمز مدیر' : 'تأیید رمز مدیر'}
      description={
        recovering
          ? 'اگر ایمیل تأییدشده‌ای برای حساب ثبت باشد، کد بازیابی به آن ارسال می‌شود. کد را از ایمیل کپی کنید.'
          : 'شماره موبایل تأیید شد. برای تکمیل ورود، رمز مدیر را وارد کنید.'
      }
    >
      <form
        aria-busy={busy}
        className="flex flex-col gap-4"
        onSubmit={recovering ? onAdminRecovery : onAdminPassword}
        noValidate
      >
        <fieldset disabled={busy} className="auth-fields">
          {recovering && (
            <Input
              ref={fieldRef}
              label="کد بازیابی ایمیل"
              name="recovery-code"
              autoComplete="one-time-code"
              dir="ltr"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError(null);
              }}
              iconStart={<KeyIcon size={18} />}
              error={errorFor('code')}
            />
          )}
          <PasswordInput
            ref={recovering ? undefined : fieldRef}
            label={recovering ? 'رمز عبور تازه' : 'رمز مدیر'}
            name={recovering ? 'new-password' : 'admin-password'}
            autoComplete={recovering ? 'new-password' : 'current-password'}
            dir="ltr"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            iconStart={<LockIcon size={18} />}
            error={errorFor('password')}
          />
          {recovering && (
            <PasswordInput
              label="تکرار رمز عبور تازه"
              name="repeat-password"
              autoComplete="new-password"
              dir="ltr"
              value={repeat}
              onChange={(event) => {
                setRepeat(event.target.value);
                setError(null);
              }}
              error={errorFor('repeat')}
            />
          )}
          <FormError message={formError} />
          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={busy}
            disabled={!password || (recovering && !code.trim())}
          >
            {recovering ? 'ذخیره رمز تازه' : 'تکمیل ورود'}
          </Button>
          {!recovering && (
            <Button variant="link" type="button" disabled={busy} onClick={requestAdminRecovery}>
              بازیابی با ایمیل تأییدشده
            </Button>
          )}
          {recovering && (
            <Button
              variant="link"
              type="button"
              disabled={busy}
              onClick={() => goTo({ ...step, kind: 'admin-password' })}
            >
              بازگشت به رمز مدیر
            </Button>
          )}
          <Button
            variant="link"
            type="button"
            disabled={busy}
            iconStart={<ArrowRightIcon size={16} />}
            onClick={() => goTo({ kind: 'phone' })}
          >
            شروع دوباره ورود
          </Button>
        </fieldset>
      </form>
    </AuthCard>
  );
}

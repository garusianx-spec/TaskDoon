'use client';

import { toLatinDigits } from '@taskin/text';
import { toPersianDigits } from '@taskin/jalali';
import { Button } from '@/components/ui';
import { AuthFormError as FormError, OtpInput, PasswordInput } from '@/features/auth/components/AuthFields';
import { maskedMobile } from '@/features/auth/lib/auth-input';
import { ArrowRightIcon, KeyIcon, LockIcon } from '@/components/icons';
import { AuthCard } from '@/features/auth/components/AuthCard';
import type { SignInFlow } from '@/features/auth/hooks/useSignInFlow';
import type { SmsStep } from '@/features/auth/types/sign-in';
import { MIN_PASSWORD } from '@/features/auth/lib/auth-input';

function ChallengeEnded({ exhausted, waiting }: { readonly exhausted?: boolean; readonly waiting: boolean }) {
  return (
    <p role="status" className="auth-inline-note">
      {exhausted ? 'تعداد تلاش‌ها بیش از حد مجاز شد.' : 'کد منقضی شده است.'}{' '}
      {waiting ? 'پس از پایان شمارش، کد تازه‌ای بگیرید.' : 'برای ادامه کد تازه‌ای بگیرید.'}
    </p>
  );
}

export function ResetPasswordStep({ flow, step }: { readonly flow: SignInFlow; readonly step: SmsStep }) {
  const {
    now,
    busy,
    onReset,
    fieldRef,
    code,
    setCode,
    setError,
    errorFor,
    formError,
    password,
    setPassword,
    repeat,
    setRepeat,
    goTo,
    requestReset,
  } = flow;
  const wait = Math.max(0, Math.ceil((step.resendAt - now) / 1000));
  const expired = now >= step.expiresAt;
  return (
    <AuthCard
      labelledBy="sign-in-title"
      title="گذاشتن رمز عبور تازه"
      description={
        <>
          کد {toPersianDigits(step.codeLength)} رقمی بازنشانی به{' '}
          <bdi dir="ltr">{toPersianDigits(maskedMobile(step.phone))}</bdi> پیامک شد.
        </>
      }
    >
      <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={onReset} noValidate>
        <fieldset disabled={busy} className="auth-fields">
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
            onValueChange={(value) => {
              setCode(value);
              setError(null);
            }}
            iconStart={<KeyIcon size={18} />}
            error={expired ? undefined : errorFor('code')}
          />
          <PasswordInput
            label="رمز عبور تازه"
            name="new-password"
            autoComplete="new-password"
            dir="ltr"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
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
            onChange={(event) => {
              setRepeat(event.target.value);
              setError(null);
            }}
            iconStart={<LockIcon size={18} />}
            error={expired ? undefined : errorFor('repeat')}
          />
          <FormError message={errorFor('resend') ?? (expired ? undefined : formError)} />
          <Button type="submit" fullWidth size="lg" loading={busy} disabled={expired}>
            ذخیره رمز و ورود
          </Button>
          <div className="flex items-center justify-between text-caption text-fg-tertiary">
            <Button
              variant="link"
              type="button"
              iconStart={<ArrowRightIcon size={16} />}
              onClick={() => goTo({ kind: 'forgot' })}
            >
              تغییر شماره
            </Button>
            <Button
              variant={expired && wait === 0 ? 'secondary' : 'link'}
              type="button"
              disabled={wait > 0 || busy}
              onClick={() => void requestReset(step.phone)}
            >
              {wait > 0 ? `ارسال دوباره تا ${toPersianDigits(wait)} ثانیه` : 'ارسال دوباره کد'}
            </Button>
          </div>
        </fieldset>
      </form>
    </AuthCard>
  );
}

export function OtpSignInStep({ flow, step }: { readonly flow: SignInFlow; readonly step: SmsStep }) {
  const { now, busy, onCode, fieldRef, code, setCode, setError, errorFor, formError, goTo, requestCode } =
    flow;
  const wait = Math.max(0, Math.ceil((step.resendAt - now) / 1000));
  const expired = now >= step.expiresAt;
  return (
    <AuthCard
      labelledBy="sign-in-title"
      title="کد ورود را وارد کنید"
      description={
        <>
          کد {toPersianDigits(step.codeLength)} رقمی به{' '}
          <bdi dir="ltr">{toPersianDigits(maskedMobile(step.phone))}</bdi> پیامک شد.
        </>
      }
    >
      <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={onCode} noValidate>
        <fieldset disabled={busy} className="auth-fields">
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
            onValueChange={(value) => {
              setCode(value);
              setError(null);
            }}
            iconStart={<KeyIcon size={18} />}
            error={expired ? undefined : errorFor('code')}
          />
          <FormError message={errorFor('resend') ?? (expired ? undefined : formError)} />
          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={busy}
            disabled={busy || expired || toLatinDigits(code).trim().length !== step.codeLength}
          >
            ورود
          </Button>
          <div className="flex items-center justify-between text-caption text-fg-tertiary">
            <Button
              variant="link"
              type="button"
              disabled={busy}
              iconStart={<ArrowRightIcon size={16} />}
              onClick={() => goTo({ kind: 'phone' })}
            >
              تغییر شماره
            </Button>
            <Button
              variant={expired && wait === 0 ? 'secondary' : 'link'}
              type="button"
              disabled={wait > 0 || busy}
              onClick={() => void requestCode(step.phone)}
            >
              {wait > 0 ? `ارسال دوباره تا ${toPersianDigits(wait)} ثانیه` : 'ارسال دوباره کد'}
            </Button>
          </div>
        </fieldset>
      </form>
    </AuthCard>
  );
}

'use client';

import { Button } from '@/components/ui';
import { AuthFormError as FormError,AuthInput as Input,PasswordInput } from '@/features/auth/components/AuthFields';
import { ArrowRightIcon,LockIcon,MobileIcon } from '@/components/icons';
import { AuthCard } from '@/features/auth/components/AuthCard';
import type { SignInFlow } from '@/features/auth/hooks/useSignInFlow';
import { SuspendedAccountNotice } from '@/features/auth/components/PhoneSignInSteps';

export function PasswordSignInStep({ flow }: { readonly flow: SignInFlow }) {
  const { busy, onPassword, suspended, notice, fieldRef, phone, setPhone, setError, errorFor, password, setPassword, formError, goTo } = flow;
  return (
    <AuthCard labelledBy="sign-in-title" title="ورود با رمز عبور" description="با شماره موبایل و رمز عبوری که در «امنیت و ورود» گذاشته‌اید وارد شوید.">
      <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={onPassword} noValidate><fieldset disabled={busy} className="auth-fields">
        {suspended && <SuspendedAccountNotice />}
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

export function ForgotPasswordStep({ flow }: { readonly flow: SignInFlow }) {
  const { busy, onForgot, fieldRef, phone, setPhone, setError, errorFor, formError, goTo } = flow;
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

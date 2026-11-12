'use client';

import { codeMessage } from '@/lib/api-problem';
import { Button } from '@/components/ui';
import { AuthFormError as FormError, AuthInput as Input } from '@/features/auth/components/AuthFields';
import { LockIcon, MobileIcon, UserIcon, WarningIcon } from '@/components/icons';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { AuthPolicies } from '@/features/auth/components/AuthPolicies';
import type { SignInFlow } from '@/features/auth/hooks/useSignInFlow';

export function SuspendedAccountNotice() {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-status-blocked-line bg-status-blocked-subtle px-3 py-2 text-body-sm text-status-blocked"
    >
      <WarningIcon size={18} className="mt-0.5 shrink-0" />
      <span>{codeMessage('ACCOUNT_SUSPENDED')}</span>
    </p>
  );
}

export function PhoneSignInStep({ flow }: { readonly flow: SignInFlow }) {
  const {
    adminPanel,
    invited,
    suspended,
    notice,
    busy,
    onPhone,
    fieldRef,
    phone,
    setPhone,
    setError,
    errorFor,
    formError,
    goTo,
  } = flow;
  return (
    <AuthCard
      labelledBy="sign-in-title"
      title={adminPanel ? 'ورود به پنل مدیریت پلتفرم' : invited ? 'پیوستن به فضای کاری' : 'ورود به تسک‌دون'}
      description={
        invited
          ? 'به یک فضای کاری دعوت شده‌اید. با شماره موبایلی که دعوت‌نامه به آن رسیده وارد شوید.'
          : 'با شماره موبایل خود وارد شوید؛ کد ورود پیامک می‌شود.'
      }
    >
      <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={onPhone} noValidate>
        <fieldset disabled={busy} className="auth-fields">
          {suspended && <SuspendedAccountNotice />}
          {notice && (
            <p role="status" className="text-body-sm text-status-done">
              {notice}
            </p>
          )}
          <Input
            ref={fieldRef}
            label="شماره موبایل"
            name="phone"
            type="tel"
            maxLength={24}
            hint="با صفر آغاز کنید یا شماره را با کد ۹۸+ وارد کنید."
            iconEnd={
              <bdi className="text-caption text-fg-secondary" dir="ltr">
                +98
              </bdi>
            }
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setError(null);
            }}
            iconStart={<MobileIcon size={18} />}
            error={errorFor('phone')}
          />
          <FormError message={formError} />
          <Button type="submit" fullWidth size="lg" loading={busy}>
            دریافت کد ورود
          </Button>
          {!adminPanel && (
            <Button
              variant="link"
              type="button"
              iconStart={<LockIcon size={16} />}
              onClick={() => goTo({ kind: 'password' })}
            >
              ورود با رمز عبور
            </Button>
          )}
        </fieldset>
      </form>
      {!adminPanel && <AuthPolicies />}
    </AuthCard>
  );
}

export function SignUpStep({ flow }: { readonly flow: SignInFlow }) {
  const { busy, onName, fieldRef, name, setName, setError, errorFor, formError, goTo } = flow;
  return (
    <AuthCard
      labelledBy="sign-in-title"
      title="به تسک‌دون خوش آمدید"
      description="برای ساخت حساب، نام خود را همان‌طور که همکاران می‌شناسند بنویسید."
    >
      <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={onName} noValidate>
        <fieldset disabled={busy} className="auth-fields">
          <Input
            ref={fieldRef}
            label="نام و نام خانوادگی"
            name="fullName"
            autoComplete="name"
            maxLength={80}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            iconStart={<UserIcon size={18} />}
            error={errorFor('name')}
          />
          <FormError message={formError} />
          <Button type="submit" fullWidth size="lg" loading={busy}>
            ساخت حساب و ورود
          </Button>
          <Button type="button" variant="link" onClick={() => goTo({ kind: 'phone' })}>
            شروع دوباره با شماره موبایل
          </Button>
        </fieldset>
      </form>
      <AuthPolicies />
    </AuthCard>
  );
}

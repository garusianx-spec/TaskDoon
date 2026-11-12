'use client';

import type { LoginSession,User } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { Button,Modal,SwitchField } from '@/components/ui';
import { ShieldIcon } from '@/components/icons';
import { ActiveSessions } from '@/features/account/components/ActiveSessions';
import { PasswordManagement,type PasswordManagementSession } from '@/features/account/components/PasswordManagement';
import { RecoveryEmail } from '@/features/account/components/RecoveryEmail';

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
  readonly live?: PasswordManagementSession;
}

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
        {live && <RecoveryEmail key={user.email ?? ''} email={user.email} open={open} />}
        <PasswordManagement open={open} user={user} passwordChangedAt={passwordChangedAt} onPasswordChanged={onPasswordChanged} {...(live ? { live } : {})} />

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

        <ActiveSessions sessions={sessions} onRevokeSession={onRevokeSession} onRevokeOtherSessions={onRevokeOtherSessions} />
      </div>
    </Modal>
  );
}

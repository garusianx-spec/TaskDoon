'use client';

import { useState } from 'react';
import type { PlatformModerationResult, PlatformUserSummary } from '@taskin/contracts';
import { adminApi } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { problemMessage } from '@/api/messages';
import { Button, Checkbox, Modal, Textarea } from '@/components/ui';
import { KeyIcon } from '@/components/icons';

/**
 * Requires a new password (or stops requiring one). While required, the current password signs
 * nobody in and opens no step-up; its owner sets a new one with an SMS code («فراموشی رمز
 * عبور») or a reset link, which lifts the requirement. The password itself is never seen here.
 */
export function ForcePasswordResetDialog({
  user,
  open,
  onClose,
  onDone,
}: {
  readonly user: Pick<PlatformUserSummary, 'id' | 'fullName' | 'passwordResetRequired'>;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onDone: (result: PlatformModerationResult) => void;
}) {
  const { call } = useAdmin();
  const [signOut, setSignOut] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const require = !user.passwordResetRequired;

  const reset = () => {
    setSignOut(true);
    setReason('');
    setError(null);
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await call(() =>
        adminApi.setPasswordResetRequired(user.id, { required: require, ...(require ? { signOut } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      );
      reset();
      onDone(result);
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      role="alertdialog"
      size="md"
      icon={<KeyIcon size={20} />}
      title={require ? 'اجبار به تغییر رمز عبور' : 'لغو اجبار تغییر رمز'}
      description={
        require
          ? `رمز فعلی ${user.fullName} از کار می‌افتد تا خودش با کد پیامکی («فراموشی رمز عبور») یا پیوند بازنشانی، رمز تازه‌ای بگذارد.`
          : `رمز فعلی ${user.fullName} دوباره برای ورود پذیرفته می‌شود.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            انصراف
          </Button>
          <Button variant={require ? 'destructive' : 'primary'} loading={busy} onClick={() => void confirm()}>
            {require ? 'اجبار به تغییر رمز' : 'لغو اجبار'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {require && (
          <Checkbox
            checked={signOut}
            onCheckedChange={setSignOut}
            label={
              <span className="flex flex-col gap-0.5">
                <span className="text-body-sm font-medium text-fg-primary">خروج از همه نشست‌ها</span>
                <span className="text-caption text-fg-tertiary">همه دستگاه‌ها فوراً از حساب خارج می‌شوند.</span>
              </span>
            }
          />
        )}
        <Textarea label="دلیل (اختیاری)" hint="در گزارش بازرسی ثبت می‌شود." rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        {error && (
          <p role="alert" className="rounded-lg bg-status-blocked-subtle px-3 py-2 text-body-sm text-status-blocked">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

'use client';

import { useState } from 'react';
import type { PlatformModerationResult, PlatformUserSummary } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { adminApi } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { problemMessage } from '@/api/messages';
import { Button, Modal, Textarea } from '@/components/ui';
import { CheckCircleIcon, LockIcon } from '@/components/icons';

const MIN_REASON = 3;
const MAX_REASON = 500;

/**
 * Confirms a suspension (with its reason, required: it goes into the audit log) or lifting one.
 * A suspension takes effect at once: every session ends, live connections close, and signing in
 * again is refused with «حساب کاربری شما … معلق شده است».
 */
export function SuspendUserDialog({
  user,
  mode,
  open,
  onClose,
  onDone,
}: {
  readonly user: Pick<PlatformUserSummary, 'id' | 'fullName' | 'activeSessionCount'>;
  readonly mode: 'suspend' | 'unsuspend';
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onDone: (result: PlatformModerationResult) => void;
}) {
  const { call } = useAdmin();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suspend = mode === 'suspend';
  const ready = !suspend || reason.trim().length >= MIN_REASON;

  const close = () => {
    if (busy) return;
    setReason('');
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const result = await call(() => (suspend ? adminApi.suspend(user.id, reason.trim()) : adminApi.unsuspend(user.id, reason.trim() || undefined)));
      setReason('');
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
      icon={suspend ? <LockIcon size={20} /> : <CheckCircleIcon size={20} />}
      title={suspend ? `تعلیق ${user.fullName}` : `رفع تعلیق ${user.fullName}`}
      description={
        suspend
          ? 'حساب فوراً مسدود می‌شود و تا رفع تعلیق، ورود به تسک‌دون ممکن نیست.'
          : 'حساب دوباره فعال می‌شود و کاربر می‌تواند با کد پیامکی یا رمز عبور وارد شود.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            انصراف
          </Button>
          <Button variant={suspend ? 'destructive' : 'primary'} loading={busy} disabled={!ready} onClick={() => void confirm()}>
            {suspend ? 'تعلیق کاربر' : 'رفع تعلیق'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {suspend ? (
          <ul className="flex list-disc flex-col gap-1 ps-5 text-body-sm text-fg-secondary">
            <li>
              همه نشست‌ها فوراً بسته می‌شوند
              {user.activeSessionCount > 0 ? ` (${toPersianDigits(user.activeSessionCount)} نشست فعال)` : ''} و اتصال‌های زنده قطع می‌شود.
            </li>
            <li>ورود با کد پیامکی یا رمز عبور رد می‌شود و پیام «حساب معلق است» به کاربر نشان داده می‌شود.</li>
            <li>این اقدام با دلیل آن در گزارش بازرسی ثبت می‌شود.</li>
          </ul>
        ) : (
          <p className="text-body-sm text-fg-secondary">نشست‌هایی که هنگام تعلیق بسته شدند باز نمی‌شوند؛ کاربر باید دوباره وارد شود.</p>
        )}
        <Textarea
          label={suspend ? 'دلیل تعلیق' : 'توضیح (اختیاری)'}
          hint={suspend ? `الزامی، دست‌کم ${toPersianDigits(MIN_REASON)} نویسه؛ در گزارش بازرسی ثبت می‌شود.` : 'در گزارش بازرسی ثبت می‌شود.'}
          rows={3}
          maxLength={MAX_REASON}
          required={suspend}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          data-autofocus
        />
        {error && (
          <p role="alert" className="rounded-lg bg-status-blocked-subtle px-3 py-2 text-body-sm text-status-blocked">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

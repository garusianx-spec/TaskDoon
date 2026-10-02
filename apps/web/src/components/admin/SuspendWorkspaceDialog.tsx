'use client';

import { useState } from 'react';
import type { PlatformWorkspaceModerationResult, PlatformWorkspaceSummary } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { adminApi } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { problemMessage } from '@/api/messages';
import { Button, Modal, Textarea } from '@/components/ui';
import { CheckCircleIcon, LockIcon } from '@/components/icons';

const MIN_REASON = 3;

/**
 * Confirms suspending a workspace (its reason is required: it goes into the audit log) or lifting
 * a suspension. A suspension takes effect at once for every member; their other workspaces and
 * their accounts are untouched.
 */
export function SuspendWorkspaceDialog({
  workspace,
  mode,
  onClose,
  onDone,
}: {
  readonly workspace: Pick<PlatformWorkspaceSummary, 'id' | 'name' | 'memberCount'>;
  readonly mode: 'suspend' | 'unsuspend';
  readonly onClose: () => void;
  readonly onDone: (result: PlatformWorkspaceModerationResult) => void;
}) {
  const { call } = useAdmin();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suspend = mode === 'suspend';
  const ready = !suspend || reason.trim().length >= MIN_REASON;

  const close = () => {
    if (!busy) onClose();
  };

  const confirm = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await call(() => (suspend ? adminApi.suspendWorkspace(workspace.id, reason.trim()) : adminApi.unsuspendWorkspace(workspace.id, reason.trim() || undefined))));
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      role="alertdialog"
      size="md"
      icon={suspend ? <LockIcon size={20} /> : <CheckCircleIcon size={20} />}
      title={suspend ? `تعلیق ${workspace.name}` : `رفع تعلیق ${workspace.name}`}
      description={
        suspend ? 'فضای کاری فوراً برای همه اعضا بسته می‌شود تا تعلیق برداشته شود.' : 'فضای کاری دوباره برای همه اعضایش باز می‌شود.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            انصراف
          </Button>
          <Button variant={suspend ? 'destructive' : 'primary'} loading={busy} disabled={!ready} onClick={() => void confirm()}>
            {suspend ? 'تعلیق فضای کاری' : 'رفع تعلیق'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {suspend ? (
          <ul className="flex list-disc flex-col gap-1 ps-5 text-body-sm text-fg-secondary">
            <li>
              همه اعضا ({toPersianDigits(workspace.memberCount)} نفر) به وظایف، گفتگوها و فایل‌های این فضای کاری دسترسی ندارند و پیام «این فضای کاری معلق شده است» را می‌بینند.
            </li>
            <li>حساب کاربری اعضا و فضاهای کاری دیگرشان دست‌نخورده می‌ماند.</li>
            <li>دعوت‌نامه‌ها و پیام‌های زمان‌بندی‌شده تا رفع تعلیق کار نمی‌کنند.</li>
            <li>این اقدام با دلیل آن در گزارش بازرسی ثبت می‌شود.</li>
          </ul>
        ) : (
          <p className="text-body-sm text-fg-secondary">پیام‌های زمان‌بندی‌شده‌ای که در زمان تعلیق رسیدند ارسال نشده‌اند و باید دوباره زمان‌بندی شوند.</p>
        )}
        <Textarea
          label={suspend ? 'دلیل تعلیق' : 'توضیح (اختیاری)'}
          hint={suspend ? `الزامی، دست‌کم ${toPersianDigits(MIN_REASON)} نویسه؛ در گزارش بازرسی ثبت می‌شود.` : 'در گزارش بازرسی ثبت می‌شود.'}
          rows={3}
          maxLength={500}
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

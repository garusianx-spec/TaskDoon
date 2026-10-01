'use client';

import Link from 'next/link';
import type { PlatformUserSummary } from '@taskin/contracts';
import { SlideOver } from '@/components/ui';
import { SessionsPanel } from './SessionsPanel';

/**
 * «مشاهده نشست‌های فعال» from the directory: the session inspector of one person in a side
 * panel, opened on the active ones, with ending one or all of them.
 */
export function SessionsDrawer({
  user,
  onClose,
  onChanged,
}: {
  readonly user: Pick<PlatformUserSummary, 'id' | 'fullName'> | null;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  // Escape in a confirmation over this panel closes the confirmation only.
  const close = () => {
    if (document.querySelector('[role="alertdialog"]')) return;
    onClose();
  };

  return (
    <SlideOver
      open={user !== null}
      onClose={close}
      title={user ? `نشست‌های ${user.fullName}` : 'نشست‌ها'}
      description="دستگاه‌های واردشده به این حساب؛ پایان هر نشست در گزارش بازرسی ثبت می‌شود."
      className="sm:!w-[min(44rem,100vw)]"
      footer={
        user && (
          <Link href={`/admin/users/${user.id}`} className="text-body-sm font-medium text-fg-brand hover:underline">
            مشاهده پروفایل کامل
          </Link>
        )
      }
    >
      {user && (
        <div className="p-4">
          <SessionsPanel userId={user.id} onChanged={onChanged} initialFilter="active" />
        </div>
      )}
    </SlideOver>
  );
}

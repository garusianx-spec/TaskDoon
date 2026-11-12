'use client';

import { Button, Modal } from '@/components/ui';
import { LogoutIcon } from '@/components/icons';

export interface SignOutModalProps {
  readonly open: boolean;
  readonly fullName: string;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

/** Confirms sign-out and spells out what is cleared and what is kept on this device. */
export function SignOutModal({ open, fullName, onClose, onConfirm }: SignOutModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="خروج از حساب کاربری"
      description={`${fullName}، آیا می‌خواهید از تسک‌دون خارج شوید؟`}
      icon={<LogoutIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button variant="destructive" iconStart={<LogoutIcon size={18} />} onClick={onConfirm}>
            خروج از حساب
          </Button>
        </>
      }
    >
      <ul className="flex list-disc flex-col gap-1.5 ps-5 text-body-sm text-fg-secondary">
        <li>اطلاعات این نشست (وظایف، پیام‌ها، یادداشت‌ها و اعلان‌ها) از این مرورگر پاک می‌شود.</li>
        <li>پوسته و پالت رنگی انتخاب‌شده روی همین دستگاه باقی می‌ماند.</li>
      </ul>
    </Modal>
  );
}

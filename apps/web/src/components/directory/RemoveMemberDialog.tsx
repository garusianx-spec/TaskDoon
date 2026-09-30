'use client';

import { useState } from 'react';
import type { User } from '@taskin/contracts';
import { formatCount } from '@/lib/format';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { Button, Input, Modal } from '@/components/ui';
import { UserIcon } from '@/components/icons';

/** Days a removed member's conversations and projects wait for them (the API's retention). */
const RETURN_DAYS = 40;

/**
 * «حذف از فضای کاری»: the member goes, their history does not. What they wrote stays under their
 * name (as a former member), and re-inviting them within 40 days gives their place back.
 */
export function RemoveMemberDialog({
  member,
  requirePassword,
  onClose,
  onConfirm,
}: {
  readonly member: User | null;
  /** The live app asks for the admin password again (step-up). */
  readonly requirePassword: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (password?: string) => void;
}) {
  const [password, setPassword] = useState('');
  useResetOnOpen(member !== null, () => setPassword(''));
  const ready = !requirePassword || password.length > 0;

  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      size="sm"
      title={member ? `حذف ${member.fullName} از فضای کاری` : 'حذف عضو'}
      description="دسترسی او به این فضای کاری برداشته می‌شود؛ هیچ‌چیز از کارهایش پاک نمی‌شود."
      icon={<UserIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button variant="destructive" disabled={!ready} onClick={() => onConfirm(requirePassword ? password : undefined)}>
            حذف از فضای کاری
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-fg-secondary">
          {`پیام‌ها، وظایف، نظرها و فعالیت‌هایش با نام او و نشان «عضو سابق» می‌ماند. اگر تا ${formatCount(RETURN_DAYS)} روز دوباره دعوت شود، گفتگوها و پروژه‌هایش را پس می‌گیرد.`}
        </p>
        {requirePassword && (
          <Input
            label="رمز مدیر"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint="برای این کار حساس، رمز مدیر دوباره پرسیده می‌شود."
          />
        )}
      </div>
    </Modal>
  );
}

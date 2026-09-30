'use client';

import { useEffect, useState } from 'react';
import type { Workspace } from '@taskin/contracts';
import { Button, Checkbox, Input, Modal } from '@/components/ui';
import { WarningIcon } from '@/components/icons';

export interface DeleteWorkspaceModalProps {
  readonly workspace: Workspace | null;
  readonly onClose: () => void;
  /** `password` is set when `requirePassword` asked for the admin password (step-up). */
  readonly onConfirm: (password?: string) => void;
  readonly requirePassword?: boolean;
}

/**
 * Irreversible workspace deletion. The button stays disabled until the Owner types the
 * workspace's exact name and acknowledges the consequence — two deliberate acts, so it can
 * never happen from a stray click or a reflexive Enter. The overlay does not dismiss it.
 */
export function DeleteWorkspaceModal({ workspace, onClose, onConfirm, requirePassword = false }: DeleteWorkspaceModalProps) {
  const [typed, setTyped] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    setTyped('');
    setAcknowledged(false);
    setPassword('');
  }, [workspace]);

  const matches = workspace !== null && typed.trim() === workspace.name;
  const ready = matches && acknowledged && (!requirePassword || password.length > 0);
  const confirm = () => {
    if (!ready) return;
    if (requirePassword) onConfirm(password);
    else onConfirm();
  };

  return (
    <Modal
      open={workspace !== null}
      onClose={onClose}
      size="sm"
      dismissOnOverlayClick={false}
      title="حذف دائمی فضای کاری"
      description={
        workspace ? `«${workspace.name}» و همه داده‌های آن حذف می‌شود. این کار بازگشت‌پذیر نیست.` : undefined
      }
      icon={<WarningIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button variant="destructive" disabled={!ready} onClick={confirm}>
            حذف دائمی
          </Button>
        </>
      }
    >
      {workspace && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            confirm();
          }}
        >
          <Input
            label={`برای تایید، نام فضای کاری («${workspace.name}») را بنویسید`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            error={typed && !matches ? 'نام واردشده با نام فضای کاری یکسان نیست.' : undefined}
            data-autofocus
          />
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
          <Checkbox
            checked={acknowledged}
            onCheckedChange={setAcknowledged}
            label="می‌دانم که وظایف، گفتگوها، یادداشت‌ها و رویدادهای این فضا برای همه اعضا از بین می‌رود."
          />
        </form>
      )}
    </Modal>
  );
}

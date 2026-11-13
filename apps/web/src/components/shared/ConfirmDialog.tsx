'use client';

import { Button, Modal, type ModalProps } from '@/components/ui';
import { FormError } from '@/components/shared/FormError';

export interface ConfirmDialogProps extends Omit<ModalProps, 'footer'> {
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly busy?: boolean;
  readonly busyLabel?: string;
  readonly error?: string | null;
  readonly confirmDisabled?: boolean;
}

export function ConfirmDialog({
  confirmLabel,
  onConfirm,
  busy = false,
  busyLabel = confirmLabel,
  error = null,
  confirmDisabled = false,
  onClose,
  ...modal
}: ConfirmDialogProps) {
  return (
    <Modal
      size="sm"
      {...modal}
      onClose={onClose}
      footer={
        <>
          <FormError message={error} className="basis-full" />
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            انصراف
          </Button>
          <Button variant="destructive" disabled={confirmDisabled} loading={busy} onClick={onConfirm}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </>
      }
    />
  );
}

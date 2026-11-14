'use client';

import { Button, Modal, type ModalProps } from '@/components/ui';

export interface ConfirmDialogProps extends Omit<ModalProps, 'footer'> {
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly busy?: boolean;
  readonly confirmDisabled?: boolean;
}

export function ConfirmDialog({
  confirmLabel,
  onConfirm,
  busy = false,
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
          <Button className="max-sm:min-h-11" variant="secondary" disabled={busy} onClick={onClose}>
            انصراف
          </Button>
          <Button
            className="max-sm:min-h-11"
            variant="destructive"
            disabled={confirmDisabled}
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

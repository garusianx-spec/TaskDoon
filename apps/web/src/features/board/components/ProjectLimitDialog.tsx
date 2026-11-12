'use client';

import { formatCount } from '@/lib/format';
import { Button, Modal } from '@/components/ui';
import { WarningIcon } from '@/components/icons';

export interface ProjectLimitDialogProps {
  readonly open: boolean;
  /** The plan's project allowance. */
  readonly limit: number;
  /** The plan's name, as the workspace shows it. */
  readonly plan: string;
  readonly onClose: () => void;
}

/**
 * Shown instead of «پروژه جدید» once the workspace has every project its plan allows: the form
 * would only be refused on submit, so the member hears it before typing anything.
 */
export function ProjectLimitDialog({ open, limit, plan, onClose }: ProjectLimitDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      role="alertdialog"
      size="sm"
      title="سقف پروژه‌های این فضای کاری پر شده است"
      description={`طرح «${plan}» حداکثر ${formatCount(limit)} پروژه دارد و همه‌اش استفاده شده است.`}
      icon={<WarningIcon size={20} />}
      footer={<Button onClick={onClose}>متوجه شدم</Button>}
    >
      <p className="text-body-sm text-fg-secondary">
        برای ساختن پروژه تازه، طرح فضای کاری را ارتقا دهید یا با مدیر فضای کاری تماس بگیرید.
      </p>
    </Modal>
  );
}

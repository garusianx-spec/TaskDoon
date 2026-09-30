'use client';

import type { ScheduledMessage } from '@taskin/contracts';
import { formatJalali } from '@taskin/jalali';
import { formatCount } from '@/lib/format';
import { Badge, Button, EmptyState, Modal } from '@/components/ui';
import { ClockIcon, SendIcon, TrashIcon } from '@/components/icons';

/** The strip above the composer while this member has messages waiting in the conversation. */
export function ScheduledMessagesBar({ count, onOpen }: { readonly count: number; readonly onOpen: () => void }) {
  return (
    <div className="shrink-0 border-t border-secondary bg-surface px-3 pt-2">
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="flex w-full items-center gap-2 rounded-lg bg-brand-subtle px-3 py-2 text-start text-body-sm font-medium text-fg-brand transition-colors hover:bg-hover"
      >
        <ClockIcon size={18} />
        <span className="flex-1">پیام‌های زمان‌بندی‌شده</span>
        <Badge tone="brand" numeric>
          {formatCount(count)}
        </Badge>
      </button>
    </div>
  );
}

/**
 * «پیام‌های زمان‌بندی‌شده»: what waits to be sent in this conversation, soonest first, each with
 * «ارسال فوری» and «لغو / حذف». Only their author ever sees these.
 */
export function ScheduledMessagesModal({
  open,
  entries,
  onClose,
  onSendNow,
  onCancel,
}: {
  readonly open: boolean;
  readonly entries: readonly ScheduledMessage[];
  readonly onClose: () => void;
  readonly onSendNow: (scheduledId: string) => void;
  readonly onCancel: (scheduledId: string) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="پیام‌های زمان‌بندی‌شده"
      description="تا زمان ارسال، فقط شما این پیام‌ها را می‌بینید."
      icon={<ClockIcon size={20} />}
      footer={
        <Button variant="secondary" onClick={onClose}>
          بستن
        </Button>
      }
    >
      {entries.length === 0 ? (
        <EmptyState icon={<ClockIcon size={26} />} title="پیامی در انتظار ارسال نیست" description="پیام‌های زمان‌بندی‌شده پس از ارسال از این فهرست بیرون می‌روند." />
      ) : (
        <ul aria-label="پیام‌های در انتظار ارسال" className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-2 rounded-xl border border-secondary bg-surface p-3">
              <p className="line-clamp-3 whitespace-pre-wrap text-body-sm text-fg-primary">{entry.text || entry.attachmentName || 'فایل'}</p>
              <p className="numeric flex items-center gap-1.5 text-caption text-fg-tertiary">
                <ClockIcon size={14} />
                {`ارسال در ${formatJalali(entry.scheduledAt, 'full')}`}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="secondary" iconStart={<TrashIcon size={16} />} onClick={() => onCancel(entry.id)}>
                  لغو / حذف
                </Button>
                <Button size="sm" iconStart={<SendIcon size={16} />} onClick={() => onSendNow(entry.id)}>
                  ارسال فوری
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

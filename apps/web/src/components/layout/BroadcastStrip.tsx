'use client';

import type { BroadcastLevel } from '@taskin/contracts';
import { CloseIcon, NotificationIcon, WarningIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

export const BROADCAST_LEVEL_LABELS: Readonly<Record<BroadcastLevel, string>> = {
  info: 'اطلاع‌رسانی', warning: 'هشدار', critical: 'فوری',
};
const TONES: Readonly<Record<BroadcastLevel, string>> = {
  info: 'border-brand bg-brand-subtle text-fg-brand',
  warning: 'border-status-progress-line bg-status-progress-subtle text-status-progress',
  critical: 'border-status-blocked-line bg-status-blocked-subtle text-status-blocked',
};

/** The actual banner and the admin preview render the same text and level treatment. */
export function BroadcastStrip({ message, level, onDismiss, preview = false }: {
  readonly message: string;
  readonly level: BroadcastLevel;
  readonly onDismiss?: () => void;
  readonly preview?: boolean;
}) {
  const Icon = level === 'info' ? NotificationIcon : WarningIcon;
  return (
    <div
      dir="rtl"
      role={preview ? undefined : level === 'critical' ? 'alert' : 'status'}
      aria-atomic={preview ? undefined : true}
      data-broadcast-level={level}
      className={cn('flex items-start gap-3 border-b px-4 py-2 text-sm leading-relaxed', TONES[level])}
    >
      <Icon size={20} className="mt-1 shrink-0" />
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words py-1.5">
        <span className="me-2 font-semibold">{BROADCAST_LEVEL_LABELS[level]}:</span>
        {message}
      </p>
      {onDismiss && (
        <button
          type="button"
          aria-label="بستن اطلاعیه"
          title="بستن اطلاعیه"
          onClick={onDismiss}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-2"
        >
          <CloseIcon size={18} />
        </button>
      )}
    </div>
  );
}

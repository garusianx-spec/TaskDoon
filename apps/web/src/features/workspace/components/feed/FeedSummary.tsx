'use client';

import { formatJalali } from '@taskin/jalali';
import { cn } from '@/lib/utils';
import type { TaskSquareIcon } from '@/components/icons';

/** The visitor's current Jalali date — resolved after mount, since this route is static. */
export function TodayLabel({ date }: { readonly date: string | null }) {
  return (
    <p className="text-body text-fg-tertiary numeric" suppressHydrationWarning>
      {date ? formatJalali(date, 'long') : '\u00A0'}
    </p>
  );
}

interface SummaryCardProps {
  readonly label: string;
  readonly value: string;
  readonly tone: 'brand' | 'progress' | 'blocked' | 'review';
  readonly Icon: typeof TaskSquareIcon;
}

export function SummaryCard({ label, value, tone, Icon }: SummaryCardProps) {
  const tones: Readonly<Record<SummaryCardProps['tone'], string>> = {
    brand: 'bg-brand-subtle text-fg-brand',
    progress: 'bg-status-progress-subtle text-status-progress',
    blocked: 'bg-status-blocked-subtle text-status-blocked',
    review: 'bg-status-review-subtle text-status-review',
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-secondary bg-surface p-3.5 shadow-xs">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
        <Icon size={20} variant="twotone" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-heading font-extrabold leading-tight text-fg-primary numeric">{value}</span>
        <span className="truncate text-caption text-fg-tertiary">{label}</span>
      </span>
    </div>
  );
}

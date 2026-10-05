'use client';

import { cn } from '@/lib/cn';
import { formatJalali, toPersianDigits } from '@/lib/jalali';
import type { CalendarCell } from '@/lib/jalali';
import type { DayBucket } from './day-index';
import { bucketTotal } from './day-index';
import { AddIcon } from '@/components/icons';

export interface CalendarDayCellProps {
  readonly cell: CalendarCell;
  readonly bucket: DayBucket;
  readonly selected: boolean;
  readonly onSelect: (iso: string) => void;
  /** Double-click, or the hover "+", opens the composer pre-filled with this date. */
  readonly onQuickCreate: (iso: string) => void;
}

/**
 * A single day in the month grid.
 *
 * The cell is one button so the whole surface is a single keyboard target; the quick-create
 * "+" is a nested button that stops propagation. Because a nested button cannot live inside
 * a button, the cell itself is a `div` with `role="gridcell"` semantics driven by an inner
 * pressable region — keeping both actions independently reachable by keyboard.
 */
export function CalendarDayCell({
  cell,
  bucket,
  selected,
  onSelect,
  onQuickCreate,
}: CalendarDayCellProps) {
  const total = bucketTotal(bucket);
  const isFriday = cell.weekdayIndex === 6;
  const pendingCount = bucket.pending.length + bucket.recurring.length;
  const doneCount = bucket.completed.length;
  const eventCount = bucket.entries.length;

  const summary = [
    pendingCount > 0 ? `${toPersianDigits(pendingCount)} وظیفه باز` : null,
    doneCount > 0 ? `${toPersianDigits(doneCount)} انجام‌شده` : null,
    eventCount > 0 ? `${toPersianDigits(eventCount)} رویداد` : null,
  ]
    .filter(Boolean)
    .join('، ');

  return (
    <div
      role="gridcell"
      aria-selected={selected}
      className={cn(
        'group/day relative flex min-h-16 flex-col rounded-lg border transition-colors sm:min-h-20',
        selected
          ? 'border-brand bg-brand-subtle'
          : 'border-transparent hover:border-secondary hover:bg-hover',
        !cell.inCurrentMonth && 'opacity-40',
      )}
    >
      <button
        type="button"
        aria-current={cell.isToday ? 'date' : undefined}
        aria-label={`${formatJalali(cell.iso, 'long')}${summary ? ` — ${summary}` : ' — بدون برنامه'}`}
        onClick={() => onSelect(cell.iso)}
        onDoubleClick={() => onQuickCreate(cell.iso)}
        className="flex flex-1 flex-col items-center gap-1 rounded-lg p-1.5"
      >
        <span
          className={cn(
            'numeric flex size-7 items-center justify-center rounded-full text-body-sm font-semibold',
            cell.isToday && 'bg-brand-solid text-fg-on-brand',
            !cell.isToday && isFriday && 'text-status-blocked',
            !cell.isToday && !isFriday && 'text-fg-primary',
          )}
        >
          {toPersianDigits(cell.jalali.day)}
        </span>

        {total > 0 && (
          <>
            {/* Phones: bare dots — three counted chips cannot fit a ~45px cell. */}
            <span className="flex items-center justify-center gap-1 sm:hidden" aria-hidden="true">
              {pendingCount > 0 && <span className="size-1.5 rounded-full bg-status-progress" />}
              {doneCount > 0 && <span className="size-1.5 rounded-full bg-status-done" />}
              {eventCount > 0 && <span className="size-1.5 rounded-full bg-status-review" />}
            </span>

            {/* Tablet and up: counted chips at the 11px badge size. */}
            <span
              className="hidden flex-wrap items-center justify-center gap-1 sm:flex"
              aria-hidden="true"
            >
              {pendingCount > 0 && <CountChip tone="progress" value={pendingCount} />}
              {doneCount > 0 && <CountChip tone="done" value={doneCount} />}
              {eventCount > 0 && <CountChip tone="review" value={eventCount} />}
            </span>
          </>
        )}
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onQuickCreate(cell.iso);
        }}
        aria-label={`ثبت وظیفه یا رویداد برای ${formatJalali(cell.iso, 'long')}`}
        title="ثبت وظیفه / رویداد برای این روز"
        className={cn(
          'absolute end-1 top-1 flex size-5 items-center justify-center rounded-md bg-surface text-fg-tertiary shadow-xs ring-1 ring-inset ring-black/[0.06] transition-opacity',
          'opacity-0 hover:text-fg-brand focus-visible:opacity-100 group-hover/day:opacity-100',
        )}
      >
        <AddIcon size={13} />
      </button>
    </div>
  );
}

interface CountChipProps {
  readonly tone: 'progress' | 'done' | 'review';
  readonly value: number;
}

function CountChip({ tone, value }: CountChipProps) {
  const tones = {
    progress: 'bg-status-progress-subtle text-status-progress',
    done: 'bg-status-done-subtle text-status-done',
    review: 'bg-status-review-subtle text-status-review',
  } as const;
  const dots = {
    progress: 'bg-status-progress',
    done: 'bg-status-done',
    review: 'bg-status-review',
  } as const;

  return (
    <span
      className={cn(
        'numeric inline-flex items-center gap-0.5 rounded-full px-1 text-micro font-semibold leading-4',
        tones[tone],
      )}
    >
      <span className={cn('size-1 rounded-full', dots[tone])} />
      {toPersianDigits(value)}
    </span>
  );
}

'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { JALALI_MONTHS, toPersianDigits } from '@/lib/jalali';
import { Popover } from '@/components/ui';
import { ChevronBackwardIcon, ChevronDownIcon, ChevronForwardIcon } from '@/components/icons';

export interface MonthYearPickerProps {
  readonly year: number;
  readonly month: number;
  readonly onChange: (year: number, month: number) => void;
  /** Inclusive year range offered in the year strip, relative to `year`. */
  readonly yearSpan?: number;
  readonly className?: string;
}

/**
 * Direct month/year navigation.
 *
 * Replaces chevron-only paging: the trigger opens a grid of the twelve Jalali months over a
 * scrollable year strip, so jumping to "اردیبهشت ۱۴۰۵" is two clicks rather than eleven.
 * The year strip is its own row so changing year does not close the popover — the month grid
 * re-renders underneath it.
 */
export function MonthYearPicker({
  year,
  month,
  onChange,
  yearSpan = 6,
  className,
}: MonthYearPickerProps) {
  const [draftYear, setDraftYear] = useState(year);

  const years = Array.from({ length: yearSpan * 2 + 1 }, (_, index) => year - yearSpan + index);

  return (
    <Popover
      label="انتخاب ماه و سال"
      align="start"
      panelClassName="min-w-0 p-3"
      onOpenChange={(open) => {
        // Re-seed the draft each time it opens so it always reflects the live month.
        if (open) setDraftYear(year);
      }}
      trigger={
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-hover',
            className,
          )}
        >
          <span className="numeric text-heading-sm font-bold text-fg-primary">
            {`${JALALI_MONTHS[month - 1] ?? ''} ${toPersianDigits(year)}`}
          </span>
          <ChevronDownIcon size={18} className="text-fg-quaternary" />
        </button>
      }
    >
      {(close) => (
        <div className="w-72">
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => setDraftYear((value) => value - 1)}
              aria-label="سال قبل"
              className="flex size-8 items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-hover"
            >
              <ChevronBackwardIcon size={18} />
            </button>
            <span aria-live="polite" className="numeric text-title-sm font-semibold text-fg-primary">
              {toPersianDigits(draftYear)}
            </span>
            <button
              type="button"
              onClick={() => setDraftYear((value) => value + 1)}
              aria-label="سال بعد"
              className="flex size-8 items-center justify-center rounded-lg text-fg-tertiary transition-colors hover:bg-hover"
            >
              <ChevronForwardIcon size={18} />
            </button>
          </div>

          <div
            className="no-scrollbar -mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1"
            role="radiogroup"
            aria-label="انتخاب سال"
          >
            {years.map((candidate) => (
              <button
                key={candidate}
                type="button"
                role="radio"
                aria-checked={candidate === draftYear}
                onClick={() => setDraftYear(candidate)}
                className={cn(
                  'numeric shrink-0 rounded-full border px-2.5 py-1 text-caption font-medium transition-colors',
                  candidate === draftYear
                    ? 'border-brand bg-brand-subtle text-fg-brand'
                    : 'border-secondary bg-surface text-fg-tertiary hover:bg-hover',
                )}
              >
                {toPersianDigits(candidate)}
              </button>
            ))}
          </div>

          <div role="radiogroup" aria-label="انتخاب ماه" className="grid grid-cols-3 gap-1.5">
            {JALALI_MONTHS.map((name, index) => {
              const candidateMonth = index + 1;
              const selected = draftYear === year && candidateMonth === month;
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    onChange(draftYear, candidateMonth);
                    close();
                  }}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-caption font-medium transition-colors',
                    selected
                      ? 'border-brand bg-brand-subtle text-fg-brand'
                      : 'border-transparent bg-surface text-fg-secondary hover:border-secondary hover:bg-hover',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Popover>
  );
}

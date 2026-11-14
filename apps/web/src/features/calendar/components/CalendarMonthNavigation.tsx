'use client';

import type { CalendarSystem } from '@taskin/jalali';
import { ChevronBackwardIcon, ChevronForwardIcon } from '@/components/icons';
import { Button, IconButton } from '@/components/ui';
import { CalendarDateText } from './CalendarDateText';

interface CalendarMonthNavigationProps {
  readonly system: CalendarSystem;
  readonly monthLabel: string;
  readonly onStep: (delta: -1 | 1) => void;
  readonly onToday?: () => void;
}

/** Shared RTL next/previous controls with a fixed space for both header formats. */
export function CalendarMonthNavigation({
  system,
  monthLabel,
  onStep,
  onToday,
}: CalendarMonthNavigationProps) {
  return (
    <div role="group" aria-label="پیمایش ماه" className="flex min-w-0 items-center justify-center gap-1">
      <IconButton
        className="size-11 shrink-0"
        label="ماه قبل"
        icon={<ChevronBackwardIcon size={18} />}
        onClick={() => onStep(-1)}
      />
      <span aria-live="polite" className="w-36 truncate text-center text-title-sm font-bold text-fg-primary">
        <CalendarDateText system={system}>{monthLabel}</CalendarDateText>
      </span>
      <IconButton
        className="size-11 shrink-0"
        label="ماه بعد"
        icon={<ChevronForwardIcon size={18} />}
        onClick={() => onStep(1)}
      />
      {onToday && (
        <Button size="lg" variant="secondary" onClick={onToday}>
          امروز
        </Button>
      )}
    </div>
  );
}

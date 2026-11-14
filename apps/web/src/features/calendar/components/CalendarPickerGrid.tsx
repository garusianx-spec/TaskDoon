'use client';

import { useLayoutEffect, useRef } from 'react';
import { formatCalendarDate, toPersianDigits, type CalendarSystem } from '@taskin/jalali';
import { cn } from '@/lib/utils';
import { calendarKeyboardDate, type useCalendarGrid } from '../hooks/useCalendarGrid';
import { CalendarDateText } from './CalendarDateText';

interface CalendarPickerGridProps {
  readonly system: CalendarSystem;
  readonly grid: ReturnType<typeof useCalendarGrid>;
  readonly label: string;
  readonly focusedIso: string;
  readonly value: string | null;
  readonly onNavigate: (iso: string, select: boolean) => void;
  readonly onSelect: (iso: string) => void;
}

/** Date-picker grid with one tab stop, RTL day navigation and ISO date selection. */
export function CalendarPickerGrid({
  system,
  grid,
  label,
  focusedIso,
  value,
  onNavigate,
  onSelect,
}: CalendarPickerGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const requestedFocus = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (requestedFocus.current) {
      gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
      requestedFocus.current = null;
    }
  }, [focusedIso]);

  return (
    <div ref={gridRef} role="grid" aria-label={label}>
      <div role="row" className="grid grid-cols-7">
        {grid.shortWeekdays.map((day, index) => (
          <div
            key={day}
            role="columnheader"
            aria-label={grid.weekdays[index]}
            className="flex h-8 items-center justify-center text-caption font-semibold text-fg-quaternary"
          >
            <CalendarDateText system={system}>{day}</CalendarDateText>
          </div>
        ))}
      </div>

      {grid.weeks.map((week, index) => (
        <div role="row" key={index} className="grid grid-cols-7">
          {week.map((cell) => {
            const selected = cell.iso === value;
            return (
              <button
                key={cell.iso}
                type="button"
                role="gridcell"
                aria-selected={selected}
                aria-current={cell.isToday ? 'date' : undefined}
                aria-label={formatCalendarDate(system, cell.iso, 'long')}
                data-date={cell.iso}
                tabIndex={cell.iso === focusedIso ? 0 : -1}
                onKeyDown={(event) => {
                  const next = calendarKeyboardDate(system, cell, event.key);
                  if (!next) return;
                  event.preventDefault();
                  if (next === cell.iso) return;
                  requestedFocus.current = next;
                  onNavigate(next, event.key !== 'PageUp' && event.key !== 'PageDown');
                }}
                onClick={() => onSelect(cell.iso)}
                className={cn(
                  'flex h-11 min-w-0 items-center justify-center rounded-lg text-body-sm font-medium transition-colors focus-visible:ring-inset focus-visible:ring-offset-0',
                  !cell.inCurrentMonth && 'text-fg-disabled',
                  cell.inCurrentMonth && !selected && 'text-fg-primary hover:bg-hover',
                  cell.weekdayIndex === 6 && cell.inCurrentMonth && !selected && 'text-status-blocked',
                  cell.isToday && !selected && 'ring-1 ring-inset ring-brand',
                  selected && 'bg-brand-solid text-fg-on-brand',
                )}
              >
                <CalendarDateText system={system}>
                  {system === 'jalali' ? toPersianDigits(cell.day.day) : cell.day.day}
                </CalendarDateText>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

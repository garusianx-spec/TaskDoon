'use client';

import { shiftMonthKeepingDay } from '@/lib/jalali';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { CalendarCell } from '@taskin/jalali';
import type { CalendarItem } from '@/store/selectors';
import { cn } from '@/lib/utils';
import { JALALI_WEEKDAYS, JALALI_WEEKDAYS_SHORT, addDays } from '@taskin/jalali';
import { DayCell } from '@/features/calendar/components/DayCell';

export interface MonthGridProps {
  readonly cells: readonly CalendarCell[];
  readonly itemsByDate: ReadonlyMap<string, readonly CalendarItem[]>;
  readonly today: Date;
  /** The one cell in the tab order (roving tabindex). */
  readonly focusedIso: string;
  /** Moves the roving focus; the page switches month when the date falls outside this one. */
  readonly onFocusDate: (iso: string) => void;
  readonly onCreateTask: (iso: string) => void;
  readonly onCreateEvent: (iso: string) => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly onToggleComplete: (taskId: string, completed: boolean) => void;
}

/**
 * Minimal Jalali month grid, Saturday-first. Every cell is a stretched button that opens the
 * task composer with that day as the deadline; on top of it sit at most two compact badges
 * and a "+X مورد دیگر" chip that opens the day summary. Phone widths swap badges for dots.
 *
 * Keyboard: arrows move by day/week (ArrowLeft is the next day in RTL), Home/End jump to the
 * week's edges, PageUp/PageDown change month, Enter/Space create a task on the focused day.
 */
export function MonthGrid({
  cells,
  itemsByDate,
  today,
  focusedIso,
  onFocusDate,
  onCreateTask,
  onCreateEvent,
  onOpenTask,
  onToggleComplete,
}: MonthGridProps) {
  const buttons = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [focusRequest, setFocusRequest] = useState(0);

  const weeks = useMemo(
    () => Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => cells.slice(row * 7, row * 7 + 7)),
    [cells],
  );

  // Runs after the month has re-rendered, so a keyboard move into next month lands on a
  // button that exists.
  useEffect(() => {
    if (focusRequest > 0) buttons.current.get(focusedIso)?.focus();
  }, [focusRequest, focusedIso, cells]);

  const moveTo = (iso: string) => {
    onFocusDate(iso);
    setFocusRequest((count) => count + 1);
  };

  const onCellKeyDown = (cell: CalendarCell) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const byDay: Readonly<Record<string, number>> = {
      ArrowLeft: 1,
      ArrowRight: -1,
      ArrowDown: 7,
      ArrowUp: -7,
    };
    const days = byDay[event.key];
    if (days !== undefined) {
      event.preventDefault();
      moveTo(addDays(cell.iso, days));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      moveTo(addDays(cell.iso, event.key === 'Home' ? -cell.weekdayIndex : 6 - cell.weekdayIndex));
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      moveTo(shiftMonthKeepingDay(cell.iso, event.key === 'PageDown' ? 1 : -1));
    }
  };

  return (
    <div role="grid" aria-label="تقویم ماهانه هجری شمسی" className="flex flex-col">
      <div role="row" className="grid grid-cols-7 border-b border-secondary">
        {JALALI_WEEKDAYS_SHORT.map((short, index) => (
          <div
            key={short}
            role="columnheader"
            aria-label={JALALI_WEEKDAYS[index]}
            className={cn(
              'flex h-9 items-center justify-center text-caption font-semibold',
              index === 6 ? 'text-status-blocked' : 'text-fg-quaternary',
            )}
          >
            <span className="sm:hidden" aria-hidden="true">
              {short}
            </span>
            <span className="hidden sm:inline" aria-hidden="true">
              {JALALI_WEEKDAYS[index]}
            </span>
          </div>
        ))}
      </div>

      {weeks.map((week, row) => (
        <div role="row" key={week[0]?.iso ?? row} className="grid grid-cols-7">
          {week.map((cell) => (
            <DayCell
              key={cell.iso}
              cell={cell}
              items={itemsByDate.get(cell.iso) ?? []}
              today={today}
              focusable={cell.iso === focusedIso}
              // Keep the summary popover on-screen: open upward from the bottom half, and
              // away from whichever inline edge the column sits on.
              placement={row >= 3 ? 'top' : 'bottom'}
              align={cell.weekdayIndex <= 3 ? 'start' : 'end'}
              registerButton={(node) => {
                if (node) buttons.current.set(cell.iso, node);
                else buttons.current.delete(cell.iso);
              }}
              onKeyDown={onCellKeyDown(cell)}
              onFocus={() => onFocusDate(cell.iso)}
              onCreateTask={onCreateTask}
              onCreateEvent={onCreateEvent}
              onOpenTask={onOpenTask}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

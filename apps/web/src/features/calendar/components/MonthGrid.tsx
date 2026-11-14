'use client';

import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import type { CalendarGridCell, CalendarSystem } from '@taskin/jalali';
import type { CalendarItem } from '@/store/selectors';
import { cn } from '@/lib/utils';
import { calendarKeyboardDate, type useCalendarGrid } from '../hooks/useCalendarGrid';
import { CalendarDateText } from './CalendarDateText';
import { DayCell } from '@/features/calendar/components/DayCell';

export interface MonthGridProps {
  readonly grid: ReturnType<typeof useCalendarGrid>;
  readonly system: CalendarSystem;
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
 * Month grid, Saturday-first. Every cell is a stretched button that opens the
 * task composer with that day as the deadline; on top of it sit at most two compact badges
 * and a "+X مورد دیگر" chip that opens the day summary. Phone widths swap badges for dots.
 *
 * Keyboard: arrows move by day/week (ArrowLeft is the next day in RTL), Home/End jump to the
 * week's edges, PageUp/PageDown change month, Enter/Space create a task on the focused day.
 */
export function MonthGrid({
  grid: { weeks, weekdays, shortWeekdays },
  system,
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
  const requestedFocus = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (requestedFocus.current) buttons.current.get(requestedFocus.current)?.focus();
    requestedFocus.current = null;
  }, [weeks]);

  const onCellKeyDown = (cell: CalendarGridCell) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = calendarKeyboardDate(system, cell, event.key);
    if (!next) return;
    event.preventDefault();
    if (next === cell.iso) return;
    requestedFocus.current = next;
    onFocusDate(next);
  };

  return (
    <div
      role="grid"
      aria-label={system === 'jalali' ? 'تقویم ماهانه هجری شمسی' : 'تقویم ماهانه میلادی'}
      className="flex flex-col"
    >
      <div role="row" className="grid grid-cols-7 border-b border-secondary">
        {shortWeekdays.map((short, index) => (
          <div
            key={short}
            role="columnheader"
            aria-label={weekdays[index]}
            className={cn(
              'flex h-9 items-center justify-center text-caption font-semibold',
              index === 6 ? 'text-status-blocked' : 'text-fg-quaternary',
            )}
          >
            <span className="sm:hidden" aria-hidden="true">
              <CalendarDateText system={system}>{short}</CalendarDateText>
            </span>
            <span className="hidden sm:inline" aria-hidden="true">
              <CalendarDateText system={system}>{weekdays[index]}</CalendarDateText>
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
              system={system}
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
              onSelect={onFocusDate}
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

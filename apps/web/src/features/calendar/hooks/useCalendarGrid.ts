'use client';

import { useMemo } from 'react';
import {
  addDays,
  buildCalendarGrid,
  formatCalendarDate,
  GREGORIAN_WEEKDAYS,
  GREGORIAN_WEEKDAYS_SHORT,
  JALALI_WEEKDAYS,
  JALALI_WEEKDAYS_SHORT,
  shiftCalendarMonth,
  type CalendarGridCell,
  type CalendarSystem,
} from '@taskin/jalali';

const RTL_DAY_KEYS: Readonly<Partial<Record<string, number>>> = {
  ArrowLeft: 1,
  ArrowRight: -1,
  ArrowDown: 7,
  ArrowUp: -7,
};

/** Resolves a keyboard move in the displayed calendar while keeping the result a civil date. */
export function calendarKeyboardDate(system: CalendarSystem, cell: CalendarGridCell, key: string) {
  const delta = RTL_DAY_KEYS[key];
  if (delta !== undefined) return addDays(cell.iso, delta);
  if (key === 'Home') return addDays(cell.iso, -cell.weekdayIndex);
  if (key === 'End') return addDays(cell.iso, 6 - cell.weekdayIndex);
  if (key === 'PageUp' || key === 'PageDown') {
    return shiftCalendarMonth(system, cell.iso, key === 'PageDown' ? 1 : -1);
  }
  return null;
}

/** The ISO anchor keeps the same day in view when the display calendar changes. */
export function useCalendarGrid(system: CalendarSystem, anchorIso: string, todayIso: string) {
  const weeks = useMemo(() => {
    const cells = buildCalendarGrid(system, anchorIso, todayIso);
    return Array.from({ length: 6 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  }, [system, anchorIso, todayIso]);

  return {
    weeks,
    monthLabel: formatCalendarDate(system, anchorIso, 'month-year'),
    weekdays: system === 'jalali' ? JALALI_WEEKDAYS : GREGORIAN_WEEKDAYS,
    shortWeekdays: system === 'jalali' ? JALALI_WEEKDAYS_SHORT : GREGORIAN_WEEKDAYS_SHORT,
  };
}

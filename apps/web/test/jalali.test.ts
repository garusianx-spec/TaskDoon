import { describe, expect, it } from 'vitest';
import { isoDateFromJalali, jalaliFromIsoDate, shiftMonthKeepingDay } from '@/lib/jalali';

describe('web calendar civil dates', () => {
  it.each([
    ['2024-03-19', 1402, 12, 29],
    ['2024-03-20', 1403, 1, 1],
    ['2025-03-19', 1403, 12, 29],
    ['2025-03-20', 1403, 12, 30],
    ['2025-03-21', 1404, 1, 1],
    ['2026-03-20', 1404, 12, 29],
    ['2026-03-21', 1405, 1, 1],
  ] as const)('round-trips %s across Nowruz and Esfand', (iso, year, month, day) => {
    expect(jalaliFromIsoDate(iso)).toEqual({ year, month, day });
    expect(isoDateFromJalali(year, month, day)).toBe(iso);
  });

  it('clamps Shahrivar 31 to Mehr 30 and preserves an ordinary day on the way back', () => {
    const shahrivarEnd = isoDateFromJalali(1403, 6, 31);
    const mehrEnd = shiftMonthKeepingDay(shahrivarEnd, 1);
    expect(jalaliFromIsoDate(mehrEnd)).toEqual({ year: 1403, month: 7, day: 30 });
    expect(shiftMonthKeepingDay(mehrEnd, -1)).toBe(isoDateFromJalali(1403, 6, 30));
  });

  it('clamps the last day of Bahman differently in leap and common years', () => {
    expect(shiftMonthKeepingDay(isoDateFromJalali(1403, 11, 30), 1)).toBe('2025-03-20');
    expect(shiftMonthKeepingDay(isoDateFromJalali(1404, 11, 30), 1)).toBe('2026-03-20');
  });

  it('steps across the year in both directions without changing a valid day', () => {
    const lastMonth = isoDateFromJalali(1403, 12, 12);
    const firstMonth = isoDateFromJalali(1404, 1, 12);
    expect(shiftMonthKeepingDay(lastMonth, 1)).toBe(firstMonth);
    expect(shiftMonthKeepingDay(firstMonth, -1)).toBe(lastMonth);
  });
});

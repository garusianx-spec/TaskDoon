import type { RecurrenceEnd, RecurrenceFrequency, TaskRecurrence } from '@/types';
import {
  addDays,
  gregorianToJalali,
  jalaliMonthLength,
  jalaliToGregorian,
  parseISODate,
  toISODate,
  toPersianDigits,
  formatJalali,
} from './jalali';

/**
 * Recurrence engine, expressed in the Jalali calendar.
 *
 * Monthly and yearly steps advance the *Jalali* month/year rather than the Gregorian one, so
 * "هر ماه" on ۳۱ فروردین lands on ۳۱ اردیبهشت — not on a Gregorian month boundary that would
 * drift across Persian months. A day that does not exist in the target month (۳۱ in a 30-day
 * month, or ۳۰ اسفند in a common year) clamps to that month's last day, which is the same
 * rule the Iranian civil calendar uses for anniversaries.
 */

export const RECURRENCE_FREQUENCIES: ReadonlyArray<{
  readonly id: RecurrenceFrequency;
  readonly label: string;
  /** Singular unit used when the interval is 1, e.g. "هر روز". */
  readonly unit: string;
}> = [
  { id: 'daily', label: 'روزانه', unit: 'روز' },
  { id: 'weekly', label: 'هفتگی', unit: 'هفته' },
  { id: 'monthly', label: 'ماهانه', unit: 'ماه' },
  { id: 'yearly', label: 'سالانه', unit: 'سال' },
];

export const DEFAULT_RECURRENCE: TaskRecurrence = {
  frequency: 'weekly',
  interval: 1,
  end: { kind: 'never' },
};

const frequencyUnit = (frequency: RecurrenceFrequency): string =>
  RECURRENCE_FREQUENCIES.find((entry) => entry.id === frequency)?.unit ?? '';

/** Advances one step of the series from `iso`, clamping to the target month's length. */
export function stepOccurrence(iso: string, recurrence: TaskRecurrence): string {
  const interval = Math.max(1, Math.trunc(recurrence.interval));

  switch (recurrence.frequency) {
    case 'daily':
      return addDays(iso, interval);
    case 'weekly':
      return addDays(iso, interval * 7);
    case 'monthly':
    case 'yearly': {
      const { year, month, day } = gregorianToJalali(parseISODate(iso));
      const monthsAhead = recurrence.frequency === 'yearly' ? interval * 12 : interval;
      const zeroBased = month - 1 + monthsAhead;
      const targetYear = year + Math.floor(zeroBased / 12);
      const targetMonth = (((zeroBased % 12) + 12) % 12) + 1;
      const clampedDay = Math.min(day, jalaliMonthLength(targetYear, targetMonth));
      return toISODate(jalaliToGregorian(targetYear, targetMonth, clampedDay));
    }
    default: {
      const exhaustive: never = recurrence.frequency;
      return exhaustive;
    }
  }
}

/** Hard ceiling so a `never`-ending series can never spin forever. */
const MAX_OCCURRENCES = 500;

/**
 * Expands the series starting at `startIso`, stopping at the termination rule or when the
 * generated date passes `untilIso` (exclusive upper bound for calendar windows).
 */
export function expandOccurrences(
  startIso: string,
  recurrence: TaskRecurrence | null,
  untilIso: string,
): readonly string[] {
  if (!recurrence) return [startIso];

  const until = parseISODate(untilIso).getTime();
  const out: string[] = [];
  let cursor = startIso;

  for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
    if (parseISODate(cursor).getTime() > until) break;
    if (recurrence.end.kind === 'on-date' && cursor > recurrence.end.date) break;
    if (recurrence.end.kind === 'after-count' && index >= Math.max(1, recurrence.end.count)) break;

    out.push(cursor);
    cursor = stepOccurrence(cursor, recurrence);
  }

  return out;
}

/** The next date in the series strictly after `fromIso`, or null once the series has ended. */
export function nextOccurrenceAfter(
  startIso: string,
  recurrence: TaskRecurrence | null,
  fromIso: string,
): string | null {
  if (!recurrence) return null;

  let cursor = startIso;
  for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
    if (recurrence.end.kind === 'on-date' && cursor > recurrence.end.date) return null;
    if (recurrence.end.kind === 'after-count' && index >= Math.max(1, recurrence.end.count)) {
      return null;
    }
    if (cursor > fromIso) return cursor;
    cursor = stepOccurrence(cursor, recurrence);
  }
  return null;
}

/** "هر هفته" / "هر ۲ هفته یک‌بار" — the short form used on badges. */
export function describeRecurrence(recurrence: TaskRecurrence): string {
  const interval = Math.max(1, Math.trunc(recurrence.interval));
  const unit = frequencyUnit(recurrence.frequency);
  return interval === 1 ? `هر ${unit}` : `هر ${toPersianDigits(interval)} ${unit} یک‌بار`;
}

/** "پایان در ۵ مهر ۱۴۰۵" / "۱۰ بار" / "بدون پایان" — the termination rule in words. */
export function describeRecurrenceEnd(end: RecurrenceEnd): string {
  switch (end.kind) {
    case 'never':
      return 'بدون پایان';
    case 'on-date':
      return `تا ${formatJalali(end.date, 'medium')}`;
    case 'after-count':
      return `${toPersianDigits(Math.max(1, end.count))} بار`;
    default: {
      const exhaustive: never = end;
      return exhaustive;
    }
  }
}

/** Full sentence for tooltips and the inspector summary. */
export function describeRecurrenceFull(recurrence: TaskRecurrence): string {
  const base = describeRecurrence(recurrence);
  return recurrence.end.kind === 'never'
    ? base
    : `${base}، ${describeRecurrenceEnd(recurrence.end)}`;
}

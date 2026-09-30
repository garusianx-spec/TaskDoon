import type { WeekDay } from '@taskin/contracts';
import { addDays, dateIn, timeIn } from '../../platform/clock/clock.js';

/** In the order the week starts in Iran. */
export const WEEK_DAYS: readonly WeekDay[] = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

/** `Date#getUTCDay()` order: 0 is Sunday. */
const BY_UTC_DAY: readonly WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export const HH_MM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export interface WorkingHours {
  readonly days: readonly WeekDay[];
  /** `HH:mm`; an end before the start is a shift that runs past midnight. */
  readonly start: string;
  readonly end: string;
}

/** What a member who never saved their hours has: Saturday to Wednesday, nine to six, auto-reply off. */
export const DEFAULT_WORKING_HOURS: WorkingHours & { readonly message: string } = {
  days: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday'],
  start: '09:00',
  end: '18:00',
  message: 'سلام، در حال حاضر خارج از ساعت کاری هستم و در اولین فرصت پاسخ می‌دهم.',
};

/** The weekday of a `YYYY-MM-DD` calendar date. */
export function weekDayOf(isoDate: string): WeekDay {
  return BY_UTC_DAY[new Date(`${isoDate}T00:00:00Z`).getUTCDay()] as WeekDay;
}

/**
 * Whether `at` falls inside the working hours, on the wall clock of `timeZone`. A window that runs
 * past midnight belongs to the day it starts on: with Saturday 22:00–06:00, Sunday 02:00 is work.
 */
export function isWorkingTime(hours: WorkingHours, timeZone: string, at: Date): boolean {
  const today = dateIn(timeZone, at);
  const now = timeIn(timeZone, at);
  if (hours.start < hours.end) return hours.days.includes(weekDayOf(today)) && now >= hours.start && now < hours.end;
  if (now >= hours.start) return hours.days.includes(weekDayOf(today));
  if (now < hours.end) return hours.days.includes(weekDayOf(addDays(today, -1)));
  return false;
}

import { fromISODate, gregorianToJalali, jalaliMonthLength, jalaliToGregorian, shiftJalaliMonth, toISODate } from '@taskin/jalali';

/** A civil Gregorian date from the API, converted without shifting through UTC. */
export function jalaliFromIsoDate(iso: string) {
  return gregorianToJalali(fromISODate(iso));
}

export function isoDateFromJalali(year: number, month: number, day: number): string {
  return toISODate(jalaliToGregorian(year, month, day));
}

/** Step the calendar focus by a month, clamping to the last day when needed. */
export function shiftMonthKeepingDay(iso: string, delta: number): string {
  const { year, month, day } = jalaliFromIsoDate(iso);
  const target = shiftJalaliMonth(year, month, delta);
  const clamped = Math.min(day, jalaliMonthLength(target.year, target.month));
  return isoDateFromJalali(target.year, target.month, clamped);
}

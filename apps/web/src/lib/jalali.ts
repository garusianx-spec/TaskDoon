import { fromISODate,gregorianToJalali } from '@taskin/jalali';

/** A civil Gregorian date from the API, converted without shifting through UTC. */
export function jalaliFromIsoDate(iso: string) {
  return gregorianToJalali(fromISODate(iso));
}

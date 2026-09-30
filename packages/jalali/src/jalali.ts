/**
 * Jalali (Solar Hijri) calendar engine.
 *
 * Implements the arithmetic conversion used by the Iranian civil calendar (the 33-year
 * leap cycle / Birashk-corrected algorithm popularised by `jalaali-js`). Accurate for the
 * full 1178–1633 Jalali range, which covers every date this product can produce.
 *
 * Nothing here touches `Intl` for conversion — `Intl.DateTimeFormat('fa-IR')` is only used
 * as a cross-check in tests, never at runtime, so output is identical on every platform and
 * in every Node/browser ICU build.
 */

export interface JalaliDate {
  readonly year: number;
  readonly month: number; // 1–12
  readonly day: number; // 1–31
}

export const JALALI_MONTHS: readonly string[] = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

/** Saturday-first, matching the Iranian week. */
export const JALALI_WEEKDAYS: readonly string[] = [
  'شنبه',
  'یک‌شنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
];

export const JALALI_WEEKDAYS_SHORT: readonly string[] = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

const div = (a: number, b: number): number => Math.trunc(a / b);
const mod = (a: number, b: number): number => a - Math.trunc(a / b) * b;

interface LeapResult {
  readonly leap: number;
  readonly gy: number;
  readonly march: number;
}

/**
 * Determines how far into the 33-year cycle `jy` sits, the matching Gregorian year, and the
 * March day on which 1 Farvardin falls.
 */
function jalCal(jy: number): LeapResult {
  /** Year boundaries of the 33-year leap cycle corrections. */
  const breaks: readonly number[] = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 1701, 1866, 2020, 2450,
  ];

  const gy = jy + 621;
  let leapJ = -14;
  const first = breaks[0];
  const last = breaks[breaks.length - 1];
  if (first === undefined || last === undefined || jy < first || jy >= last) {
    throw new RangeError(`Jalali year ${jy} is outside the supported range.`);
  }
  let jp = first;

  let jump = 0;
  for (let i = 1; i < breaks.length; i += 1) {
    const jm = breaks[i];
    if (jm === undefined) break;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

/** Gregorian calendar date -> Julian Day Number. */
function gregorianToJdn(gy: number, gm: number, gd: number): number {
  const d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

/** Julian Day Number -> Gregorian calendar date. */
function jdnToGregorian(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

export function isJalaliLeapYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

/** Days in a given Jalali month (1-indexed). */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

export function gregorianToJalali(date: Date): JalaliDate {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();
  const { gy: cy, march, leap } = jalCal(gy - 621);
  const jdn1f = gregorianToJdn(cy, 3, march);
  const jdn = gregorianToJdn(gy, gm, gd);
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      // Farvardin–Shahrivar: six 31-day months.
      return { year: gy - 621, month: 1 + div(k, 31), day: mod(k, 31) + 1 };
    }
    k -= 186;
    return { year: gy - 621, month: 7 + div(k, 30), day: mod(k, 30) + 1 };
  }

  // Before Nowruz: the date belongs to the previous Jalali year. `leap` here is the leap
  // flag of the CURRENT jy (gy - 621), which is what shifts the 179-day offset.
  k += 179;
  if (leap === 1) k += 1;
  return { year: gy - 622, month: 7 + div(k, 30), day: mod(k, 30) + 1 };
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const { gy: cy, march } = jalCal(jy);
  const offset = jm <= 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186;
  const jdn = gregorianToJdn(cy, 3, march) + offset + jd - 1;
  const { gy, gm, gd } = jdnToGregorian(jdn);
  return new Date(gy, gm - 1, gd);
}

/* ============================== Formatting ============================== */

/** Converts ASCII digits to Persian digits. Non-digits pass through untouched. */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

export function parseISODate(iso: string): Date {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError(`Invalid ISO date: ${iso}`);
  }
  return parsed;
}

export type JalaliFormat = 'short' | 'medium' | 'long' | 'full' | 'day-month' | 'month-year';

/**
 * Renders an ISO timestamp as a Jalali string in Persian digits.
 * `short`      -> ۱۴۰۴/۰۷/۰۱
 * `day-month`  -> ۱ مهر
 * `medium`     -> ۱ مهر ۱۴۰۴
 * `long`       -> سه‌شنبه، ۱ مهر ۱۴۰۴
 * `full`       -> سه‌شنبه، ۱ مهر ۱۴۰۴ ساعت ۰۹:۳۰
 * `month-year` -> مهر ۱۴۰۴
 */
export function formatJalali(iso: string | Date, format: JalaliFormat = 'medium'): string {
  const date = iso instanceof Date ? iso : parseISODate(iso);
  const { year, month, day } = gregorianToJalali(date);
  const monthName = JALALI_MONTHS[month - 1] ?? '';
  const weekday = JALALI_WEEKDAYS[jalaliWeekdayIndex(date)] ?? '';

  switch (format) {
    case 'short':
      return toPersianDigits(
        `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`,
      );
    case 'day-month':
      return `${toPersianDigits(day)} ${monthName}`;
    case 'medium':
      return `${toPersianDigits(day)} ${monthName} ${toPersianDigits(year)}`;
    case 'long':
      return `${weekday}، ${toPersianDigits(day)} ${monthName} ${toPersianDigits(year)}`;
    case 'full':
      return `${weekday}، ${toPersianDigits(day)} ${monthName} ${toPersianDigits(year)} ساعت ${formatTime(date)}`;
    case 'month-year':
      return `${monthName} ${toPersianDigits(year)}`;
    default: {
      const exhaustive: never = format;
      return exhaustive;
    }
  }
}

/** 0 = شنبه … 6 = جمعه */
export function jalaliWeekdayIndex(date: Date): number {
  return (date.getDay() + 1) % 7;
}

export function formatTime(iso: string | Date): string {
  const date = iso instanceof Date ? iso : parseISODate(iso);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return toPersianDigits(`${hours}:${minutes}`);
}

/** mm:ss for audio durations. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return toPersianDigits(`${minutes}:${String(seconds).padStart(2, '0')}`);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

export function isSameJalaliDay(a: Date, b: Date): boolean {
  return daysBetween(a, b) === 0;
}

/** Chat date dividers: امروز / دیروز / weekday within the week / full Jalali date. */
export function formatDateDivider(iso: string | Date, now: Date = new Date()): string {
  const date = iso instanceof Date ? iso : parseISODate(iso);
  const delta = daysBetween(date, now);
  if (delta === 0) return 'امروز';
  if (delta === 1) return 'دیروز';
  if (delta > 1 && delta < 7) return JALALI_WEEKDAYS[jalaliWeekdayIndex(date)] ?? '';
  return formatJalali(date, 'medium');
}

/** Relative phrasing for feeds and chat list timestamps. */
export function formatRelative(iso: string | Date, now: Date = new Date()): string {
  const date = iso instanceof Date ? iso : parseISODate(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);

  if (diffMin < 1) return 'هم‌اکنون';
  if (diffMin < 60) return `${toPersianDigits(diffMin)} دقیقه پیش`;

  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24 && daysBetween(date, now) === 0) {
    return `${toPersianDigits(diffHours)} ساعت پیش`;
  }

  const diffDays = daysBetween(date, now);
  if (diffDays === 1) return 'دیروز';
  if (diffDays < 7) return `${toPersianDigits(diffDays)} روز پیش`;
  return formatJalali(date, 'day-month');
}

/** Deadline pill copy: overdue, today, tomorrow, "N روز مانده", or an absolute date. */
export interface DeadlineLabel {
  readonly text: string;
  readonly tone: 'done' | 'progress' | 'blocked' | 'todo';
}

export function describeDeadline(
  iso: string,
  now: Date = new Date(),
  completed = false,
): DeadlineLabel {
  const date = parseISODate(iso);
  const delta = daysBetween(now, date);

  if (completed) return { text: formatJalali(date, 'day-month'), tone: 'done' };
  if (delta < 0) return { text: `${toPersianDigits(Math.abs(delta))} روز تأخیر`, tone: 'blocked' };
  if (delta === 0) return { text: 'امروز', tone: 'blocked' };
  if (delta === 1) return { text: 'فردا', tone: 'progress' };
  if (delta <= 7) return { text: `${toPersianDigits(delta)} روز مانده`, tone: 'progress' };
  return { text: formatJalali(date, 'day-month'), tone: 'todo' };
}

/* ============================== Month grid ============================== */

export interface CalendarCell {
  readonly iso: string;
  readonly jalali: JalaliDate;
  readonly inCurrentMonth: boolean;
  readonly isToday: boolean;
  readonly weekdayIndex: number;
}

/**
 * Builds a 6×7 Jalali month grid, Saturday-first, padded with the neighbouring months so
 * the grid is always rectangular.
 */
export function buildMonthGrid(jy: number, jm: number, today: Date = new Date()): CalendarCell[] {
  const firstOfMonth = jalaliToGregorian(jy, jm, 1);
  const leadingBlanks = jalaliWeekdayIndex(firstOfMonth);
  const cells: CalendarCell[] = [];
  const total = 42;

  for (let i = 0; i < total; i += 1) {
    const cursor = new Date(firstOfMonth);
    cursor.setDate(cursor.getDate() + (i - leadingBlanks));
    const jalali = gregorianToJalali(cursor);
    cells.push({
      iso: toISODate(cursor),
      jalali,
      inCurrentMonth: jalali.month === jm && jalali.year === jy,
      isToday: isSameJalaliDay(cursor, today),
      weekdayIndex: jalaliWeekdayIndex(cursor),
    });
  }
  return cells;
}

/** Local-timezone-safe `YYYY-MM-DD` (never shifts a day the way `toISOString` can). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses a `YYYY-MM-DD` date as *local* midnight. `new Date('2025-03-21')` is UTC midnight,
 * which is still the previous day anywhere west of Greenwich.
 */
export function fromISODate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(`Invalid ISO date: ${iso}`);
  }
  return new Date(year, month - 1, day);
}

export function addDays(iso: string, days: number): string {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Step a Jalali year/month pair, rolling the year over at the boundaries. */
export function shiftJalaliMonth(jy: number, jm: number, delta: number): JalaliDate {
  const zeroBased = jm - 1 + delta;
  const year = jy + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12 + 1;
  return { year, month, day: 1 };
}

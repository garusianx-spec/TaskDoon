import type { ReminderOffsetId, TaskReminder } from '@/types';
import { formatJalali, formatTime, parseISODate, toPersianDigits } from './jalali';

/**
 * Reminder scheduling.
 *
 * Preset offsets are stored as an offset, not as a materialised instant, so moving a task's
 * deadline moves its reminder with it. Only "زمان دلخواه" pins an absolute instant.
 */

export const REMINDER_OFFSETS: ReadonlyArray<{
  readonly id: ReminderOffsetId;
  readonly label: string;
  /** Minutes before the due date. `null` for the custom instant. */
  readonly minutesBefore: number | null;
}> = [
  { id: '15m', label: '۱۵ دقیقه قبل', minutesBefore: 15 },
  { id: '30m', label: '۳۰ دقیقه قبل', minutesBefore: 30 },
  { id: '1h', label: '۱ ساعت قبل', minutesBefore: 60 },
  { id: '1d', label: '۱ روز قبل', minutesBefore: 60 * 24 },
  { id: 'custom', label: 'زمان دلخواه شمسی', minutesBefore: null },
];

export const DEFAULT_REMINDER: TaskReminder = { offset: '1d', customAt: null };

/** Due dates are date-only; a reminder counts back from the end of the working day. */
const DUE_HOUR = 18;

/**
 * Resolves the reminder to a concrete instant. Returns null when the reminder is custom but
 * no instant has been chosen yet, which is the state while the picker is still open.
 */
export function resolveReminderInstant(dueDateIso: string, reminder: TaskReminder): Date | null {
  if (reminder.offset === 'custom') {
    return reminder.customAt ? parseISODate(reminder.customAt) : null;
  }

  const minutes = REMINDER_OFFSETS.find((entry) => entry.id === reminder.offset)?.minutesBefore;
  if (minutes === undefined || minutes === null) return null;

  const due = parseISODate(dueDateIso);
  due.setHours(DUE_HOUR, 0, 0, 0);
  return new Date(due.getTime() - minutes * 60_000);
}

/** Short label for the badge on a task card: "۱ روز قبل" or the custom Jalali date. */
export function describeReminder(reminder: TaskReminder): string {
  if (reminder.offset !== 'custom') {
    return REMINDER_OFFSETS.find((entry) => entry.id === reminder.offset)?.label ?? '';
  }
  return reminder.customAt ? formatJalali(reminder.customAt, 'day-month') : 'زمان دلخواه';
}

/** Full sentence for tooltips: "یادآوری ۱ روز قبل — ۳۰ شهریور ۱۴۰۵ ساعت ۱۸:۰۰". */
export function describeReminderFull(dueDateIso: string, reminder: TaskReminder): string {
  const instant = resolveReminderInstant(dueDateIso, reminder);
  const label = describeReminder(reminder);
  if (!instant) return `یادآوری: ${label}`;
  return `یادآوری ${label} — ${formatJalali(instant, 'medium')} ساعت ${formatTime(instant)}`;
}

/** True once the reminder instant has passed, used to dim the indicator. */
export function isReminderElapsed(
  dueDateIso: string,
  reminder: TaskReminder,
  now: Date,
): boolean {
  const instant = resolveReminderInstant(dueDateIso, reminder);
  return instant !== null && instant.getTime() < now.getTime();
}

/** `YYYY-MM-DDTHH:mm` for the custom-time input, in local time (never UTC-shifted). */
export function toLocalDateTimeValue(iso: string): string {
  const date = parseISODate(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Combines a date-only ISO string with an `HH:mm` clock time into a full instant. */
export function combineDateAndTime(dateIso: string, time: string): string {
  const [hours = '9', minutes = '0'] = time.split(':');
  const date = parseISODate(dateIso);
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date.toISOString();
}

/** `۰۹:۳۰` in Persian digits, for the custom-time summary. */
export function formatClock(hours: number, minutes: number): string {
  return toPersianDigits(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
}

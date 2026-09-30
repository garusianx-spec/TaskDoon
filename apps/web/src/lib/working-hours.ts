import type { WorkDay, WorkingHours } from '@taskin/contracts';

/** The week as it starts in Iran, with the labels the settings show. */
export const WORK_DAYS: readonly { readonly id: WorkDay; readonly label: string }[] = [
  { id: 'saturday', label: 'شنبه' },
  { id: 'sunday', label: 'یکشنبه' },
  { id: 'monday', label: 'دوشنبه' },
  { id: 'tuesday', label: 'سه‌شنبه' },
  { id: 'wednesday', label: 'چهارشنبه' },
  { id: 'thursday', label: 'پنجشنبه' },
  { id: 'friday', label: 'جمعه' },
];

/** `Date#getDay()` order: 0 is Sunday. */
const BY_DAY: readonly WorkDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** What a member has before saving their own (the API's defaults too). */
export const DEFAULT_WORKING_HOURS: WorkingHours = {
  autoReplyEnabled: false,
  days: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday'],
  start: '09:00',
  end: '18:00',
  message: 'سلام، در حال حاضر خارج از ساعت کاری هستم و در اولین فرصت پاسخ می‌دهم.',
};

/** An auto-reply answers each person at most once in this window. */
export const AUTO_REPLY_WINDOW_MS = 24 * 3600 * 1000;

const hhmm = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/**
 * Whether `at` (on this device's clock) falls inside the working hours, as the API decides it in
 * the workspace's zone: the start counts, the end does not, and a window past midnight belongs to
 * the day it starts on. The demo answers with it; the live app shows it as a hint.
 */
export function isWorkingTime(hours: Pick<WorkingHours, 'days' | 'start' | 'end'>, at: Date): boolean {
  const now = hhmm(at);
  const today = BY_DAY[at.getDay()] as WorkDay;
  if (hours.start < hours.end) return hours.days.includes(today) && now >= hours.start && now < hours.end;
  if (now >= hours.start) return hours.days.includes(today);
  if (now < hours.end) return hours.days.includes(BY_DAY[(at.getDay() + 6) % 7] as WorkDay);
  return false;
}

import { toPersianDigits } from '@taskin/jalali';
import { toLatinDigits } from '@taskin/text';

/** One logged stretch is at most a day (the API's limit); estimates may run longer. */
export const MAX_WORKLOG_MINUTES = 1440;
export const MAX_ESTIMATE_MINUTES = 60000;

const HOURS = /^(h|hr|hrs|hour|hours|س|ساعت)$/;
const MINUTES = /^(m|min|mins|minute|minutes|د|دقیقه)$/;

/**
 * Minutes from what people type: `90`, `1h 30m`, `1.5h`, `1:30`, `۱ ساعت و ۳۰ دقیقه`, `2h`,
 * `45m`. Persian and Arabic digits are accepted. `null` when the text is not a duration or the
 * result is not at least one minute.
 */
export function parseDuration(input: string): number | null {
  const text = toLatinDigits(input).trim().toLowerCase().replace(/[٫,]/g, '.');
  if (!text) return null;
  if (/^\d+$/.test(text)) return positive(Number(text));
  const clock = /^(\d+):([0-5]?\d)$/.exec(text);
  if (clock) return positive(Number(clock[1]) * 60 + Number(clock[2]));

  let total = 0;
  let matched = false;
  // Number-unit pairs, optionally joined by «و» or spaces: `1h 30m`, `۱ ساعت و ۳۰ دقیقه`.
  const rest = text.replace(/(\d+(?:\.\d+)?)\s*([a-z؀-ۿ]+)/g, (whole, amount: string, unit: string) => {
    const value = Number(amount);
    if (HOURS.test(unit)) total += value * 60;
    else if (MINUTES.test(unit)) total += value;
    else return whole;
    matched = true;
    return ' ';
  });
  if (!matched || rest.replace(/\s|و/g, '') !== '') return null;
  return positive(total);
}

function positive(minutes: number): number | null {
  const rounded = Math.round(minutes);
  return Number.isFinite(rounded) && rounded >= 1 ? rounded : null;
}

/** `۱ ساعت و ۳۰ دقیقه`, `۴۵ دقیقه`, `۲ ساعت`; zero is `۰ دقیقه`. */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${toPersianDigits(rest)} دقیقه`;
  if (rest === 0) return `${toPersianDigits(hours)} ساعت`;
  return `${toPersianDigits(hours)} ساعت و ${toPersianDigits(rest)} دقیقه`;
}

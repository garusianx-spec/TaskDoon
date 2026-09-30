import { toPersianDigits } from '@taskin/jalali';

const FILE_UNITS = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'] as const;

/** Human file size in Persian digits — `۲٫۴ مگابایت`. */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return `${toPersianDigits(0)} ${FILE_UNITS[0]}`;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), FILE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const unit = FILE_UNITS[exponent] ?? FILE_UNITS[0];
  const rounded = exponent === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  // U+066B is the Persian decimal separator.
  return `${toPersianDigits(String(rounded).replace('.', '٫'))} ${unit}`;
}

/** `۳/۵` style progress counters, written right-to-left safe. */
export function formatFraction(done: number, total: number): string {
  return `${toPersianDigits(done)}/${toPersianDigits(total)}`;
}

/** Caps a badge count the way notification bells do. */
export function formatCount(value: number, max = 99): string {
  return value > max ? `+${toPersianDigits(max)}` : toPersianDigits(value);
}

export function formatPercent(value: number): string {
  return `${toPersianDigits(Math.round(value))}٪`;
}

/** Collapses whitespace and truncates on a word boundary, appending an ellipsis. */
export function truncate(text: string, maxChars: number): string {
  const normalised = text.replace(/\s+/g, ' ').trim();
  if (normalised.length <= maxChars) return normalised;
  const slice = normalised.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

/** Stable pseudo-random in [0,1) from a string — keeps mock visuals identical across renders. */
export function seededUnit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

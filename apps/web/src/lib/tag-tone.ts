import type { TagTone } from '@taskin/contracts';

/**
 * Class lookups for tag tones. Spelled out in full (never built from template strings) so
 * Tailwind's content scanner sees every class it has to emit.
 */
export const TAG_DOT: Readonly<Record<TagTone, string>> = {
  gray: 'bg-tag-gray',
  blue: 'bg-tag-blue',
  teal: 'bg-tag-teal',
  green: 'bg-tag-green',
  amber: 'bg-tag-amber',
  red: 'bg-tag-red',
  pink: 'bg-tag-pink',
  violet: 'bg-tag-violet',
};

/** Soft badge: tinted fill, AA-contrast ink and a matching hairline. */
export const TAG_SOFT: Readonly<Record<TagTone, string>> = {
  gray: 'bg-tag-gray-subtle text-tag-gray-ink border-tag-gray-line',
  blue: 'bg-tag-blue-subtle text-tag-blue-ink border-tag-blue-line',
  teal: 'bg-tag-teal-subtle text-tag-teal-ink border-tag-teal-line',
  green: 'bg-tag-green-subtle text-tag-green-ink border-tag-green-line',
  amber: 'bg-tag-amber-subtle text-tag-amber-ink border-tag-amber-line',
  red: 'bg-tag-red-subtle text-tag-red-ink border-tag-red-line',
  pink: 'bg-tag-pink-subtle text-tag-pink-ink border-tag-pink-line',
  violet: 'bg-tag-violet-subtle text-tag-violet-ink border-tag-violet-line',
};

/** Top accent stripe for custom Kanban columns. */
export const TAG_STRIPE: Readonly<Record<TagTone, string>> = {
  gray: 'border-t-tag-gray',
  blue: 'border-t-tag-blue',
  teal: 'border-t-tag-teal',
  green: 'border-t-tag-green',
  amber: 'border-t-tag-amber',
  red: 'border-t-tag-red',
  pink: 'border-t-tag-pink',
  violet: 'border-t-tag-violet',
};

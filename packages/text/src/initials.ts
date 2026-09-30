/**
 * Two-letter monogram for a name: the first letter of each of the first two words, or the
 * first two letters of a single word. Splits on grapheme-safe code points, so Persian letters
 * and emoji are never cut in half; Latin initials are upper-cased.
 */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return '؟';
  const letters =
    words.length === 1 ? Array.from(first).slice(0, 2) : [Array.from(first)[0] ?? '', Array.from(words[1] ?? '')[0] ?? ''];
  return letters.join('').toLocaleUpperCase('en');
}

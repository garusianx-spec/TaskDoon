import { toLatinDigits } from './contact.js';

/** Arabic code points Persian writers produce by accident, mapped to the Persian letters they mean. */
const ARABIC_TO_PERSIAN: Readonly<Record<string, string>> = {
  'ي': 'ی', // U+064A Arabic yeh
  'ى': 'ی', // U+0649 alef maksura
  'ك': 'ک', // U+0643 Arabic kaf
  'ۀ': 'ه', // U+06C0 heh with yeh above
  'ة': 'ه', // U+0629 teh marbuta
};

/** Harakat, tanwin, shadda, sukun, superscript alef, and tatweel (kashida). */
const DIACRITICS = /[ً-ٰٟـ]/g;
/** ZWNJ, ZWJ, zero-width space, word joiner and the bidi marks: word-internal glue. */
const INVISIBLE_GLUE = /[​-‏⁠﻿‪-‮⁦-⁩]/g;

/**
 * The one normaliser for Persian search (RFC §6 conventions): the same text is written to
 * `search_text` columns and applied to every query, so «كتاب», «کتاب» and «کتـــاب» all match,
 * «می‌روم» matches «می روم», and «۱۴۰۳» matches «1403». Latin text is lower-cased.
 */
export function normaliseForSearch(input: string): string {
  return toLatinDigits(input.normalize('NFC'))
    .replace(/[يىكۀة]/g, (char) => ARABIC_TO_PERSIAN[char] ?? char)
    .replace(DIACRITICS, '')
    .replace(INVISIBLE_GLUE, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** `value` escaped for use inside a SQL `LIKE` pattern (backslash is the escape character). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

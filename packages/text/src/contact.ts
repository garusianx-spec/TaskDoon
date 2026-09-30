import type { InvitationChannel, InvitationRecipient } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/**
 * An Iranian mobile number: `9` plus nine digits, optionally led by the trunk `0` or the
 * country code in any of its written forms (`+98`, `0098`, `98`).
 */
const IRAN_MOBILE = /^(?:\+98|0098|98|0)?(9\d{9})$/;
/** Characters people type inside a phone number that carry no digits. */
const PHONE_PUNCTUATION = /[\s\-().‌‎‏]/g;
/** Everything a phone number can contain while it is being typed. */
const PHONE_LIKE = /^[+\d\s\-().۰-۹٠-٩]+$/;

/** Persian (۰–۹) and Arabic-Indic (٠–٩) digits to ASCII. */
export function toLatinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** The canonical `09xxxxxxxxx` form of an Iranian mobile number, or `null` when it is not one. */
export function normaliseIranMobile(raw: string): string | null {
  const match = IRAN_MOBILE.exec(toLatinDigits(raw).replace(PHONE_PUNCTUATION, ''));
  return match?.[1] ? `0${match[1]}` : null;
}

/** True while the text could still become a phone number, so a typed space must not split it. */
export function looksLikePhone(raw: string): boolean {
  return raw.trim() !== '' && PHONE_LIKE.test(raw);
}

export type RecipientParse =
  | { readonly ok: true; readonly recipient: InvitationRecipient }
  | { readonly ok: false; readonly reason: string };

/** Classifies one token as an email or an Iranian mobile number and normalises it. */
export function parseRecipient(raw: string): RecipientParse {
  const token = raw.trim();
  const mobile = normaliseIranMobile(token);
  if (mobile) return { ok: true, recipient: { address: mobile, channel: 'sms' } };

  const email = toLatinDigits(token).toLowerCase();
  if (EMAIL_PATTERN.test(email)) return { ok: true, recipient: { address: email, channel: 'email' } };

  if (looksLikePhone(token)) {
    return { ok: false, reason: 'شماره موبایل معتبری نیست؛ ۱۱ رقم و با ۰۹ آغاز می‌شود.' };
  }
  if (token.includes('@')) return { ok: false, reason: 'نشانی ایمیل معتبری نیست.' };
  return { ok: false, reason: 'نه ایمیل معتبر است و نه شماره موبایل.' };
}

/**
 * Splits pasted or typed text into recipient tokens. Commas, semicolons (Latin and Persian)
 * and line breaks always separate. Whitespace separates too, except between the groups of a
 * phone number written as `0912 123 4567` or `+98 912 123 4567`: consecutive numeric groups
 * are joined until they form a complete mobile number.
 */
export function splitRecipients(raw: string): readonly string[] {
  const tokens: string[] = [];
  for (const chunk of raw.split(/[,،;؛\n\r]+/)) {
    let phone = '';
    for (const part of chunk.split(/\s+/).filter(Boolean)) {
      if (looksLikePhone(part)) {
        phone = phone ? `${phone} ${part}` : part;
        if (normaliseIranMobile(phone)) {
          tokens.push(phone);
          phone = '';
        }
        continue;
      }
      if (phone) tokens.push(phone);
      phone = '';
      tokens.push(part);
    }
    if (phone) tokens.push(phone);
  }
  return tokens;
}

/** `09121234567` → `۰۹۱۲ ۱۲۳ ۴۵۶۷`, grouped the way Iranians read numbers aloud. */
export function formatMobile(mobile: string): string {
  const grouped = mobile.length === 11 ? `${mobile.slice(0, 4)} ${mobile.slice(4, 7)} ${mobile.slice(7)}` : mobile;
  return toPersianDigits(grouped);
}

export function formatRecipient(recipient: Pick<InvitationRecipient, 'address' | 'channel'>): string {
  return recipient.channel === 'sms' ? formatMobile(recipient.address) : recipient.address;
}

export const CHANNEL_LABELS: Readonly<Record<InvitationChannel, string>> = {
  email: 'ایمیل',
  sms: 'پیامک',
};

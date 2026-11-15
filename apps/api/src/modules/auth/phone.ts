import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { normaliseIranMobile } from '@taskin/text';

/** Normalizes an Iranian mobile number to E.164 and rejects non-mobile ranges. */
export function toIranMobileE164(raw: string): string | null {
  const local = normaliseIranMobile(raw);
  if (!local) return null;
  const parsed = parsePhoneNumberFromString(local, 'IR');
  if (!parsed?.isValid() || parsed.getType() !== 'MOBILE') return null;
  return parsed.number;
}

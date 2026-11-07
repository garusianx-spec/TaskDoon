import { describe, expect, it } from 'vitest';
import { challengeTiming, maskedMobile, otpDigits } from '../src/lib/auth-input';

describe('authentication input and challenge boundaries', () => {
  it('accepts Persian, Arabic and Latin digits including formatted paste', () => {
    expect(otpDigits('۱۲ ٣٤-۵6', 6)).toBe('123456');
    expect(otpDigits('۱۲۳۴۵۶۷۸۹۰', 8)).toBe('12345678');
    expect(otpDigits('abc۱۲۳', 6)).toBe('123');
  });

  it('honors backend-returned length and independent expiry/resend intervals', () => {
    expect(challengeTiming({ challengeId: 'example', codeLength: 8, expiresInSeconds: 180, resendInSeconds: 45 }, 1000)).toEqual({ codeLength: 8, expiresAt: 181000, resendAt: 46000 });
    expect(otpDigits('123456789', 4)).toBe('1234');
  });

  it('masks the middle of a valid Iranian number and never echoes invalid input', () => {
    expect(maskedMobile('+989121234567')).toBe('0912 ••• 4567');
    expect(maskedMobile('۰۹۱۲۱۲۳۴۵۶۷')).toBe('0912 ••• 4567');
    expect(maskedMobile('not a phone')).toBe('');
  });
});

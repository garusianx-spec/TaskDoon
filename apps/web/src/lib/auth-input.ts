import type { OtpChallenge } from '@taskin/contracts';
import { normaliseIranMobile, toLatinDigits } from '@taskin/text';

export function otpDigits(value: string, length: number): string {
  return toLatinDigits(value).replace(/\D/g, '').slice(0, length);
}

export function maskedMobile(value: string): string {
  const phone = normaliseIranMobile(value);
  if (!phone) return '';
  return `${phone.slice(0, 4)} ••• ${phone.slice(-4)}`;
}

export function challengeTiming(challenge: OtpChallenge, receivedAt: number) {
  return { codeLength: challenge.codeLength, resendAt: receivedAt + challenge.resendInSeconds * 1000, expiresAt: receivedAt + challenge.expiresInSeconds * 1000 };
}

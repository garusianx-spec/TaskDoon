import { describe, it, expect } from 'vitest';
import { leadFieldError } from '@/features/marketing/lib/lead-validation';
const valid: ValidityState = {
  badInput: false,
  customError: false,
  patternMismatch: false,
  rangeOverflow: false,
  rangeUnderflow: false,
  stepMismatch: false,
  tooLong: false,
  tooShort: false,
  typeMismatch: false,
  valid: true,
  valueMissing: false,
};
const field = (name: string, value: string, required = false, flags: Partial<ValidityState> = {}) => ({
  name,
  value,
  required,
  validity: { ...valid, ...flags },
});
describe('public lead field feedback', () => {
  it('keeps required name, email, demo company and team selection explicit', () => {
    for (const name of ['fullName', 'email', 'company', 'teamSize'])
      expect(leadFieldError(field(name, '', true, { valueMissing: true }))).toBeTruthy();
  });
  it('rejects trimmed blank and short names', () => {
    expect(leadFieldError(field('fullName', '  ', true))).toContain('وارد کنید');
    expect(leadFieldError(field('fullName', 'آ', true))).toContain('۲');
  });
  it('preserves the ten-character trimmed message requirement', () => {
    expect(leadFieldError(field('message', '  short  ', true))).toContain('۱۰');
    expect(leadFieldError(field('message', 'متن پیام ساختگی معتبر', true))).toBeUndefined();
  });
  it('provides Persian feedback for invalid email and phone format', () => {
    expect(leadFieldError(field('email', 'broken', true, { typeMismatch: true }))).toBe(
      'ایمیل معتبر وارد کنید.',
    );
    expect(leadFieldError(field('phone', 'abc', false, { patternMismatch: true }))).toContain('شماره تماس');
  });
  it('keeps optional blank fields optional', () => {
    for (const name of ['phone', 'subject', 'company'])
      expect(leadFieldError(field(name, ''))).toBeUndefined();
  });
  it('requires explicit consent without changing its submitted value', () => {
    expect(leadFieldError(field('consent', 'on', true, { valueMissing: true }))).toContain('رضایت');
    expect(leadFieldError(field('consent', 'on', true))).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { discountBreakdown, MAX_TOMAN } from '@taskin/contracts';
import {
  CreateCheckoutOrderDto,
  CreateCouponDto,
  SetPlanPriceDto,
  ValidateCouponDto,
} from '../../src/modules/coupons/coupons.dto.js';

describe('whole-Toman discount arithmetic', () => {
  it.each([
    [1001, 'PERCENTAGE', 50, null, 500],
    [10000, 'PERCENTAGE', 50, 2000, 2000],
    [10000, 'PERCENTAGE', 100, null, 10000],
    [100, 'FIXED_AMOUNT', 1000, null, 100],
    [0, 'PERCENTAGE', 100, null, 0],
    [MAX_TOMAN, 'PERCENTAGE', 99, null, 990_000_000_000],
    [1000, 'PERCENTAGE', 50, 0, 0],
  ] as const)(
    'calculates %s %s %s cap %s',
    (subtotal, discountType, discountValue, maxDiscountAmount, expected) => {
      expect(discountBreakdown(subtotal, { discountType, discountValue, maxDiscountAmount })).toEqual({
        currency: 'TOMAN',
        subtotal,
        discount: expected,
        total: subtotal - expected,
      });
    },
  );
  it.each([-1, 1.5, Infinity, NaN, MAX_TOMAN + 1])('rejects an unsafe subtotal %s', (subtotal) => {
    expect(() => discountBreakdown(subtotal)).toThrow(RangeError);
  });
  it.each([0, -1, 101, 1.5])('rejects invalid percentage %s', (discountValue) => {
    expect(() =>
      discountBreakdown(100, { discountType: 'PERCENTAGE', discountValue, maxDiscountAmount: null }),
    ).toThrow(RangeError);
  });
  it('does not mutate the invoice when no coupon is selected', () => {
    expect(discountBreakdown(1000)).toEqual({ currency: 'TOMAN', subtotal: 1000, discount: 0, total: 1000 });
  });
});
describe('coupon API input boundaries', () => {
  it('normalizes codes and validates nullable limits', async () => {
    const dto = plainToInstance(CreateCouponDto, {
      code: ' nowruz1405 ',
      discountType: 'PERCENTAGE',
      discountValue: 50,
      usageLimit: null,
      expiresAt: null,
      allowedPlans: ['team'],
    });
    expect(dto.code).toBe('NOWRUZ1405');
    expect(await validate(dto)).toEqual([]);
  });
  it.each(['../../admin', 'کد', '<script>', 'A'.repeat(41)])('rejects invalid code %s', async (code) => {
    expect(
      (
        await validate(
          plainToInstance(CreateCouponDto, { code, discountType: 'PERCENTAGE', discountValue: 50 }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('rejects duplicate eligible plans', async () => {
    expect(
      (
        await validate(
          plainToInstance(CreateCouponDto, {
            code: 'OFF50',
            discountType: 'PERCENTAGE',
            discountValue: 50,
            allowedPlans: ['team', 'team'],
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('requires an owned workspace identifier at validation', async () => {
    expect(
      (
        await validate(
          plainToInstance(ValidateCouponDto, { planId: 'team', period: 'monthly', code: 'OFF50' }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('requires a stable UUID command for checkout retries', async () => {
    expect(
      (
        await validate(
          plainToInstance(CreateCheckoutOrderDto, { planId: 'team', period: 'monthly', commandId: 'random' }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('refuses fractional and negative price inputs', async () => {
    for (const amountToman of [-1, 1.5, MAX_TOMAN + 1])
      expect(
        (await validate(plainToInstance(SetPlanPriceDto, { planId: 'team', period: 'monthly', amountToman })))
          .length,
      ).toBeGreaterThan(0);
  });
});

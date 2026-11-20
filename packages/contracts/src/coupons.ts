/** All billing amounts are whole Toman. Never accept a browser-supplied subtotal. */
export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';
export type BillingPeriod = 'monthly' | 'yearly';
export interface CreateCouponBody {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountAmount?: number | null;
  minOrderAmount?: number;
  usageLimit?: number | null;
  expiresAt?: string | null;
  isActive?: boolean;
  /** Empty means all current/future plans. Nonempty IDs must exist. */
  allowedPlans?: string[];
}
export interface CouponView extends Required<CreateCouponBody> {
  id: string;
  usedCount: number;
  createdAt: string;
}
export interface CouponPage {
  items: CouponView[];
  nextCursor: string | null;
}
export type CouponRejection =
  | 'INVALID'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'EXHAUSTED'
  | 'PLAN_INELIGIBLE'
  | 'MINIMUM_NOT_MET'
  | 'PRICE_UNAVAILABLE';
export interface CheckoutSelection {
  planId: string;
  period: BillingPeriod;
  code?: string;
}
export interface DiscountBreakdown {
  currency: 'TOMAN';
  subtotal: number;
  discount: number;
  total: number;
}
export type CouponValidation =
  { valid: true; breakdown: DiscountBreakdown } | { valid: false; reason: CouponRejection };
export interface CheckoutOrderView {
  id: string;
  status: 'pending' | 'paid';
  planId: string;
  period: BillingPeriod;
  breakdown: DiscountBreakdown;
  reservationExpiresAt: string;
}
export interface PlanPriceView {
  planId: string;
  planName?: string;
  period: BillingPeriod;
  amountToman: number;
  isActive: boolean;
}
export const MAX_TOMAN = 1_000_000_000_000;
/** Integer arithmetic; percentage discounts round down to whole Toman. */
export function discountBreakdown(
  subtotal: number,
  coupon?: Pick<CouponView, 'discountType' | 'discountValue' | 'maxDiscountAmount'>,
): DiscountBreakdown {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || subtotal > MAX_TOMAN)
    throw new RangeError('Invalid subtotal');
  let discount = 0;
  if (coupon) {
    if (
      !Number.isSafeInteger(coupon.discountValue) ||
      coupon.discountValue <= 0 ||
      coupon.discountValue > MAX_TOMAN ||
      (coupon.discountType === 'PERCENTAGE' && coupon.discountValue > 100)
    )
      throw new RangeError('Invalid discount');
    if (
      coupon.maxDiscountAmount !== null &&
      (!Number.isSafeInteger(coupon.maxDiscountAmount) ||
        coupon.maxDiscountAmount < 0 ||
        coupon.maxDiscountAmount > MAX_TOMAN)
    )
      throw new RangeError('Invalid cap');
    discount =
      coupon.discountType === 'PERCENTAGE'
        ? Math.floor((subtotal * coupon.discountValue) / 100)
        : coupon.discountValue;
    if (coupon.discountType === 'PERCENTAGE' && coupon.maxDiscountAmount !== null)
      discount = Math.min(discount, coupon.maxDiscountAmount);
  }
  discount = Math.min(subtotal, discount);
  return { currency: 'TOMAN', subtotal, discount, total: subtotal - discount };
}

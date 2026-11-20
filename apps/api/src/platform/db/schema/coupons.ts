import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, instant, updatedAt, uuidPk } from './columns.js';
import { users } from './identity.js';
import { plans, workspaces } from './tenancy.js';

export const couponDiscountType = pgEnum('coupon_discount_type', ['PERCENTAGE', 'FIXED_AMOUNT']);
export const billingPeriod = pgEnum('billing_period', ['monthly', 'yearly']);
export const checkoutStatus = pgEnum('checkout_status', ['pending', 'paid']);
export const coupons = pgTable(
  'coupons',
  {
    id: uuidPk(),
    code: text().notNull().unique(),
    discountType: couponDiscountType().notNull(),
    discountValue: bigint({ mode: 'number' }).notNull(),
    maxDiscountAmount: bigint({ mode: 'number' }),
    minOrderAmount: bigint({ mode: 'number' }).notNull().default(0),
    usageLimit: integer(),
    usedCount: integer().notNull().default(0),
    expiresAt: instant(),
    isActive: boolean().notNull().default(true),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('coupons_code_ck', sql`${t.code} ~ '^[A-Z0-9]{3,40}$'`),
    check(
      'coupons_value_ck',
      sql`${t.discountValue} between 1 and 1000000000000 and (${t.discountType} <> 'PERCENTAGE' or ${t.discountValue} <= 100)`,
    ),
    check(
      'coupons_amount_ck',
      sql`${t.minOrderAmount} between 0 and 1000000000000 and (${t.maxDiscountAmount} is null or (${t.discountType} = 'PERCENTAGE' and ${t.maxDiscountAmount} between 0 and 1000000000000))`,
    ),
    check(
      'coupons_usage_ck',
      sql`${t.usedCount} >= 0 and (${t.usageLimit} is null or (${t.usageLimit} > 0 and ${t.usedCount} <= ${t.usageLimit}))`,
    ),
    index('coupons_created_idx').on(t.createdAt.desc(), t.id.desc()),
  ],
);
export const couponPlans = pgTable(
  'coupon_plans',
  {
    couponId: uuid()
      .notNull()
      .references(() => coupons.id, { onDelete: 'restrict' }),
    planId: text()
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.couponId, t.planId] })],
);
export const planPrices = pgTable(
  'plan_prices',
  {
    planId: text()
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    period: billingPeriod().notNull(),
    amountToman: bigint({ mode: 'number' }).notNull(),
    isActive: boolean().notNull().default(true),
    updatedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.planId, t.period] }),
    check('plan_prices_amount_ck', sql`${t.amountToman} between 0 and 1000000000000`),
  ],
);
export const checkoutOrders = pgTable(
  'checkout_orders',
  {
    id: uuidPk(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    commandId: uuid().notNull(),
    planId: text().notNull(),
    period: billingPeriod().notNull(),
    couponId: uuid().references(() => coupons.id, { onDelete: 'restrict' }),
    couponCode: text().notNull().default(''),
    subtotal: bigint({ mode: 'number' }).notNull(),
    discount: bigint({ mode: 'number' }).notNull(),
    total: bigint({ mode: 'number' }).notNull(),
    status: checkoutStatus().notNull().default('pending'),
    reservationExpiresAt: instant().notNull(),
    /** Provider-qualified opaque ID, e.g. provider:transaction. Never provided by checkout clients. */
    paymentReference: text().unique(),
    paidAt: instant(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('checkout_orders_command_uq').on(t.workspaceId, t.userId, t.commandId),
    foreignKey({
      columns: [t.planId, t.period],
      foreignColumns: [planPrices.planId, planPrices.period],
    }).onDelete('restrict'),
    check(
      'checkout_orders_amount_ck',
      sql`${t.subtotal} between 0 and 1000000000000 and ${t.discount} between 0 and ${t.subtotal} and ${t.total} = ${t.subtotal} - ${t.discount}`,
    ),
    check(
      'checkout_orders_payment_ck',
      sql`(${t.status} = 'pending' and ${t.paymentReference} is null and ${t.paidAt} is null) or (${t.status} = 'paid' and ${t.paymentReference} is not null and ${t.paidAt} is not null)`,
    ),
    index('checkout_orders_reservations_idx')
      .on(t.couponId, t.reservationExpiresAt)
      .where(sql`${t.status} = 'pending'`),
    index('checkout_orders_workspace_idx').on(t.workspaceId, t.createdAt.desc()),
  ],
);
/** Global capacity bookkeeping: counting reservations must not be filtered by tenant RLS. */
export const couponReservations = pgTable(
  'coupon_reservations',
  {
    orderId: uuid()
      .primaryKey()
      .references(() => checkoutOrders.id, { onDelete: 'restrict' }),
    couponId: uuid()
      .notNull()
      .references(() => coupons.id, { onDelete: 'restrict' }),
    expiresAt: instant().notNull(),
    consumedAt: instant(),
  },
  (t) => [
    index('coupon_reservations_available_idx')
      .on(t.couponId, t.expiresAt)
      .where(sql`${t.consumedAt} is null`),
  ],
);

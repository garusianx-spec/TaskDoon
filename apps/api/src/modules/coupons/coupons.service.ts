import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import {
  discountBreakdown,
  type CheckoutOrderView,
  type CheckoutSelection,
  type CouponPage,
  type CouponRejection,
  type CouponValidation,
  type CouponView,
  type PlanPriceView,
} from '@taskin/contracts';
import {
  checkoutOrders,
  couponPlans,
  couponReservations,
  coupons,
  planPrices,
  plans,
  workspaces,
} from '../../platform/db/schema/all.js';
import { type Unit, UnitOfWork } from '../../platform/db/unit-of-work.js';
import type { Tx } from '../../platform/db/database.js';
import { Clock } from '../../platform/clock/clock.js';
import { ApiError } from '../../platform/http/api-error.js';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { PlatformAdminUnitOfWork } from '../platform-admin/admin-unit-of-work.js';
import { PlatformAuditWriter } from '../platform-admin/platform-audit.writer.js';
import type { PlatformAdmin } from '../platform-admin/platform-admin.guard.js';
import { decodeCursor, encodeCursor } from '../platform-admin/admin-queries.js';
import type {
  CouponQueryDto,
  CreateCheckoutOrderDto,
  CreateCouponDto,
  SetPlanPriceDto,
} from './coupons.dto.js';

type Coupon = typeof coupons.$inferSelect;
type Order = typeof checkoutOrders.$inferSelect;
const orderView = (o: Order): CheckoutOrderView => ({
  id: o.id,
  status: o.status,
  planId: o.planId,
  period: o.period,
  breakdown: { currency: 'TOMAN', subtotal: o.subtotal, discount: o.discount, total: o.total },
  reservationExpiresAt: o.reservationExpiresAt.toISOString(),
});
const couponView = (c: Coupon, allowedPlans: string[]): CouponView => ({
  ...c,
  allowedPlans,
  expiresAt: c.expiresAt?.toISOString() ?? null,
  createdAt: c.createdAt.toISOString(),
});
/** No provider calls, email or entitlements: only transactional price/coupon/order bookkeeping. */
@Injectable()
export class CouponsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly admins: PlatformAdminUnitOfWork,
    private readonly audit: PlatformAuditWriter,
    private readonly clock: Clock,
    private readonly activity: AuditWriter,
  ) {}

  async create(admin: PlatformAdmin, body: CreateCouponDto): Promise<CouponView> {
    if (
      (body.discountType === 'PERCENTAGE' && body.discountValue > 100) ||
      (body.discountType === 'FIXED_AMOUNT' && body.maxDiscountAmount != null)
    )
      throw ApiError.validation([{ field: 'discountValue', message: 'Invalid rate or fixed discount cap' }]);
    if (body.expiresAt && new Date(body.expiresAt) <= this.clock.now())
      throw ApiError.validation([{ field: 'expiresAt', message: 'Must be in the future' }]);
    return this.uow.run({ workspaceId: null, userId: admin.userId }, async (unit) => {
      const ids = body.allowedPlans ?? [];
      if (
        ids.length &&
        (await unit.tx.select({ id: plans.id }).from(plans).where(inArray(plans.id, ids))).length !==
          ids.length
      )
        throw ApiError.validation([{ field: 'allowedPlans', message: 'Unknown plan' }]);
      const [row] = await unit.tx
        .insert(coupons)
        .values({
          code: body.code,
          discountType: body.discountType,
          discountValue: body.discountValue,
          maxDiscountAmount: body.maxDiscountAmount ?? null,
          minOrderAmount: body.minOrderAmount ?? 0,
          usageLimit: body.usageLimit ?? null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          isActive: body.isActive ?? true,
          createdBy: admin.userId,
        })
        .onConflictDoNothing({ target: coupons.code })
        .returning();
      if (!row) throw new ApiError('CONFLICT', 'Coupon code already exists');
      if (ids.length)
        await unit.tx.insert(couponPlans).values(ids.map((planId) => ({ couponId: row.id, planId })));
      await this.audit.record(
        admin,
        { action: 'admin.coupon.create', resourceType: 'coupon', resourceId: row.id },
        unit,
      );
      return couponView(row, ids);
    });
  }
  async list(admin: PlatformAdmin, query: CouponQueryDto): Promise<CouponPage> {
    const limit = query.limit ?? 30;
    const cursor = decodeCursor(query.cursor);
    const result = await this.admins.read(admin, async (tx) => {
      const rows = await tx
        .select()
        .from(coupons)
        .where(
          and(
            query.code ? eq(coupons.code, query.code) : undefined,
            query.status && query.status !== 'all'
              ? eq(coupons.isActive, query.status === 'active')
              : undefined,
            cursor
              ? or(
                  lt(coupons.createdAt, new Date(cursor.createdAt)),
                  and(eq(coupons.createdAt, new Date(cursor.createdAt)), lt(coupons.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(coupons.createdAt), desc(coupons.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const eligible = page.length
        ? await tx
            .select()
            .from(couponPlans)
            .where(
              inArray(
                couponPlans.couponId,
                page.map((c) => c.id),
              ),
            )
        : [];
      return {
        items: page.map((c) =>
          couponView(
            c,
            eligible.filter((p) => p.couponId === c.id).map((p) => p.planId),
          ),
        ),
        nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt.toISOString(), last.id) : null,
      };
    });
    await this.audit.record(admin, {
      action: 'admin.coupon.list',
      resourceType: 'coupon',
      metadata: { count: result.items.length },
    });
    return result;
  }
  async deactivate(admin: PlatformAdmin, id: string): Promise<void> {
    await this.uow.run({ workspaceId: null, userId: admin.userId }, async (unit) => {
      const [row] = await unit.tx
        .update(coupons)
        .set({ isActive: false })
        .where(eq(coupons.id, id))
        .returning({ id: coupons.id });
      if (!row) throw ApiError.notFound('Coupon');
      await this.audit.record(
        admin,
        { action: 'admin.coupon.deactivate', resourceType: 'coupon', resourceId: id },
        unit,
      );
    });
  }
  async catalog(admin: PlatformAdmin) {
    return this.admins.read(admin, async (tx) => ({
      plans: await tx.select({ id: plans.id, name: plans.name }).from(plans).orderBy(plans.id).limit(100),
      prices: await tx.select().from(planPrices).orderBy(planPrices.planId, planPrices.period).limit(200),
    }));
  }
  async setPrice(admin: PlatformAdmin, body: SetPlanPriceDto): Promise<PlanPriceView> {
    return this.uow.run({ workspaceId: null, userId: admin.userId }, async (unit) => {
      if (!(await unit.tx.select({ id: plans.id }).from(plans).where(eq(plans.id, body.planId))).length)
        throw ApiError.notFound('Plan');
      const values = { ...body, isActive: body.isActive ?? true, updatedBy: admin.userId };
      const [row] = await unit.tx
        .insert(planPrices)
        .values(values)
        .onConflictDoUpdate({
          target: [planPrices.planId, planPrices.period],
          set: { amountToman: body.amountToman, isActive: values.isActive, updatedBy: admin.userId },
        })
        .returning();
      if (!row) throw new Error('Price insert returned no row');
      await this.audit.record(
        admin,
        {
          action: 'admin.billing.price',
          resourceType: 'plan',
          metadata: { planId: body.planId, period: body.period, amountToman: body.amountToman },
        },
        unit,
      );
      return row;
    });
  }

  private async owner(tx: Tx, workspaceId: string, userId: string): Promise<void> {
    const [w] = await tx
      .select({
        owner: workspaces.ownerUserId,
        suspended: workspaces.suspendedAt,
        deleted: workspaces.deletedAt,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for('update');
    if (!w || w.owner !== userId || w.suspended || w.deleted)
      throw ApiError.forbidden('Only the workspace owner may manage billing');
  }
  private async evaluate(
    tx: Tx,
    selection: CheckoutSelection,
    lock = false,
  ): Promise<{ result: CouponValidation; coupon: Coupon | null }> {
    const [price] = await tx
      .select()
      .from(planPrices)
      .where(
        and(
          eq(planPrices.planId, selection.planId),
          eq(planPrices.period, selection.period),
          eq(planPrices.isActive, true),
        ),
      );
    const fail = (reason: CouponRejection) => ({ result: { valid: false, reason } as const, coupon: null });
    if (!price) return fail('PRICE_UNAVAILABLE');
    if (!selection.code)
      return { result: { valid: true, breakdown: discountBreakdown(price.amountToman) }, coupon: null };
    const query = tx.select().from(coupons).where(eq(coupons.code, selection.code));
    const [c] = lock ? await query.for('update') : await query;
    if (!c) return fail('INVALID');
    if (!c.isActive) return fail('INACTIVE');
    if (c.expiresAt && c.expiresAt <= this.clock.now()) return fail('EXPIRED');
    const allowed = await tx
      .select({ id: couponPlans.planId })
      .from(couponPlans)
      .where(eq(couponPlans.couponId, c.id));
    if (allowed.length && !allowed.some((p) => p.id === selection.planId)) return fail('PLAN_INELIGIBLE');
    if (price.amountToman < c.minOrderAmount) return fail('MINIMUM_NOT_MET');
    if (c.usageLimit !== null) {
      const [reserved] = await tx
        .select({ count: count() })
        .from(couponReservations)
        .where(
          and(
            eq(couponReservations.couponId, c.id),
            isNull(couponReservations.consumedAt),
            gt(couponReservations.expiresAt, this.clock.now()),
          ),
        );
      if (c.usedCount + (reserved?.count ?? 0) >= c.usageLimit) return fail('EXHAUSTED');
    }
    return { result: { valid: true, breakdown: discountBreakdown(price.amountToman, c) }, coupon: c };
  }
  async validate(workspaceId: string, userId: string, body: CheckoutSelection): Promise<CouponValidation> {
    return this.uow.run({ workspaceId, userId }, async ({ tx }) => {
      await this.owner(tx, workspaceId, userId);
      return (await this.evaluate(tx, body)).result;
    });
  }
  async createOrder(
    workspaceId: string,
    userId: string,
    body: CreateCheckoutOrderDto,
  ): Promise<CheckoutOrderView> {
    return this.uow.run({ workspaceId, userId }, async (unit) => {
      await this.owner(unit.tx, workspaceId, userId);
      const [prior] = await unit.tx
        .select()
        .from(checkoutOrders)
        .where(
          and(
            eq(checkoutOrders.workspaceId, workspaceId),
            eq(checkoutOrders.userId, userId),
            eq(checkoutOrders.commandId, body.commandId),
          ),
        );
      if (prior) {
        if (
          prior.planId !== body.planId ||
          prior.period !== body.period ||
          prior.couponCode !== (body.code ?? '')
        )
          throw new ApiError('IDEMPOTENCY_KEY_REUSED');
        return orderView(prior);
      }
      const { result, coupon } = await this.evaluate(unit.tx, body, true);
      if (!result.valid) throw ApiError.validation([{ field: 'code', message: result.reason }]);
      const now = this.clock.now();
      if (coupon?.expiresAt && coupon.expiresAt <= now)
        throw ApiError.validation([{ field: 'code', message: 'EXPIRED' }]);
      // A reservation never extends beyond coupon validity.
      const expiresAt = new Date(
        Math.min(now.getTime() + 15 * 60_000, coupon?.expiresAt?.getTime() ?? Infinity),
      );
      const [order] = await unit.tx
        .insert(checkoutOrders)
        .values({
          workspaceId,
          userId,
          commandId: body.commandId,
          planId: body.planId,
          period: body.period,
          couponId: coupon?.id ?? null,
          couponCode: body.code ?? '',
          subtotal: result.breakdown.subtotal,
          discount: result.breakdown.discount,
          total: result.breakdown.total,
          reservationExpiresAt: expiresAt,
        })
        .returning();
      if (!order) throw new Error('Order insert returned no row');
      if (coupon)
        await unit.tx
          .insert(couponReservations)
          .values({ orderId: order.id, couponId: coupon.id, expiresAt });
      await this.activity.write(unit.tx, {
        action: 'billing.order.created',
        workspaceId,
        actorUserId: userId,
        resourceType: 'checkout_order',
        resourceId: order.id,
        changes: {
          after: {
            planId: order.planId,
            period: order.period,
            totalToman: order.total,
            couponId: order.couponId,
          },
        },
      });
      return orderView(order);
    });
  }
  async getOrder(workspaceId: string, userId: string, id: string): Promise<CheckoutOrderView> {
    return this.uow.run({ workspaceId, userId }, async ({ tx }) => {
      await this.owner(tx, workspaceId, userId);
      const [order] = await tx
        .select()
        .from(checkoutOrders)
        .where(and(eq(checkoutOrders.id, id), eq(checkoutOrders.workspaceId, workspaceId)));
      if (!order) throw ApiError.notFound('Order');
      return orderView(order);
    });
  }
  async checkoutCatalog(workspaceId: string, userId: string): Promise<PlanPriceView[]> {
    return this.uow.run({ workspaceId, userId }, async ({ tx }) => {
      await this.owner(tx, workspaceId, userId);
      return tx
        .select({
          planId: planPrices.planId,
          planName: plans.name,
          period: planPrices.period,
          amountToman: planPrices.amountToman,
          isActive: planPrices.isActive,
        })
        .from(planPrices)
        .innerJoin(plans, eq(plans.id, planPrices.planId))
        .where(eq(planPrices.isActive, true))
        .orderBy(planPrices.planId, planPrices.period)
        .limit(200);
    });
  }
  /** INTERNAL ONLY. The future gateway adapter MUST verify provider signature, currency and paid status first.
   * Use the caller's transaction, so payment receipt/entitlement/outbox can commit with this write.
   * Not exposed as a client-callable "payment successful" route. */
  async settleVerifiedPayment(
    unit: Unit,
    workspaceId: string,
    orderId: string,
    payment: { reference: string; amountToman: number },
  ): Promise<CheckoutOrderView> {
    const [order] = await unit.tx
      .select()
      .from(checkoutOrders)
      .where(and(eq(checkoutOrders.workspaceId, workspaceId), eq(checkoutOrders.id, orderId)))
      .for('update');
    if (!order) throw ApiError.notFound('Order');
    if (!payment.reference.trim() || payment.reference.length > 200 || payment.amountToman !== order.total)
      throw new ApiError('CONFLICT', 'Payment does not match the order');
    if (order.status === 'paid') {
      if (order.paymentReference !== payment.reference)
        throw new ApiError('CONFLICT', 'Order already paid with another reference');
      return orderView(order);
    }
    // Late successful payments require reconciliation/refund; never silently oversell coupon capacity.
    if (order.reservationExpiresAt <= this.clock.now())
      throw new ApiError('CONFLICT', 'PAYMENT_RECONCILIATION_REQUIRED');
    if (order.couponId) {
      const [c] = await unit.tx.select().from(coupons).where(eq(coupons.id, order.couponId)).for('update');
      if (!c || (c.usageLimit !== null && c.usedCount >= c.usageLimit))
        throw new ApiError('CONFLICT', 'PAYMENT_RECONCILIATION_REQUIRED');
      await unit.tx
        .update(coupons)
        .set({ usedCount: sql`${coupons.usedCount} + 1` })
        .where(eq(coupons.id, c.id));
      await unit.tx
        .update(couponReservations)
        .set({ consumedAt: this.clock.now() })
        .where(eq(couponReservations.orderId, order.id));
    }
    const [paid] = await unit.tx
      .update(checkoutOrders)
      .set({ status: 'paid', paidAt: this.clock.now(), paymentReference: payment.reference })
      .where(eq(checkoutOrders.id, order.id))
      .returning();
    if (!paid) throw new Error('Order update returned no row');
    await this.activity.write(unit.tx, {
      action: 'billing.order.paid',
      workspaceId,
      actorUserId: order.userId,
      resourceType: 'checkout_order',
      resourceId: order.id,
      changes: { after: { totalToman: order.total, couponId: order.couponId } },
    });
    return orderView(paid);
  }
}

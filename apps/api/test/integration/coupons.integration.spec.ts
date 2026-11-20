/** Uses the repository's disposable integration harness, never an existing workspace/database. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CouponsService } from '../../src/modules/coupons/coupons.service.js';
import { UnitOfWork } from '../../src/platform/db/unit-of-work.js';
import { Clock } from '../../src/platform/clock/clock.js';
import { bearer, createTestApp, ownerWithWorkspace, type Session, type TestApp } from './harness.js';

describe('coupon reservations and verified settlement', () => {
  let t: TestApp;
  let owner: Session;
  let other: Session;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let service: CouponsService;
  let uow: UnitOfWork;
  beforeAll(async () => {
    t = await createTestApp({}, { preserveFixtures: true });
    console.info(`Preserved synthetic coupon fixture database: ${t.database}`);
    const a = await ownerWithWorkspace(t, 'Synthetic coupon QA A');
    const b = await ownerWithWorkspace(t, 'Synthetic coupon QA B');
    owner = a.owner;
    other = b.owner;
    workspaceId = a.workspace.id;
    otherWorkspaceId = b.workspace.id;
    await t.admin.query(
      "update users set is_platform_admin = true, platform_admin_role = 'SUPER_ADMIN' where id = $1",
      [owner.userId],
    );
    service = t.app.get(CouponsService);
    uow = t.app.get(UnitOfWork);
    await t
      .http()
      .put('/api/v1/admin/billing/prices')
      .set(bearer(owner))
      .send({ planId: 'team', period: 'monthly', amountToman: 10000 })
      .expect(200);
  });
  afterAll(async () => {
    t?.app.get(Clock).pin(null);
    await t?.close();
  });
  const create = async (code: string, extra = {}) =>
    (
      await t
        .http()
        .post('/api/v1/admin/coupons')
        .set(bearer(owner))
        .send({ code, discountType: 'PERCENTAGE', discountValue: 50, ...extra })
        .expect(201)
    ).body as { id: string };
  const order = (who: Session, w: string, code: string, commandId = randomUUID()) =>
    t
      .http()
      .post(`/api/v1/workspaces/${w}/checkout/orders`)
      .set(bearer(who))
      .send({ planId: 'team', period: 'monthly', code, commandId });
  const settle = (id: string, reference: string, amountToman = 5000) =>
    uow.run({ workspaceId, userId: owner.userId }, (unit) =>
      service.settleVerifiedPayment(unit, workspaceId, id, { reference, amountToman }),
    );

  it('denies unauthenticated, non-super-admin and cross-workspace access', async () => {
    await t.http().get('/api/v1/admin/coupons').expect(401);
    await t.http().get('/api/v1/admin/coupons').set(bearer(other)).expect(404);
    await t
      .http()
      .post('/api/v1/coupons/validate')
      .set(bearer(other))
      .send({ workspaceId, planId: 'team', period: 'monthly' })
      .expect(403);
  });
  it('validates without consuming, preserves plan restrictions and minimum amounts', async () => {
    const c = await create('LIMITTEST', { allowedPlans: ['team'], minOrderAmount: 20000 });
    const result = await t
      .http()
      .post('/api/v1/coupons/validate')
      .set(bearer(owner))
      .send({ workspaceId, planId: 'team', period: 'monthly', code: 'LIMITTEST' })
      .expect(200);
    expect(result.body).toEqual({ valid: false, reason: 'MINIMUM_NOT_MET' });
    expect(
      (await t.admin.query('select used_count from coupons where id = $1', [c.id])).rows[0].used_count,
    ).toBe(0);
  });
  it('serializes the last available redemption across different tenants', async () => {
    await create('LASTONE', { usageLimit: 1 });
    const results = await Promise.all([
      order(owner, workspaceId, 'LASTONE'),
      order(other, otherWorkspaceId, 'LASTONE'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const winning = results.find((r) => r.status === 201)!;
    expect(winning.body.status).toBe('pending');
    expect(
      (await t.admin.query("select used_count from coupons where code = 'LASTONE'")).rows[0].used_count,
    ).toBe(0);
  });
  it('replays an order once and rejects the same command with a different selection', async () => {
    await create('REPLAY');
    const command = randomUUID();
    const [a, b] = await Promise.all([
      order(owner, workspaceId, 'REPLAY', command),
      order(owner, workspaceId, 'REPLAY', command),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    await t
      .http()
      .post(`/api/v1/workspaces/${workspaceId}/checkout/orders`)
      .set(bearer(owner))
      .send({ planId: 'team', period: 'yearly', code: 'REPLAY', commandId: command })
      .expect(422);
  });
  it('settles concurrent duplicate verified callbacks exactly once', async () => {
    const c = await create('PAIDONCE', { usageLimit: 1 });
    const pending = await order(owner, workspaceId, 'PAIDONCE').expect(201);
    const [a, b] = await Promise.all([
      settle(pending.body.id, 'synthetic:paid-once'),
      settle(pending.body.id, 'synthetic:paid-once'),
    ]);
    expect(a.status).toBe('paid');
    expect(b.status).toBe('paid');
    expect(
      (await t.admin.query('select used_count from coupons where id = $1', [c.id])).rows[0].used_count,
    ).toBe(1);
    await expect(settle(pending.body.id, 'synthetic:different')).rejects.toThrow();
    const exhausted = await t
      .http()
      .post('/api/v1/coupons/validate')
      .set(bearer(owner))
      .send({ workspaceId, planId: 'team', period: 'monthly', code: 'PAIDONCE' })
      .expect(200);
    expect(exhausted.body).toEqual({ valid: false, reason: 'EXHAUSTED' });
  });
  it('rolls back a mismatched amount and keeps the reservation recoverable', async () => {
    const c = await create('WRONGAMOUNT');
    const pending = await order(owner, workspaceId, 'WRONGAMOUNT').expect(201);
    await expect(settle(pending.body.id, 'synthetic:amount', 1)).rejects.toThrow();
    expect(
      (await t.admin.query('select used_count from coupons where id = $1', [c.id])).rows[0].used_count,
    ).toBe(0);
    expect((await settle(pending.body.id, 'synthetic:amount')).status).toBe('paid');
  });
  it('releases expired reservations without deleting records and rejects a late payment for reconciliation', async () => {
    await create('EXPIRELEASE', { usageLimit: 1 });
    const pending = await order(owner, workspaceId, 'EXPIRELEASE').expect(201);
    const clock = t.app.get(Clock);
    clock.pin(new Date(Date.now() + 16 * 60_000));
    try {
      await expect(settle(pending.body.id, 'synthetic:late')).rejects.toThrow(
        'PAYMENT_RECONCILIATION_REQUIRED',
      );
      await order(other, otherWorkspaceId, 'EXPIRELEASE').expect(201);
      expect(
        (
          await t.admin.query('select count(*)::int as n from coupon_reservations where order_id = $1', [
            pending.body.id,
          ])
        ).rows[0].n,
      ).toBe(1);
    } finally {
      clock.pin(null);
    }
  });
  it('deactivates without erasing history and preserves an existing reservation', async () => {
    const c = await create('DEACTIVATE');
    const pending = await order(owner, workspaceId, 'DEACTIVATE').expect(201);
    await t.http().delete(`/api/v1/admin/coupons/${c.id}`).set(bearer(owner)).expect(204);
    await order(owner, workspaceId, 'DEACTIVATE').expect(400);
    expect((await settle(pending.body.id, 'synthetic:deactivated')).status).toBe('paid');
  });
  it('enforces order isolation in PostgreSQL even without API permission checks', async () => {
    const client = await t.appPool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.workspace_id', $1, true)", [otherWorkspaceId]);
      expect(
        (await client.query('select id from checkout_orders where workspace_id = $1', [workspaceId])).rows,
      ).toEqual([]);
      await client.query('commit');
    } finally {
      client.release();
    }
  });
  it('rejects ineligible and expired coupons without consuming them', async () => {
    await create('ONLYFREE', { allowedPlans: ['free'] });
    expect(
      await service.validate(workspaceId, owner.userId, {
        planId: 'team',
        period: 'monthly',
        code: 'ONLYFREE',
      }),
    ).toEqual({ valid: false, reason: 'PLAN_INELIGIBLE' });
    await create('EXPIREDATE', { expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const clock = t.app.get(Clock);
    clock.pin(new Date(Date.now() + 120_000));
    try {
      expect(
        await service.validate(workspaceId, owner.userId, {
          planId: 'team',
          period: 'monthly',
          code: 'EXPIREDATE',
        }),
      ).toEqual({ valid: false, reason: 'EXPIRED' });
    } finally {
      clock.pin(null);
    }
  });
});

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveBroadcasts, AuthSession, SystemBroadcastPage, SystemBroadcastView } from '@taskin/contracts';
import { BroadcastsService } from '../../src/modules/broadcasts/broadcasts.service.js';
import { PlatformAuditWriter } from '../../src/modules/platform-admin/platform-audit.writer.js';
import { Clock } from '../../src/platform/clock/clock.js';
import { RedisClients } from '../../src/platform/redis/redis.js';
import { bearer, createTestApp, idempotencyKey, localForm, ownerWithWorkspace, randomPhone, type Session, signIn, stepUp, STRONG_PASSWORD, type TestApp, withAdminPassword } from './harness.js';
import { connect, next } from './socket-helpers.js';
import { expectStatus, outboxEvents } from './work-helpers.js';

const NOW = new Date('2030-04-10T12:00:00.000Z');
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1_000).toISOString();

describe('Platform super admin, phase 4: global broadcasts', () => {
  let t: TestApp;
  let operator: Session;
  let operatorFresh: Session;
  let alice: Session;
  let bob: Session;
  let clock: Clock;
  let cacheKey: string;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner: alice } = await ownerWithWorkspace(t, 'فضای نخست'));
    ({ owner: bob } = await ownerWithWorkspace(t, 'فضای دوم'));
    operatorFresh = await signIn(t, randomPhone(), 'اپراتور اطلاعیه‌ها');
    operator = await withAdminPassword(t, operatorFresh);
    await t.admin.query('update users set is_platform_admin = true where id = $1', [operator.userId]);
    clock = t.app.get(Clock);
    cacheKey = t.app.get(RedisClients).key('cache', 'broadcasts', 'active');
    await t.flushNotifications();
  });
  beforeEach(async () => {
    await t.admin.query('delete from system_broadcasts');
    await t.admin.query("delete from outbox_events where event_type = 'system.broadcast'");
    const keys = await t.redis.keys(`${t.env.REDIS_PREFIX}:cache:broadcasts:*`);
    if (keys.length > 0) await t.redis.del(...keys);
    clock.pin(NOW);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clock.pin(null);
  });
  afterAll(async () => {
    await t?.close();
  });

  const create = async (body: Record<string, unknown> = {}, requestId?: string): Promise<SystemBroadcastView> => {
    const request = t.http().post('/api/v1/admin/broadcasts').set(bearer(operator)).set('Idempotency-Key', idempotencyKey());
    if (requestId) request.set('X-Request-Id', requestId).set('traceparent', '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    const response = await request.send({ message: 'اطلاعیه عمومی', level: 'info', startsAt: at(-60), expiresAt: null, ...body });
    expectStatus(response, 201);
    return response.body as SystemBroadcastView;
  };
  const active = async (as = alice): Promise<ActiveBroadcasts> => {
    const response = await t.http().get('/api/v1/broadcasts/active').set(bearer(as));
    expectStatus(response, 200);
    return response.body as ActiveBroadcasts;
  };
  const patch = async (id: string, body: Record<string, unknown>): Promise<SystemBroadcastView> => {
    const response = await t.http().patch(`/api/v1/admin/broadcasts/${id}`).set(bearer(operator)).send(body);
    expectStatus(response, 200);
    return response.body as SystemBroadcastView;
  };

  it('requires authentication publicly and a current platform-admin step-up on every admin operation', async () => {
    expectStatus(await t.http().get('/api/v1/broadcasts/active'), 401);
    const id = randomUUID();
    const routes = [['get', '/broadcasts'], ['post', '/broadcasts'], ['patch', `/broadcasts/${id}`], ['delete', `/broadcasts/${id}`]] as const;
    for (const [method, path] of routes) {
      expectStatus(await t.http()[method](`/api/v1/admin${path}`).set(bearer(alice)), 404);
      const stale = await t.http()[method](`/api/v1/admin${path}`).set(bearer(operatorFresh));
      expectStatus(stale, 401);
      expect(stale.body.code).toBe('STEP_UP_REQUIRED');
    }
    expect((await active()).items).toEqual([]);
    await t.admin.query('update users set is_platform_admin = false where id = $1', [operator.userId]);
    try {
      expectStatus(await t.http().get('/api/v1/admin/broadcasts').set(bearer(operator)), 404);
    } finally {
      await t.admin.query('update users set is_platform_admin = true where id = $1', [operator.userId]);
    }
  });

  it('requires SMS confirmation even after a password session has stepped up', async () => {
    const login = await t.http().post('/api/v1/auth/password/login').send({ phone: localForm(operator.phone), password: STRONG_PASSWORD });
    expectStatus(login, 200);
    const passwordSession = { ...operator, accessToken: (login.body as AuthSession).accessToken };
    const stepped = await stepUp(t, passwordSession);
    const response = await t.http().get('/api/v1/admin/broadcasts').set(bearer(stepped));
    expectStatus(response, 401);
    expect(response.body.code).toBe('SMS_CONFIRMATION_REQUIRED');
  });

  it('validates content, levels and time windows without writing rows', async () => {
    for (const body of [
      { message: '' }, { message: '   ' }, { message: 'x'.repeat(501) }, { level: 'success' },
      { startsAt: 'فردا' }, { startsAt: at(10), expiresAt: at(10) }, { startsAt: at(10), expiresAt: at(5) },
    ]) {
      const response = await t.http().post('/api/v1/admin/broadcasts').set(bearer(operator)).set('Idempotency-Key', idempotencyKey())
        .send({ message: 'پیام معتبر', level: 'info', startsAt: at(-60), expiresAt: null, ...body });
      expectStatus(response, 400);
    }
    expect((await t.admin.query<{ count: string }>('select count(*) from system_broadcasts')).rows[0]?.count).toBe('0');
    const boundary = await create({ message: 'ی'.repeat(500) });
    expect(boundary.message).toHaveLength(500);
  });

  it('writes through the cache and records provenance, correlated audit rows and a global outbox event', async () => {
    const requestId = `broadcast-${randomUUID()}`;
    const broadcast = await create({ message: 'تعمیرات برنامه‌ریزی‌شده', level: 'warning' }, requestId);
    expect(broadcast).toMatchObject({ createdByName: 'اپراتور اطلاعیه‌ها', isActive: true, archivedAt: null });
    const provenance = await t.admin.query<{ created_by: string; updated_by: string }>('select created_by, updated_by from system_broadcasts where id = $1', [broadcast.id]);
    expect(provenance.rows[0]).toEqual({ created_by: operator.userId, updated_by: operator.userId });
    const raw = await t.redis.get(cacheKey);
    expect(raw).not.toBeNull();
    expect(raw).toContain(broadcast.id);
    expect(raw).toContain('تعمیرات برنامه‌ریزی‌شده');
    expect(raw).not.toContain('serverNow');
    expect(await t.redis.ttl(cacheKey)).toBeGreaterThan(0);
    expect(await t.redis.ttl(cacheKey)).toBeLessThanOrEqual(30);
    const visible = await active();
    expect(visible.items).toMatchObject([{ id: broadcast.id, message: broadcast.message, level: 'warning' }]);
    expect(visible.items[0]).not.toHaveProperty('createdBy');
    expect(visible.items[0]).not.toHaveProperty('updatedBy');
    const page = await t.http().get('/api/v1/admin/broadcasts').set(bearer(operator));
    expectStatus(page, 200);
    expect((page.body as SystemBroadcastPage).items.map((row) => row.id)).toContain(broadcast.id);
    const audits = await t.admin.query<{ admin_id: string; request_id: string; trace_id: string; metadata: Record<string, unknown> }>(
      "select admin_id, request_id, trace_id, metadata from platform_audit_logs where action = 'admin.broadcast.create' and resource_id = $1", [broadcast.id],
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0]).toMatchObject({ admin_id: operator.userId, request_id: requestId, trace_id: '4bf92f3577b34da6a3ce929d0e0e4736' });
    expect(JSON.stringify(audits.rows[0]?.metadata)).not.toContain(broadcast.message);
    const events = await outboxEvents(t, 'system.broadcast', broadcast.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ broadcastId: broadcast.id, action: 'published' });
    expect(events[0]?.headers).toMatchObject({ actorId: operator.userId, requestId });
    expect((await t.admin.query<{ workspace_id: string | null }>('select workspace_id from outbox_events where aggregate_id = $1', [broadcast.id])).rows[0]?.workspace_id).toBeNull();
  });

  it('filters scheduled windows at exact boundaries even while the candidate cache stays warm', async () => {
    const info = await create({ message: 'اکنون', startsAt: at(-10), expiresAt: at(10) });
    const future = await create({ message: 'به‌زودی', level: 'warning', startsAt: at(5), expiresAt: at(20) });
    await create({ message: 'منقضی', level: 'critical', startsAt: at(-20), expiresAt: at(0) });
    await create({ message: 'غیرفعال', isActive: false, startsAt: at(-10) });
    const cached = await t.redis.get(cacheKey);
    expect(cached).toContain(future.id);
    expect(await active()).toMatchObject({ serverNow: at(0), nextChangeAt: at(5), items: [{ id: info.id }] });
    clock.pin(new Date(at(5)));
    expect(await active()).toMatchObject({ serverNow: at(5), nextChangeAt: at(10), items: [{ id: future.id }, { id: info.id }] });
    clock.pin(new Date(at(10)));
    expect(await active()).toMatchObject({ serverNow: at(10), nextChangeAt: at(20), items: [{ id: future.id }] });
    clock.pin(new Date(at(20)));
    expect(await active()).toEqual({ serverNow: at(20), nextChangeAt: null, items: [] });
  });

  it('orders severity before recency and invalidates old dismissals through updatedAt', async () => {
    await create({ message: 'اطلاعات تازه', level: 'info' });
    const criticalOld = await create({ message: 'بحرانی قدیمی', level: 'critical' });
    const criticalNew = await create({ message: 'بحرانی تازه', level: 'critical' });
    const warning = await create({ message: 'هشدار', level: 'warning' });
    await t.admin.query('update system_broadcasts set created_at = $2 where id = $1', [criticalOld.id, at(-200)]);
    await t.admin.query('update system_broadcasts set created_at = $2 where id = $1', [criticalNew.id, at(-100)]);
    await t.redis.del(cacheKey);
    expect((await active()).items.map((row) => row.id).slice(0, 3)).toEqual([criticalNew.id, criticalOld.id, warning.id]);
    const revised = await patch(warning.id, { message: 'هشدار اصلاح‌شده' });
    expect(revised.updatedAt).not.toBe(warning.updatedAt);
    expect((await active()).items.find((row) => row.id === warning.id)).toMatchObject({ message: revised.message, updatedAt: revised.updatedAt });
  });

  it('toggles visibility and archives without physically deleting the record', async () => {
    const broadcast = await create();
    await patch(broadcast.id, { isActive: false });
    expect((await active()).items).toEqual([]);
    await patch(broadcast.id, { isActive: true, level: 'critical' });
    expect((await active(bob)).items).toMatchObject([{ id: broadcast.id, level: 'critical' }]);
    expectStatus(await t.http().delete(`/api/v1/admin/broadcasts/${broadcast.id}`).set(bearer(operator)), 204);
    expect((await active()).items).toEqual([]);
    const row = (await t.admin.query<{ is_active: boolean; archived_at: Date | null }>('select is_active, archived_at from system_broadcasts where id = $1', [broadcast.id])).rows[0];
    expect(row?.is_active).toBe(false);
    expect(row?.archived_at).toBeInstanceOf(Date);
    const current = await t.http().get('/api/v1/admin/broadcasts').set(bearer(operator));
    const all = await t.http().get('/api/v1/admin/broadcasts?status=all').set(bearer(operator));
    expectStatus(current, 200);
    expectStatus(all, 200);
    expect((current.body as SystemBroadcastPage).items).toEqual([]);
    expect((all.body as SystemBroadcastPage).items.map((item) => item.id)).toContain(broadcast.id);
    const events = await outboxEvents(t, 'system.broadcast', broadcast.id);
    expect(events.at(-1)?.payload).toEqual({ broadcastId: broadcast.id, action: 'withdrawn' });
  });

  it('rolls back the broadcast and outbox event when recording its audit fails', async () => {
    vi.spyOn(t.app.get(PlatformAuditWriter), 'record').mockRejectedValueOnce(new Error('controlled audit failure'));
    const response = await t.http().post('/api/v1/admin/broadcasts').set(bearer(operator)).set('Idempotency-Key', idempotencyKey())
      .send({ message: 'این پیام نباید ثبت شود', level: 'info', startsAt: at(-60) });
    expectStatus(response, 500);
    expect((await t.admin.query<{ count: string }>('select count(*) from system_broadcasts')).rows[0]?.count).toBe('0');
    expect(await outboxEvents(t, 'system.broadcast')).toEqual([]);
    expect(await t.redis.get(cacheKey)).toBeNull();
  });

  it('preserves every concurrent change in the cached snapshot', async () => {
    const broadcasts = await Promise.all(Array.from({ length: 6 }, (_, index) => create({ message: `اطلاعیه ${index}` })));
    await Promise.all(broadcasts.map((item, index) => patch(item.id, { message: `ویرایش ${index}`, level: 'warning' })));
    const visible = await active();
    expect(visible.items).toHaveLength(6);
    for (const [index, item] of broadcasts.entries()) expect(visible.items.find((row) => row.id === item.id)).toMatchObject({ message: `ویرایش ${index}`, level: 'warning' });
  });

  it('rebuilds malformed candidate caches and falls back to PostgreSQL when Redis reads fail', async () => {
    const broadcast = await create({ message: 'مرجع پایگاه داده' });
    await t.redis.set(cacheKey, '{broken-json', 'EX', 30);
    expect((await active()).items).toMatchObject([{ id: broadcast.id, message: broadcast.message }]);
    vi.spyOn(t.app.get(RedisClients).core, 'mget').mockRejectedValueOnce(new Error('controlled Redis read failure'));
    expect((await t.app.get(BroadcastsService).active()).items).toMatchObject([{ id: broadcast.id, message: broadcast.message }]);
  });

  it('keeps a committed announcement and its outbox event when the post-commit cache write fails', async () => {
    const broadcasts = t.app.get(BroadcastsService);
    const refresh = broadcasts.afterChange.bind(broadcasts);
    vi.spyOn(broadcasts, 'afterChange').mockImplementationOnce(async () => {
      vi.spyOn(t.app.get(RedisClients).core, 'eval').mockRejectedValueOnce(new Error('controlled Redis write failure'));
      await refresh();
    });
    const broadcast = await create({ message: 'ثبت موفق با کش ناموجود' });
    expect((await t.admin.query<{ message: string }>('select message from system_broadcasts where id = $1', [broadcast.id])).rows[0]?.message).toBe(broadcast.message);
    expect(await outboxEvents(t, 'system.broadcast', broadcast.id)).toHaveLength(1);
    expect((await active()).items).toMatchObject([{ id: broadcast.id, message: broadcast.message }]);
  });

  it('does not let an older cache fill overwrite a mutation that committed while it was reading', async () => {
    const broadcast = await create({ message: 'نسخه قدیمی' });
    await t.redis.del(cacheKey);
    const redis = t.app.get(RedisClients).core;
    const evaluate = redis.eval.bind(redis) as (...args: unknown[]) => Promise<unknown>;
    let release: () => void = () => undefined;
    let reached: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const oldFillReached = new Promise<void>((resolve) => { reached = resolve; });
    let intercept = true;
    vi.spyOn(redis, 'eval').mockImplementation(async (...args: unknown[]) => {
      const script = String(args[0]);
      if (intercept && args.includes(cacheKey) && script.includes('SET') && !script.includes('INCR')) {
        intercept = false;
        reached();
        await blocked;
      }
      return evaluate(...args);
    });
    const slow = t.app.get(BroadcastsService).active();
    try {
      await oldFillReached;
      await patch(broadcast.id, { message: 'نسخه جدید' });
    } finally {
      release();
      await slow;
    }
    expect((await active()).items).toMatchObject([{ id: broadcast.id, message: 'نسخه جدید' }]);
    expect(await t.redis.get(cacheKey)).not.toContain('نسخه قدیمی');
  });

  it('keeps platform data outside tenant RLS and grants no destructive app or platform-admin privileges', async () => {
    const columns = await t.admin.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'system_broadcasts'");
    expect(columns.rows.map((row) => row.column_name)).not.toContain('workspace_id');
    await expect(t.appPool.query('delete from system_broadcasts')).rejects.toThrow(/permission denied/);
    await expect(t.appPool.query('truncate system_broadcasts')).rejects.toThrow(/permission denied/);
    const pool = new pg.Pool({ connectionString: t.settings.DATABASE_PLATFORM_ADMIN_URL, max: 1 });
    try {
      await expect(pool.query('select id from system_broadcasts')).resolves.toBeDefined();
      await expect(pool.query('select id, created_at, published_at from outbox_events')).resolves.toBeDefined();
      await expect(pool.query('select payload from outbox_events')).rejects.toThrow(/permission denied/);
      await expect(pool.query("update system_broadcasts set message = 'x'")).rejects.toThrow(/read-only transaction/);
      const client = await pool.connect();
      try {
        await client.query('begin read write');
        await expect(client.query("update system_broadcasts set message = 'x'")).rejects.toThrow(/permission denied/);
      } finally {
        await client.query('rollback');
        client.release();
      }
    } finally {
      await pool.end();
    }
  });

  it('notifies authenticated sockets globally without any workspace subscription', async () => {
    const [onA, onB] = await Promise.all([connect(t.baseUrl, alice.accessToken), connect(t.baseUrl, bob.accessToken)]);
    try {
      const broadcast = await create();
      await t.flushNotifications();
      const [first, second] = await Promise.all([next(onA, 'system:broadcast'), next(onB, 'system:broadcast')]);
      for (const event of [first, second]) expect(event).toMatchObject({ workspaceId: null, data: { broadcastId: broadcast.id, action: 'published' } });
      await patch(broadcast.id, { message: 'خبر تازه' });
      await t.flushNotifications();
      expect((await next(onA, 'system:broadcast', (event) => event.data.action === 'updated')).data.broadcastId).toBe(broadcast.id);
      expectStatus(await t.http().delete(`/api/v1/admin/broadcasts/${broadcast.id}`).set(bearer(operator)), 204);
      await t.flushNotifications();
      expect((await next(onB, 'system:broadcast', (event) => event.data.action === 'withdrawn')).data.broadcastId).toBe(broadcast.id);
      await expect(connect(t.baseUrl, 'invalid-token')).rejects.toThrow();
    } finally {
      onA.socket.close();
      onB.socket.close();
    }
  });
});

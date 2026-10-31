import { randomUUID } from 'node:crypto';
import { Worker, type Job } from 'bullmq';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformHealth, PlatformMetrics, PlatformOutboxHealth, WorkspaceView } from '@taskin/contracts';
import { AppConfig } from '../../src/config/app-config.js';
import { PlatformAdminUnitOfWork } from '../../src/modules/platform-admin/admin-unit-of-work.js';
import { Clock } from '../../src/platform/clock/clock.js';
import { ApiError } from '../../src/platform/http/api-error.js';
import { Queues, queueConnection, queuePrefix } from '../../src/platform/queue/queues.js';
import { RedisClients } from '../../src/platform/redis/redis.js';
import { StorageService } from '../../src/platform/storage/storage.js';
import { bearer, createTestApp, ownerWithWorkspace, randomPhone, type Session, signIn, type TestApp, withAdminPassword } from './harness.js';
import { createConversation } from './chat-helpers.js';
import { createProject, createTask, expectStatus, wsPath } from './work-helpers.js';

const DAY = 24 * 3_600_000;

describe('Platform super admin, phase 4: metrics, infrastructure and queues', () => {
  let t: TestApp;
  let operator: Session;
  let operatorFresh: Session;
  let alice: Session;
  let bob: Session;
  let workspaceA: WorkspaceView;
  let workspaceB: WorkspaceView;
  let metricsKey: string;
  let now: Date;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner: alice, workspace: workspaceA } = await ownerWithWorkspace(t, 'فضای آمار نخست'));
    ({ owner: bob, workspace: workspaceB } = await ownerWithWorkspace(t, 'فضای آمار دوم'));
    operatorFresh = await signIn(t, randomPhone(), 'اپراتور زیرساخت');
    operator = await withAdminPassword(t, operatorFresh);
    await t.admin.query('update users set is_platform_admin = true where id = $1', [operator.userId]);
    const projectA = await createProject(t, alice, workspaceA.id);
    const projectB = await createProject(t, bob, workspaceB.id);
    await createTask(t, alice, workspaceA.id, { projectId: projectA.id });
    await createTask(t, alice, workspaceA.id, { projectId: projectA.id });
    await createTask(t, bob, workspaceB.id, { projectId: projectB.id });
    for (const [owner, workspace] of [[alice, workspaceA], [bob, workspaceB]] as const) {
      const conversation = await createConversation(t, owner, workspace.id, { kind: 'group', title: 'گفتگوی آمار', memberIds: [] });
      expectStatus(await t.http().post(`${wsPath(workspace.id)}/conversations/${conversation.id}/messages`).set(bearer(owner))
        .send({ clientMsgId: randomUUID(), kind: 'text', text: 'پیام آزمایشی آمار' }), 201);
    }
    await t.flushNotifications();
    now = new Date();
    t.app.get(Clock).pin(now);
    await t.admin.query('update users set created_at = $2 where id = $1', [operator.userId, new Date(now.getTime() - DAY)]);
    await t.admin.query('update users set created_at = $2 where id = $1', [alice.userId, new Date(now.getTime() - 8 * DAY)]);
    await t.admin.query('update users set created_at = $2 where id = $1', [bob.userId, new Date(now.getTime() - 31 * DAY)]);
    await t.admin.query('update auth_sessions set last_active_at = $1', [new Date(now.getTime() - 8 * DAY)]);
    await t.admin.query('update auth_sessions set last_active_at = $1 where user_id = any($2)', [new Date(now.getTime() - DAY), [operator.userId, alice.userId]]);
    await t.admin.query('update workspaces set storage_used_bytes = case when id = $1 then 100 else 250 end where id = any($2)', [workspaceA.id, [workspaceA.id, workspaceB.id]]);
    for (const [workspace, uploader, size, status] of [
      [workspaceA, alice, 100, 'ready'], [workspaceB, bob, 250, 'ready'], [workspaceA, alice, 50, 'pending'],
    ] as const) {
      const id = randomUUID();
      await t.admin.query(
        `insert into attachments (id, workspace_id, uploader_id, bucket, object_key, file_name, mime_type, kind, size_bytes, status)
         values ($1, $2, $3, $4, $5, 'آمار.pdf', 'application/pdf', 'document', $6, $7)`,
        [id, workspace.id, uploader.userId, t.env.S3_BUCKET, `ws/${workspace.id}/att/${id}`, size, status],
      );
    }
    metricsKey = t.app.get(RedisClients).key('cache', 'platform', 'metrics');
  });
  beforeEach(async () => {
    await t.redis.del(metricsKey);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    t?.app.get(Clock).pin(null);
    await t?.close();
  });

  const get = (path: string, as = operator) => t.http().get(`/api/v1/admin${path}`).set(bearer(as));
  const metrics = async (): Promise<PlatformMetrics> => {
    const response = await get('/metrics');
    expectStatus(response, 200);
    expect(response.headers['cache-control']).toBe('no-store');
    return response.body as PlatformMetrics;
  };
  const health = async (): Promise<PlatformHealth> => {
    const response = await get('/health');
    expectStatus(response, 200);
    return response.body as PlatformHealth;
  };
  const outbox = async (): Promise<PlatformOutboxHealth> => {
    const response = await get('/health/outbox');
    expectStatus(response, 200);
    return response.body as PlatformOutboxHealth;
  };

  it('keeps every diagnostic endpoint behind the platform-admin and step-up guards', async () => {
    for (const path of ['/metrics', '/health', '/health/outbox']) {
      expectStatus(await t.http().get(`/api/v1/admin${path}`), 401);
      expectStatus(await get(path, alice), 404);
      const response = await get(path, operatorFresh);
      expectStatus(response, 401);
      expect(response.body.code).toBe('STEP_UP_REQUIRED');
    }
  });

  it('aggregates users, activity, storage and content across independent workspaces', async () => {
    const result = await metrics();
    expect(result).toEqual({
      generatedAt: now.toISOString(), cached: false,
      users: { total: 3, active: 3, suspended: 0, newLast7Days: 1, newLast30Days: 2, activeLast7Days: 2 },
      workspaces: { total: 2, active: 2, suspended: 0, deleted: 0 },
      content: { readyFiles: 2, storageUsedBytes: 350, tasks: 3, messages: 2, messagesLast7Days: 2 },
    });
  });

  it('caches metrics for 60 seconds while preserving the generation time and source values', async () => {
    const first = await metrics();
    expect(await t.redis.ttl(metricsKey)).toBeGreaterThan(0);
    expect(await t.redis.ttl(metricsKey)).toBeLessThanOrEqual(60);
    await t.admin.query('update workspaces set storage_used_bytes = storage_used_bytes + 999 where id = $1', [workspaceA.id]);
    try {
      expect(await metrics()).toEqual({ ...first, cached: true });
      await t.redis.del(metricsKey);
      expect((await metrics()).content.storageUsedBytes).toBe(1_349);
    } finally {
      await t.admin.query('update workspaces set storage_used_bytes = 100 where id = $1', [workspaceA.id]);
      await t.redis.del(metricsKey);
    }
  });

  it('counts retained workspaces but excludes their deleted content and storage from live totals', async () => {
    await t.admin.query('update workspaces set deleted_at = $2 where id = $1', [workspaceB.id, now]);
    try {
      const result = await metrics();
      expect(result.workspaces).toEqual({ total: 2, active: 1, suspended: 0, deleted: 1 });
      expect(result.content).toEqual({ readyFiles: 1, storageUsedBytes: 100, tasks: 2, messages: 1, messagesLast7Days: 1 });
    } finally {
      await t.admin.query('update workspaces set deleted_at = null where id = $1', [workspaceB.id]);
    }
  });

  it('reports suspended accounts and workspaces without confusing them with deleted ones', async () => {
    await t.admin.query("update users set status = 'suspended' where id = $1", [bob.userId]);
    await t.admin.query('update workspaces set suspended_at = $2 where id = $1', [workspaceB.id, now]);
    try {
      const result = await metrics();
      expect(result.users).toMatchObject({ total: 3, active: 2, suspended: 1 });
      expect(result.workspaces).toEqual({ total: 2, active: 1, suspended: 1, deleted: 0 });
    } finally {
      await t.admin.query("update users set status = 'active' where id = $1", [bob.userId]);
      await t.admin.query('update workspaces set suspended_at = null where id = $1', [workspaceB.id]);
    }
  });

  it('rebuilds malformed or structurally invalid cached metrics from PostgreSQL', async () => {
    for (const invalid of ['{broken-json', JSON.stringify({ generatedAt: now.toISOString(), users: { total: 9_999 } })]) {
      await t.redis.set(metricsKey, invalid, 'EX', 60);
      const result = await metrics();
      expect(result.cached).toBe(false);
      expect(result.users.total).toBe(3);
      expect(result.content.storageUsedBytes).toBe(350);
    }
  });

  it('reports healthy independent dependencies and inspects SMS without sending a message', async () => {
    const sending = vi.spyOn(t.sms, 'send');
    const result = await health();
    expect(result.checkedAt).toBe(now.toISOString());
    expect(Object.keys(result.services).sort()).toEqual(['adminPool', 'database', 'redisCore', 'redisRt', 'storage']);
    for (const probe of Object.values(result.services)) {
      expect(probe.ok).toBe(true);
      expect(probe.latencyMs).toBeGreaterThanOrEqual(0);
      expect(probe).not.toHaveProperty('error');
    }
    expect(result.sms.providers).toContainEqual({ name: 'console', failures: 0, openUntil: null });
    expect(result.sms.failedJobs).toBe(0);
    expect(sending).not.toHaveBeenCalled();
  });

  it('reports failed probes independently without exposing raw error details', async () => {
    vi.spyOn(t.app.get(StorageService), 'ping').mockRejectedValueOnce(new Error('storage password=secret-value for +989121234567'));
    vi.spyOn(t.app.get(RedisClients).rt, 'ping').mockRejectedValueOnce(new Error('redis token=secret-redis'));
    const result = await health();
    expect(result.services.storage.ok).toBe(false);
    expect(result.services.redisRt.ok).toBe(false);
    expect(result.services.database.ok).toBe(true);
    expect(result.services.adminPool.ok).toBe(true);
    expect(result.services.redisCore.ok).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/secret-value|secret-redis|989121234567/);
  });

  it('distinguishes an unavailable administrative pool from healthy application infrastructure', async () => {
    vi.spyOn(t.app.get(PlatformAdminUnitOfWork), 'read').mockRejectedValueOnce(new ApiError('PLATFORM_ADMIN_UNAVAILABLE'));
    const result = await health();
    expect(result.services.adminPool.ok).toBe(false);
    expect(result.services.database.ok).toBe(true);
    vi.spyOn(t.app.get(PlatformAdminUnitOfWork), 'read').mockRejectedValueOnce(new ApiError('PLATFORM_ADMIN_UNAVAILABLE'));
    const response = await get('/metrics');
    expectStatus(response, 503);
    expect(response.body.code).toBe('PLATFORM_ADMIN_UNAVAILABLE');
  });

  it('reads only outbox bookkeeping and reports the oldest unpublished age', async () => {
    const aggregate = `test.health.${randomUUID()}`;
    await t.admin.query(
      `insert into outbox_events (aggregate_type, aggregate_id, event_type, payload, created_at, published_at)
       values ($1, 'first', 'test.health', '{"private":"must not appear"}', $2, null),
              ($1, 'second', 'test.health', '{}', $3, null), ($1, 'published', 'test.health', '{}', $2, $3)`,
      [aggregate, new Date(now.getTime() - 90_000), new Date(now.getTime() - 20_000)],
    );
    try {
      const result = await outbox();
      expect(result.pending).toEqual({ count: 2, oldestAgeSeconds: 90 });
      expect(result.queues.map((queue) => queue.name).sort()).toEqual(['maintenance', 'notifications', 'work']);
      expect(JSON.stringify(result)).not.toContain('must not appear');
      expect(result).not.toHaveProperty('payload');
    } finally {
      await t.admin.query('delete from outbox_events where aggregate_type = $1', [aggregate]);
    }
  });

  it('reports real waiting, delayed and paused BullMQ jobs in all three queues', async () => {
    const queues = t.app.get(Queues);
    const jobs: Job[] = [];
    try {
      jobs.push(await queues.notifications.add('sms.send', { headers: {}, payload: { to: '+989121234567', template: 'alert', tokens: { code: '123456' } } }));
      jobs.push(await queues.work.add('file.scan', { headers: {}, payload: { workspaceId: workspaceA.id, attachmentId: randomUUID() } }, { delay: 60_000 }));
      jobs.push(await queues.maintenance.add('test.health', {}));
      await queues.maintenance.pause();
      const result = await outbox();
      expect(result.queues.find((queue) => queue.name === 'notifications')?.counts.waiting).toBe(1);
      expect(result.queues.find((queue) => queue.name === 'work')?.counts.delayed).toBe(1);
      expect(result.queues.find((queue) => queue.name === 'maintenance')?.counts.paused).toBe(1);
      expect(result.queues.every((queue) => queue.error === undefined)).toBe(true);
    } finally {
      await queues.maintenance.resume();
      await Promise.all(jobs.map((job) => job.remove()));
    }
  });

  it('returns redacted, bounded failure summaries from a real failed job, never its data or stack', async () => {
    const queue = t.app.get(Queues).notifications;
    const config = t.app.get(AppConfig);
    const jobId = `health-${randomUUID()}`;
    const worker = new Worker(queue.name, async () => {
      throw new Error(`SMS failure for +989121234567 OTP ۴۵۶۷۸۹ token=hidden-token\n${'x'.repeat(300)}`);
    }, { connection: queueConnection(config), prefix: queuePrefix(config), autorun: false });
    let rejectFailure: (error: Error) => void = () => undefined;
    const failed = new Promise<void>((resolve, reject) => {
      rejectFailure = reject;
      worker.on('failed', (job) => { if (job?.id === jobId) resolve(); });
      worker.on('error', reject);
    });
    let job: Job | undefined;
    try {
      await worker.waitUntilReady();
      job = await queue.add('sms.send', { headers: {}, payload: { to: '+989121234567', template: 'alert', tokens: { code: 'secret-job-data' } } }, { jobId, attempts: 1 });
      void worker.run().catch(rejectFailure);
      await failed;
      const result = await outbox();
      const diagnostics = result.queues.find((entry) => entry.name === 'notifications');
      expect(diagnostics?.counts.failed).toBe(1);
      expect(diagnostics?.recentFailures).toHaveLength(1);
      const failure = diagnostics?.recentFailures[0];
      expect(failure).toMatchObject({ name: 'sms.send', attempts: 1 });
      expect(failure?.failedAt).not.toBeNull();
      expect(failure?.reason.length).toBeLessThanOrEqual(200);
      expect(failure?.reason).not.toMatch(/\p{Nd}{4,}|hidden-token|[\r\n\t]/u);
      expect(JSON.stringify(result)).not.toMatch(/secret-job-data|989121234567|stacktrace/);
      expect((await health()).sms.failedJobs).toBe(1);
    } finally {
      await worker.close();
      await job?.remove();
    }
  });

  it('keeps other queue diagnostics available when one queue read fails', async () => {
    vi.spyOn(t.app.get(Queues).maintenance, 'getJobCounts').mockRejectedValueOnce(new Error('queue secret=hidden-queue-value'));
    const result = await outbox();
    expect(result.queues.find((entry) => entry.name === 'maintenance')?.error).toBeDefined();
    expect(result.queues.find((entry) => entry.name === 'work')?.error).toBeUndefined();
    expect(result.queues.find((entry) => entry.name === 'notifications')?.error).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('hidden-queue-value');
  });
});

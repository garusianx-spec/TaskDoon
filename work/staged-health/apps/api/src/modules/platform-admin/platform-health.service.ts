import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { sql } from 'drizzle-orm';
import type { QueryConfig } from 'pg';
import type { PlatformHealth, PlatformMetrics, PlatformOutboxHealth, PlatformProbe, PlatformQueueHealth } from '@taskin/contracts';
import { Clock } from '../../platform/clock/clock.js';
import { Database } from '../../platform/db/database.js';
import { isoOrNull, num } from '../../platform/db/rows.js';
import { Queues } from '../../platform/queue/queues.js';
import { RedisClients } from '../../platform/redis/redis.js';
import { SmsService } from '../../platform/sms/sms.js';
import { StorageService } from '../../platform/storage/storage.js';
import { PlatformAdminUnitOfWork } from './admin-unit-of-work.js';
import type { PlatformAdmin } from './platform-admin.guard.js';

const PROBE_TIMEOUT_MS = 2_000;
const METRICS_TTL_SECONDS = 60;
const RECENT_FAILURES_LIMIT = 10;
const QUEUE_STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

class HealthTimeoutError extends Error {
  constructor() {
    super('Dependency timed out');
    this.name = 'HealthTimeoutError';
  }
}

/** Bound the response and clear its timer; downstream probes cancel where supported. */
export async function withHealthTimeout<T>(check: () => Promise<T>, timeoutMs = PROBE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HealthTimeoutError()), timeoutMs);
    timer.unref();
  });
  try {
    return await Promise.race([Promise.resolve().then(check), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Failure summaries are never job data, stacks, recipients, links or credentials. */
export function redactQueueFailure(reason: string): string {
  return reason
    .replace(/https?:\/\/\S+/giu, '[link]')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/gu, '[email]')
    .replace(/\bbearer\s+\S+/giu, 'Bearer [redacted]')
    .replace(/\b(password|token|secret|api[_-]?key|authorization)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, '$1=[redacted]')
    .replace(/\p{Nd}{4,}/gu, '****')
    .replace(/[\r\n\t]+/gu, ' ')
    .slice(0, 200);
}

interface MetricsRow extends Record<string, unknown> {
  users_total: string;
  users_active: string;
  users_suspended: string;
  users_new_7: string;
  users_new_30: string;
  users_active_7: string;
  workspaces_total: string;
  workspaces_active: string;
  workspaces_suspended: string;
  workspaces_deleted: string;
  storage_used: string;
  ready_files: string;
  tasks: string;
  messages: string;
  messages_7: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function counts(value: unknown, keys: readonly string[]): boolean {
  return record(value) && keys.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]) && (value[key] as number) >= 0);
}

function cachedMetrics(value: unknown): value is PlatformMetrics {
  return (
    record(value) &&
    typeof value.generatedAt === 'string' &&
    Number.isFinite(Date.parse(value.generatedAt)) &&
    counts(value.users, ['total', 'active', 'suspended', 'newLast7Days', 'newLast30Days', 'activeLast7Days']) &&
    counts(value.workspaces, ['total', 'active', 'suspended', 'deleted']) &&
    counts(value.content, ['readyFiles', 'storageUsedBytes', 'tasks', 'messages', 'messagesLast7Days'])
  );
}

function emptyQueueCounts(): PlatformQueueHealth['counts'] {
  return { waiting: 0, active: 0, delayed: 0, failed: 0, paused: 0 };
}

/** Admin-only, cross-workspace read models. Every SQL read uses the isolated read-only pool. */
@Injectable()
export class PlatformHealthService {
  private readonly logger = new Logger('PlatformHealthService');
  private loadingMetrics: Promise<PlatformMetrics> | null = null;

  constructor(
    private readonly admins: PlatformAdminUnitOfWork,
    private readonly database: Database,
    private readonly redis: RedisClients,
    private readonly storage: StorageService,
    private readonly sms: SmsService,
    private readonly queues: Queues,
    private readonly clock: Clock,
  ) {}

  async metrics(admin: PlatformAdmin): Promise<PlatformMetrics> {
    try {
      const cached = await withHealthTimeout(() => this.redis.core.get(this.metricsKey()));
      if (cached) {
        const parsed: unknown = JSON.parse(cached);
        if (cachedMetrics(parsed)) return { ...parsed, cached: true };
        this.logger.warn({ event: 'platform.metrics.cache.invalid' }, 'Ignoring invalid platform metrics cache');
      }
    } catch (error) {
      this.warn('platform.metrics.cache.read_failed', 'redisCore', error);
    }

    // Concurrent misses on this node share one aggregation and cache write.
    this.loadingMetrics ??= this.loadMetrics(admin);
    try {
      return await this.loadingMetrics;
    } finally {
      this.loadingMetrics = null;
    }
  }

  async health(admin: PlatformAdmin): Promise<PlatformHealth> {
    const [database, adminPool, redisCore, redisRt, storage, failedJobs] = await Promise.all([
      this.probe('database', async () => {
        // node-postgres supports a per-query read timeout; @types/pg omits this runtime field.
        const query: QueryConfig & { query_timeout: number } = { text: 'select 1', query_timeout: PROBE_TIMEOUT_MS };
        await this.database.pool.query(query);
      }),
      this.probe('adminPool', () =>
        this.admins.read(admin, async (tx) => {
          await tx.execute(sql`select set_config('statement_timeout', ${String(PROBE_TIMEOUT_MS)}, true)`);
          await tx.execute(sql`select 1`);
        }),
      ),
      this.probe('redisCore', async () => void (await this.redis.core.ping())),
      this.probe('redisRt', async () => void (await this.redis.rt.ping())),
      this.probe('storage', () => this.storage.ping(AbortSignal.timeout(PROBE_TIMEOUT_MS))),
      this.notificationFailures(),
    ]);
    return {
      checkedAt: this.clock.now().toISOString(),
      services: { database, adminPool, redisCore, redisRt, storage },
      sms: { providers: this.sms.status(), failedJobs },
    };
  }

  async outbox(admin: PlatformAdmin): Promise<PlatformOutboxHealth> {
    const [pending, ...queues] = await Promise.all([
      withHealthTimeout(() =>
        this.admins.read(admin, async (tx) => {
          await tx.execute(sql`select set_config('statement_timeout', ${String(PROBE_TIMEOUT_MS)}, true)`);
          // Only the granted bookkeeping columns; event payloads/headers never enter this read model.
          const { rows } = await tx.execute<{ count: string; oldest: string | null }>(
            sql`select count(id) as count, min(created_at) as oldest from outbox_events where published_at is null`,
          );
          const oldest = isoOrNull(rows[0]?.oldest);
          return {
            count: num(rows[0]?.count),
            oldestAgeSeconds: oldest ? Math.max(0, Math.floor((this.clock.now().getTime() - Date.parse(oldest)) / 1_000)) : 0,
          };
        }),
      ),
      this.queueHealth('notifications', this.queues.notifications),
      this.queueHealth('work', this.queues.work),
      this.queueHealth('maintenance', this.queues.maintenance),
    ]);
    return { checkedAt: this.clock.now().toISOString(), pending, queues };
  }

  private metricsKey(): string {
    return this.redis.key('cache', 'platform', 'metrics');
  }

  private async loadMetrics(admin: PlatformAdmin): Promise<PlatformMetrics> {
    const now = this.clock.now();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3_600_000).toISOString();
    const row = await this.admins.read(admin, async (tx) => {
      // Retained users/workspaces contribute to totals. Live content and storage exclude trash.
      // Each aggregate returns one row; no row-dependent queries or content/PII projection.
      const { rows } = await tx.execute<MetricsRow>(sql`
        select u.*, w.*, m.*,
          (select count(distinct s.user_id) from auth_sessions s join users a on a.id = s.user_id
            where s.last_active_at >= ${sevenDaysAgo}::timestamptz and a.status = 'active' and a.deleted_at is null) as users_active_7,
          (select count(a.id) from attachments a join workspaces v on v.id = a.workspace_id
            where a.status = 'ready' and a.deleted_at is null and v.deleted_at is null) as ready_files,
          (select count(t.id) from tasks t join workspaces v on v.id = t.workspace_id
            where t.deleted_at is null and v.deleted_at is null) as tasks
        from (
          select count(*) as users_total,
            count(*) filter (where status = 'active' and deleted_at is null) as users_active,
            count(*) filter (where status = 'suspended' and deleted_at is null) as users_suspended,
            count(*) filter (where created_at >= ${sevenDaysAgo}::timestamptz) as users_new_7,
            count(*) filter (where created_at >= ${thirtyDaysAgo}::timestamptz) as users_new_30
          from users
        ) u cross join (
          select count(*) as workspaces_total,
            count(*) filter (where deleted_at is null and suspended_at is null) as workspaces_active,
            count(*) filter (where deleted_at is null and suspended_at is not null) as workspaces_suspended,
            count(*) filter (where deleted_at is not null) as workspaces_deleted,
            coalesce(sum(storage_used_bytes) filter (where deleted_at is null), 0) as storage_used
          from workspaces
        ) w cross join (
          select count(m.id) as messages, count(m.id) filter (where m.created_at >= ${sevenDaysAgo}::timestamptz) as messages_7
          from messages m join workspaces v on v.id = m.workspace_id
          where m.deleted_at is null and v.deleted_at is null
        ) m
      `);
      const row = rows[0];
      if (!row) throw new Error('Platform metrics aggregation returned no row');
      return row;
    });
    const metrics: PlatformMetrics = {
      generatedAt: now.toISOString(),
      cached: false,
      users: {
        total: num(row.users_total),
        active: num(row.users_active),
        suspended: num(row.users_suspended),
        newLast7Days: num(row.users_new_7),
        newLast30Days: num(row.users_new_30),
        activeLast7Days: num(row.users_active_7),
      },
      workspaces: {
        total: num(row.workspaces_total),
        active: num(row.workspaces_active),
        suspended: num(row.workspaces_suspended),
        deleted: num(row.workspaces_deleted),
      },
      content: {
        readyFiles: num(row.ready_files),
        storageUsedBytes: num(row.storage_used),
        tasks: num(row.tasks),
        messages: num(row.messages),
        messagesLast7Days: num(row.messages_7),
      },
    };
    try {
      await withHealthTimeout(() => this.redis.core.set(this.metricsKey(), JSON.stringify(metrics), 'EX', METRICS_TTL_SECONDS));
    } catch (error) {
      this.warn('platform.metrics.cache.write_failed', 'redisCore', error);
    }
    return metrics;
  }

  private async probe(dependency: string, check: () => Promise<void>): Promise<PlatformProbe> {
    const startedAt = performance.now();
    try {
      await withHealthTimeout(check);
      return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      this.warn('platform.health.probe_failed', dependency, error);
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - startedAt),
        error: error instanceof HealthTimeoutError ? 'Dependency timed out' : 'Dependency unavailable',
      };
    }
  }

  private async notificationFailures(): Promise<number | null> {
    try {
      const failures = await withHealthTimeout(() => this.queues.notifications.getJobCounts('failed'));
      return failures.failed ?? 0;
    } catch (error) {
      this.warn('platform.health.notification_queue_failed', 'notifications', error);
      return null;
    }
  }

  private async queueHealth(name: PlatformQueueHealth['name'], queue: Pick<Queue, 'getJobCounts' | 'getFailed' | 'isPaused'>): Promise<PlatformQueueHealth> {
    try {
      const [counts, failures, paused] = await withHealthTimeout(() =>
        Promise.all([queue.getJobCounts(...QUEUE_STATES), queue.getFailed(0, RECENT_FAILURES_LIMIT - 1), queue.isPaused()]),
      );
      // BullMQ 6 keeps jobs in `wait` when paused and records pause state in queue metadata.
      const waiting = counts.waiting ?? 0;
      return {
        name,
        counts: { waiting: paused ? 0 : waiting, active: counts.active ?? 0, delayed: counts.delayed ?? 0, failed: counts.failed ?? 0, paused: paused ? waiting : 0 },
        recentFailures: failures.map((job) => ({
          name: redactQueueFailure(job.name),
          attempts: job.attemptsMade,
          failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          reason: redactQueueFailure(job.failedReason),
        })),
      };
    } catch (error) {
      this.warn('platform.queue.health_failed', name, error);
      return { name, counts: emptyQueueCounts(), recentFailures: [], error: error instanceof HealthTimeoutError ? 'Queue timed out' : 'Queue unavailable' };
    }
  }

  private warn(event: string, dependency: string, error: unknown): void {
    this.logger.warn({ event, dependency, errorType: error instanceof Error ? error.name : 'UnknownError' }, 'Platform monitoring dependency unavailable');
  }
}

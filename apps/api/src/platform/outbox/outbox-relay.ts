import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { and, asc, inArray, isNull, lt, sql } from 'drizzle-orm';
import pg from 'pg';
import { AppConfig } from '../../config/app-config.js';
import { Database } from '../db/database.js';
import { outboxEvents } from '../db/schema/all.js';
import { type JobHeaders, type NotificationJobs, Queues, type WorkJobs } from '../queue/queues.js';
import { realtimeFor } from '../realtime/outbox-realtime.js';
import { RealtimePublisher } from '../realtime/realtime-publisher.js';
import type { OutboxEventMap, OutboxEventType } from './outbox-writer.js';

type OutboxRow = typeof outboxEvents.$inferSelect;

type Publication =
  | { readonly queue: 'notifications'; readonly name: keyof NotificationJobs; readonly payload: NotificationJobs[keyof NotificationJobs] }
  | {
      readonly queue: 'work';
      readonly name: keyof WorkJobs;
      readonly payload: WorkJobs[keyof WorkJobs];
      /** Overrides the event-derived id (reminders are keyed by event version). */
      readonly jobId?: string;
      readonly delay?: number;
    };

/** The events whose side effects land in inboxes and the activity feed. */
const FEED_EVENTS: ReadonlySet<OutboxEventType> = new Set([
  'task.assigned',
  'task.status_changed',
  'task.commented',
  'task.file_attached',
  'member.joined',
  'message.posted',
]);

/** What each event turns into. Events without work (yet) are simply marked published. */
export function publicationsFor(row: OutboxRow, now: number): readonly Publication[] {
  const type = row.eventType as OutboxEventType;
  if (FEED_EVENTS.has(type) && row.workspaceId) {
    return [
      {
        queue: 'work',
        name: 'feed.fanout',
        payload: { eventId: row.id, workspaceId: row.workspaceId, type, actorId: row.headers.actorId ?? null, payload: row.payload },
      },
    ];
  }
  switch (type) {
    case 'notification.sms':
      return [{ queue: 'notifications', name: 'sms.send', payload: row.payload as unknown as OutboxEventMap['notification.sms'] }];
    case 'notification.email':
      return [{ queue: 'notifications', name: 'mail.send', payload: row.payload as unknown as OutboxEventMap['notification.email'] }];
    case 'file.uploaded': {
      const payload = row.payload as unknown as OutboxEventMap['file.uploaded'];
      return row.workspaceId ? [{ queue: 'work', name: 'file.scan', payload: { workspaceId: row.workspaceId, attachmentId: payload.attachmentId } }] : [];
    }
    case 'calendar.event.changed': {
      const payload = row.payload as unknown as OutboxEventMap['calendar.event.changed'];
      if (!payload.remindAt || !row.workspaceId) return [];
      return [
        {
          queue: 'work',
          name: 'event.remind',
          payload: { workspaceId: row.workspaceId, eventId: payload.eventId, version: payload.version },
          // One job per event version: an edit schedules a new one, and the old one no-ops.
          jobId: `event-${payload.eventId}-v${payload.version}`,
          delay: Math.max(0, Date.parse(payload.remindAt) - now),
        },
      ];
    }
    case 'message.scheduled': {
      const payload = row.payload as unknown as OutboxEventMap['message.scheduled'];
      if (!row.workspaceId) return [];
      return [
        {
          queue: 'work',
          name: 'message.dispatch',
          payload: { workspaceId: row.workspaceId, scheduledId: payload.scheduledId, authorId: payload.authorId },
          // One job per schedule; the sweep covers a job that is lost.
          jobId: `scheduled-${payload.scheduledId}`,
          delay: Math.max(0, Date.parse(payload.scheduledAt) - now),
        },
      ];
    }
    // Everything else is realtime only (see realtimeFor), or nothing yet.
    default:
      return [];
  }
}

const BATCH = 200;
const POLL_MS = 2_000;
const CAMPAIGN_RETRY_MS = 5_000;

/**
 * Publishes committed outbox rows, oldest first, exactly one relay at a time: side-effect jobs to
 * BullMQ, then realtime events and room operations to the WebSocket nodes. Leadership is a
 * session advisory lock on a direct connection (not through PgBouncer, which cannot hold session
 * state), which also carries LISTEN for instant wake-ups; a slow poll covers a missed notify.
 *
 * Delivery is at-least-once: a crash between publishing and stamping `published_at` republishes
 * the batch, and BullMQ drops the duplicates because every job id is derived from the event id.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('OutboxRelay');
  private stopped = false;
  private leaderClient?: pg.Client;
  private draining?: Promise<void>;
  private again = false;
  private poll?: NodeJS.Timeout;
  private releaseLeadership?: () => void;

  constructor(
    private readonly config: AppConfig,
    private readonly database: Database,
    private readonly queues: Queues,
    private readonly realtime: RealtimePublisher,
  ) {}

  get isLeader(): boolean {
    return this.leaderClient !== undefined;
  }

  onApplicationBootstrap(): void {
    if (!this.config.env.OUTBOX_RELAY_ENABLED) return;
    void this.campaign();
    this.poll = setInterval(() => this.kick(), POLL_MS);
    this.poll.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.poll) clearInterval(this.poll);
    this.releaseLeadership?.();
    await this.draining;
    await this.leaderClient?.end().catch(() => undefined);
  }

  /** Publishes everything unpublished right now. Returns how many events it handled. */
  async drainOnce(): Promise<number> {
    const rows = await this.database.db
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.publishedAt))
      .orderBy(asc(outboxEvents.id))
      .limit(BATCH);
    if (rows.length === 0) return 0;

    const now = Date.now();
    const publications = rows.flatMap((row) => publicationsFor(row, now).map((publication) => ({ row, publication })));
    const job = ({ row, publication }: (typeof publications)[number]) => ({
      name: publication.name,
      data: {
        headers: { requestId: row.headers.requestId, traceId: row.headers.traceId, eventId: row.id } satisfies JobHeaders,
        payload: publication.payload,
      },
      opts: {
        jobId: (publication.queue === 'work' && publication.jobId) || `evt-${row.id}-${publication.name}`,
        ...(publication.queue === 'work' && publication.delay ? { delay: publication.delay } : {}),
      },
    });
    const notifications = publications.filter((entry) => entry.publication.queue === 'notifications').map(job);
    const work = publications.filter((entry) => entry.publication.queue === 'work').map(job);
    if (notifications.length > 0) await this.queues.notifications.addBulk(notifications as Parameters<Queues['notifications']['addBulk']>[0]);
    if (work.length > 0) await this.queues.work.addBulk(work as Parameters<Queues['work']['addBulk']>[0]);
    // Realtime last and best effort: clients recover a lost event by replay or refetch.
    await this.realtime.publish(rows.flatMap((row) => realtimeFor(row)));

    await this.database.db
      .update(outboxEvents)
      .set({ publishedAt: sql`now()` })
      .where(inArray(outboxEvents.id, rows.map((row) => row.id)));
    return rows.length;
  }

  /** Seconds the oldest unpublished event has waited: the lag metric the RFC alerts on. */
  async lagSeconds(): Promise<number> {
    const [row] = await this.database.db
      .select({ lag: sql<number>`coalesce(extract(epoch from now() - min(${outboxEvents.createdAt})), 0)::float8` })
      .from(outboxEvents)
      .where(isNull(outboxEvents.publishedAt));
    return row?.lag ?? 0;
  }

  /** Deletes rows published more than `days` ago. */
  async purgePublished(days = 7): Promise<number> {
    const deleted = await this.database.db
      .delete(outboxEvents)
      .where(and(lt(outboxEvents.publishedAt, sql`now() - make_interval(days => ${days})`)))
      .returning({ id: outboxEvents.id });
    return deleted.length;
  }

  private kick(): void {
    if (!this.isLeader || this.stopped) return;
    if (this.draining) {
      this.again = true;
      return;
    }
    this.draining = (async () => {
      try {
        do {
          this.again = false;
          while ((await this.drainOnce()) === BATCH && !this.stopped);
        } while (this.again && !this.stopped);
      } catch (error) {
        this.logger.error({ error: error instanceof Error ? error.message : String(error) }, 'outbox drain failed');
      } finally {
        this.draining = undefined;
      }
    })();
  }

  private async campaign(): Promise<void> {
    while (!this.stopped) {
      const client = new pg.Client({
        connectionString: this.config.env.DATABASE_DIRECT_URL ?? this.config.env.DATABASE_URL,
        application_name: 'taskin-outbox-relay',
      });
      try {
        await client.connect();
        const lock = await client.query<{ ok: boolean }>(
          `select pg_try_advisory_lock(hashtextextended('taskin:outbox-relay', 0)) as ok`,
        );
        if (!lock.rows[0]?.ok) {
          await client.end();
          await sleep(CAMPAIGN_RETRY_MS);
          continue;
        }
        const lost = new Promise<void>((resolve) => {
          this.releaseLeadership = resolve;
          client.once('error', () => resolve());
          client.once('end', () => resolve());
        });
        client.on('notification', () => this.kick());
        await client.query('LISTEN outbox');
        this.leaderClient = client;
        this.logger.log('outbox relay is the leader');
        this.kick();
        await lost;
      } catch (error) {
        this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'outbox relay campaign failed');
      } finally {
        this.leaderClient = undefined;
        await client.end().catch(() => undefined);
      }
      if (!this.stopped) await sleep(CAMPAIGN_RETRY_MS);
    }
  }
}

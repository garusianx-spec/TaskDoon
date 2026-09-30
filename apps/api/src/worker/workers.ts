import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';
import { lt, or, sql } from 'drizzle-orm';
import { AppConfig } from '../config/app-config.js';
import { RequestContext } from '../platform/context/request-context.js';
import { SecretBox } from '../platform/crypto/crypto.js';
import { Database } from '../platform/db/database.js';
import { idempotencyKeys, otpChallenges } from '../platform/db/schema/all.js';
import { MailService } from '../platform/mail/mail.js';
import { OutboxRelay } from '../platform/outbox/outbox-relay.js';
import {
  type MaintenanceJob,
  type NotificationJobData,
  type NotificationJobs,
  QUEUE_NAMES,
  queueConnection,
  queuePrefix,
  Queues,
  type WorkJobData,
  type WorkJobs,
} from '../platform/queue/queues.js';
import { SmsService } from '../platform/sms/sms.js';
import { ScheduledMessagesService } from '../modules/chat/scheduled-messages.service.js';
import { CalendarService } from '../modules/content/calendar.service.js';
import { FeedService } from '../modules/content/feed.service.js';
import { FilesService } from '../modules/content/files.service.js';
import { ProjectsService } from '../modules/work/projects.service.js';
import { MembersService } from '../modules/workspaces/members.service.js';
import { WorkspacesService } from '../modules/workspaces/workspaces.service.js';

/** Opens the sealed values (invitation links) only at the moment of sending. */
function unseal(values: Readonly<Record<string, string>>, sealed: readonly string[] | undefined, box: SecretBox): Record<string, string> {
  const open: Record<string, string> = { ...values };
  for (const key of sealed ?? []) {
    const value = open[key];
    if (value) open[key] = box.open(value);
  }
  return open;
}

function inviteMail(params: Readonly<Record<string, string>>): { subject: string; text: string; html: string } {
  const workspace = params.workspace ?? '';
  const link = params.link ?? '';
  const note = params.message ? `\n\n«${params.message}»` : '';
  return {
    subject: `دعوت به فضای کاری «${workspace}» در تسک‌دون`,
    text: `شما به فضای کاری «${workspace}» در تسک‌دون دعوت شده‌اید.${note}\n\nبرای پیوستن: ${link}\n\nاین پیوند تا هفت روز معتبر است.`,
    html: `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif"><p>شما به فضای کاری «${escapeHtml(workspace)}» در تسک‌دون دعوت شده‌اید.</p>${
      params.message ? `<blockquote>${escapeHtml(params.message)}</blockquote>` : ''
    }<p><a href="${escapeHtml(link)}">پیوستن به فضای کاری</a></p><p>این پیوند تا هفت روز معتبر است.</p></div>`,
  };
}

/** A password reset link a platform admin sent (single use; it expires). */
function resetMail(params: Readonly<Record<string, string>>): { subject: string; text: string; html: string } {
  const link = params.link ?? '';
  return {
    subject: 'بازنشانی رمز عبور تسک‌دون',
    text: `برای گذاشتن رمز عبور تازه در تسک‌دون این پیوند را باز کنید: ${link}\n\nپیوند یک بار کار می‌کند و به‌زودی منقضی می‌شود. اگر این درخواست از شما نبوده، به مدیر سازمان خبر دهید.`,
    html: `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif"><p>برای گذاشتن رمز عبور تازه در تسک‌دون این پیوند را باز کنید:</p><p><a href="${escapeHtml(link)}">گذاشتن رمز عبور تازه</a></p><p>پیوند یک بار کار می‌کند و به‌زودی منقضی می‌شود. اگر این درخواست از شما نبوده، به مدیر سازمان خبر دهید.</p></div>`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

/**
 * Sends the SMS and email that outbox events asked for. Each job runs in its own request context
 * carrying the originating request id and trace id, so its logs line up with the request's.
 */
@Injectable()
export class NotificationsProcessor {
  constructor(
    private readonly sms: SmsService,
    private readonly mail: MailService,
    private readonly box: SecretBox,
  ) {}

  async handle<N extends keyof NotificationJobs>(name: N, data: NotificationJobData<N>): Promise<void> {
    switch (name) {
      case 'sms.send': {
        const payload = data.payload as NotificationJobs['sms.send'];
        await this.sms.send({ to: payload.to, template: payload.template, tokens: unseal(payload.tokens, payload.sealed, this.box) });
        return;
      }
      case 'mail.send': {
        const payload = data.payload as NotificationJobs['mail.send'];
        const params = unseal(payload.params, payload.sealed, this.box);
        await this.mail.send({ to: payload.to, ...(payload.template === 'password_reset' ? resetMail(params) : inviteMail(params)) });
        return;
      }
    }
  }
}

/** Domain side effects of outbox events: inbox and feed fan-out, file scanning, reminders, scheduled messages. */
@Injectable()
export class WorkProcessor {
  constructor(
    private readonly feed: FeedService,
    private readonly files: FilesService,
    private readonly calendar: CalendarService,
    private readonly scheduled: ScheduledMessagesService,
  ) {}

  async handle<N extends keyof WorkJobs>(name: N, data: WorkJobData<N>): Promise<unknown> {
    switch (name) {
      case 'feed.fanout':
        return this.feed.fanout(data.payload as WorkJobs['feed.fanout']);
      case 'file.scan': {
        const payload = data.payload as WorkJobs['file.scan'];
        return this.files.scan(payload.workspaceId, payload.attachmentId);
      }
      case 'event.remind': {
        const payload = data.payload as WorkJobs['event.remind'];
        return this.calendar.remind(payload.workspaceId, payload.eventId, payload.version);
      }
      case 'message.dispatch': {
        const payload = data.payload as WorkJobs['message.dispatch'];
        return this.scheduled.dispatch(payload.workspaceId, payload.scheduledId, payload.authorId);
      }
      default:
        return undefined;
    }
  }
}

@Injectable()
export class MaintenanceProcessor {
  private readonly logger = new Logger('Maintenance');

  constructor(
    private readonly database: Database,
    private readonly workspaces: WorkspacesService,
    private readonly relay: OutboxRelay,
    private readonly files: FilesService,
    private readonly projects: ProjectsService,
    private readonly members: MembersService,
    private readonly scheduled: ScheduledMessagesService,
  ) {}

  async handle(name: MaintenanceJob): Promise<unknown> {
    switch (name) {
      case 'audit.partitions': {
        const result = await this.database.db.execute<{ created: number; dropped: number }>(
          sql`select app.ensure_audit_partitions(3) as created, app.drop_expired_audit_partitions(12) as dropped`,
        );
        return result.rows[0];
      }
      case 'workspace.purge':
        return { purged: await this.workspaces.purgeDue() };
      case 'projects.purge':
        return { purged: await this.projects.purgeDue() };
      case 'members.purge':
        return { purged: await this.members.purgeDeparted() };
      case 'files.gc':
        return this.files.collectGarbage();
      case 'scheduled.sweep':
        return this.scheduled.dispatchDue();
      case 'cleanup': {
        const challenges = await this.database.db
          .delete(otpChallenges)
          .where(lt(otpChallenges.createdAt, sql`now() - interval '24 hours'`))
          .returning({ id: otpChallenges.id });
        const keys = await this.database.db
          .delete(idempotencyKeys)
          .where(or(lt(idempotencyKeys.expiresAt, sql`now()`)))
          .returning({ key: idempotencyKeys.key });
        const events = await this.relay.purgePublished(7);
        const lag = await this.relay.lagSeconds();
        if (lag > 5) this.logger.warn({ lagSeconds: lag }, 'outbox is lagging');
        return { challenges: challenges.length, idempotencyKeys: keys.length, outboxEvents: events, outboxLagSeconds: lag };
      }
    }
  }
}

/** Runs the BullMQ workers and registers the maintenance schedules (worker and all roles). */
@Injectable()
export class QueueWorkers implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('QueueWorkers');
  private workers: Worker[] = [];

  constructor(
    private readonly config: AppConfig,
    private readonly queues: Queues,
    private readonly context: RequestContext,
    private readonly notifications: NotificationsProcessor,
    private readonly work: WorkProcessor,
    private readonly maintenance: MaintenanceProcessor,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.env.QUEUE_WORKERS_ENABLED) return;
    const options = { connection: queueConnection(this.config), prefix: queuePrefix(this.config) };
    this.workers = [
      new Worker<NotificationJobData>(
        QUEUE_NAMES.notifications,
        (job) => this.runNotification(job.name as keyof NotificationJobs, job.data),
        { ...options, concurrency: 8 },
      ),
      new Worker<WorkJobData, unknown>(QUEUE_NAMES.work, (job) => this.runWork(job.name as keyof WorkJobs, job.data), { ...options, concurrency: 8 }),
      new Worker<Record<string, never>, unknown>(
        QUEUE_NAMES.maintenance,
        (job) => this.context.run({}, () => this.maintenance.handle(job.name as MaintenanceJob)),
        { ...options, concurrency: 1 },
      ),
    ];
    for (const worker of this.workers) {
      worker.on('failed', (job, error) => this.logger.warn({ queue: worker.name, job: job?.name, attempts: job?.attemptsMade, error: error.message }, 'job failed'));
      worker.on('error', (error) => this.logger.warn({ queue: worker.name, error: error.message }, 'worker error'));
    }
    await this.queues.maintenance.upsertJobScheduler('audit-partitions', { every: 24 * 3600 * 1000 }, { name: 'audit.partitions' });
    await this.queues.maintenance.upsertJobScheduler('workspace-purge', { every: 10 * 60 * 1000 }, { name: 'workspace.purge' });
    await this.queues.maintenance.upsertJobScheduler('projects-purge', { every: 3600 * 1000 }, { name: 'projects.purge' });
    await this.queues.maintenance.upsertJobScheduler('members-purge', { every: 3600 * 1000 }, { name: 'members.purge' });
    await this.queues.maintenance.upsertJobScheduler('cleanup', { every: 3600 * 1000 }, { name: 'cleanup' });
    await this.queues.maintenance.upsertJobScheduler('files-gc', { every: 3600 * 1000 }, { name: 'files.gc' });
    await this.queues.maintenance.upsertJobScheduler('scheduled-sweep', { every: 60 * 1000 }, { name: 'scheduled.sweep' });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(this.workers.map((worker) => worker.close()));
  }

  /** One work job, in a context carrying the request id and trace id that caused it. */
  runWork(name: keyof WorkJobs, data: WorkJobData): Promise<unknown> {
    return this.context.run({ requestId: data.headers.requestId, traceId: data.headers.traceId }, () => this.work.handle(name, data));
  }

  /** One notification job, in a context carrying the request id and trace id that caused it. */
  runNotification(name: keyof NotificationJobs, data: NotificationJobData): Promise<void> {
    return this.context.run({ requestId: data.headers.requestId, traceId: data.headers.traceId }, () => this.notifications.handle(name, data));
  }
}

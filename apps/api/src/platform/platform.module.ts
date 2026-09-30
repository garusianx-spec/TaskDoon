import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { AuditWriter } from './audit/audit-writer.js';
import { Clock } from './clock/clock.js';
import { RequestContext } from './context/request-context.js';
import { SecretBox } from './crypto/crypto.js';
import { Database } from './db/database.js';
import { UnitOfWork } from './db/unit-of-work.js';
import { MailService } from './mail/mail.js';
import { OutboxWriter } from './outbox/outbox-writer.js';
import { Queues } from './queue/queues.js';
import { EventStream } from './realtime/event-stream.js';
import { PresenceDirectory } from './realtime/presence-directory.js';
import { RealtimePublisher } from './realtime/realtime-publisher.js';
import { RedisClients } from './redis/redis.js';
import { SmsService } from './sms/sms.js';
import { StorageService } from './storage/storage.js';

const providers = [
  Clock,
  RequestContext,
  Database,
  UnitOfWork,
  RedisClients,
  AuditWriter,
  OutboxWriter,
  Queues,
  SmsService,
  MailService,
  StorageService,
  EventStream,
  RealtimePublisher,
  PresenceDirectory,
  { provide: SecretBox, inject: [AppConfig], useFactory: (config: AppConfig) => new SecretBox(config.env.APP_ENCRYPTION_KEY) },
];

/** Infrastructure every role needs: database, Redis, queues, storage, SMS, mail, audit, outbox, realtime publishing. */
@Global()
@Module({ providers, exports: providers })
export class PlatformModule {}

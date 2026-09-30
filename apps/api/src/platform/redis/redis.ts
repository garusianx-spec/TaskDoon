import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis as IORedis } from 'ioredis';
import { AppConfig } from '../../config/app-config.js';

/**
 * The two Redis deployments (RFC §2.4). `core` is durable (AOF, noeviction): rate limits,
 * idempotency, revocations, permission caches, BullMQ. `rt` is disposable: Socket.IO fan-out,
 * presence, typing. Auth paths that need `core` fail closed when it is down; caches fail open.
 */
@Injectable()
export class RedisClients implements OnModuleDestroy {
  readonly core: IORedis;
  readonly rt: IORedis;
  private readonly prefix: string;

  constructor(config: AppConfig) {
    this.prefix = config.redisPrefix;
    const options = { maxRetriesPerRequest: 2, enableOfflineQueue: true, connectTimeout: 5_000 };
    this.core = new IORedis(config.env.REDIS_CORE_URL, { ...options, connectionName: 'taskin-core' });
    this.rt = new IORedis(config.env.REDIS_RT_URL, { ...options, connectionName: 'taskin-rt' });
    // Connection errors surface on the next command; without a listener ioredis logs every retry.
    this.core.on('error', () => undefined);
    this.rt.on('error', () => undefined);
  }

  /** `taskin:otp:send:phone:+98…`: every key this deployment owns lives under its prefix. */
  key(...parts: readonly (string | number)[]): string {
    return [this.prefix, ...parts].join(':');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.core.quit(), this.rt.quit()]);
  }
}

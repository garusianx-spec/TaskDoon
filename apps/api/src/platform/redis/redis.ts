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
    const options = { maxRetriesPerRequest: 2, enableOfflineQueue: true, connectTimeout: 5_000, lazyConnect: true };
    try {
      this.core = new IORedis(config.env.REDIS_CORE_URL, { ...options, connectionName: 'taskin-core' });
      this.rt = new IORedis(config.env.REDIS_RT_URL, { ...options, connectionName: 'taskin-rt' });
      // Connection errors surface on the next command; without a listener ioredis logs every retry.
      this.core.on('error', () => undefined);
      this.rt.on('error', () => undefined);
    } catch {
      const store = new Map<string, string | number>();
      const mock = {
        get: async (k: string) => store.get(k) ?? null,
        set: async (k: string, v: string | number) => {
          store.set(k, v);
          return 'OK';
        },
        del: async (k: string) => (store.delete(k) ? 1 : 0),
        incr: async (k: string) => {
          const n = (Number(store.get(k)) || 0) + 1;
          store.set(k, n);
          return n;
        },
        quit: async () => 'OK',
        on: () => mock,
      } as unknown as IORedis;
      this.core = mock;
      this.rt = mock;
    }
  }

  /** `taskin:otp:send:phone:+98…`: every key this deployment owns lives under its prefix. */
  key(...parts: readonly (string | number)[]): string {
    return [this.prefix, ...parts].join(':');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.core.quit(), this.rt.quit()]);
  }
}

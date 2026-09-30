import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { AppConfig } from '../../config/app-config.js';
import { Database } from '../db/database.js';
import { Public } from '../http/public.js';
import { RedisClients } from '../redis/redis.js';
import { StorageService } from '../storage/storage.js';

const TIMEOUT_MS = 2_000;

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${TIMEOUT_MS} ms`)), TIMEOUT_MS).unref()),
  ]);
}

/**
 * `/health/live`: the process answers (restart it if not). `/health/ready`: its dependencies
 * answer (stop routing to it if not). Unversioned, outside the `/api` prefix, never logged.
 */
@ApiExcludeController()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly config: AppConfig,
    private readonly database: Database,
    private readonly redis: RedisClients,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get('live')
  live(): { status: 'ok'; role: string } {
    return { status: 'ok', role: this.config.env.APP_ROLE };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.probe('database', async () => void (await this.database.db.execute(sql`select 1`))),
      () => this.probe('redisCore', async () => void (await this.redis.core.ping())),
      () => this.probe('redisRt', async () => void (await this.redis.rt.ping())),
      () => this.probe('storage', () => this.storage.ping()),
    ]);
  }

  private async probe<K extends string>(key: K, check: () => Promise<void>) {
    const indicator = this.indicators.check(key);
    try {
      await withTimeout(check());
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : String(error) });
    }
  }
}

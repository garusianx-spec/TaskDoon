import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { AppConfig } from '../../config/app-config.js';
import type { Db } from '../../platform/db/database.js';
import * as schema from '../../platform/db/schema/all.js';

/**
 * The platform admin's own connection pool, as `taskin_platform_admin`: a role that bypasses
 * row-level security but can only SELECT the tables the admin screens show, with every
 * transaction read-only. It is separate from the application pool on purpose: no ordinary code
 * path can ever reach it, and the tenant policies `taskin_app` runs under stay exactly as they are.
 * Without `DATABASE_PLATFORM_ADMIN_URL` there is no pool, and the admin routes answer 503.
 */
@Injectable()
export class PlatformAdminDatabase implements OnModuleDestroy {
  readonly pool: pg.Pool | null;
  readonly db: Db | null;

  constructor(config: AppConfig) {
    const url = config.env.DATABASE_PLATFORM_ADMIN_URL;
    if (!url) {
      this.pool = null;
      this.db = null;
      return;
    }
    this.pool = new pg.Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000,
      application_name: `taskin-platform-admin:${config.env.APP_ROLE}`,
    });
    this.pool.on('error', () => undefined);
    this.db = drizzle({ client: this.pool, schema, casing: 'snake_case' });
  }

  get enabled(): boolean {
    return this.db !== null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
  }
}

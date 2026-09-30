import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { AppConfig } from '../../config/app-config.js';
import { RequestContext } from '../context/request-context.js';
import * as schema from './schema/all.js';

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;
/** A drizzle transaction; every tenant query runs on one, inside UnitOfWork.run. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const TRANSACTION_CONTROL = /^\s*(begin|commit|rollback|savepoint|release)\b/i;

/**
 * The connection pool (as `taskin_app`, through PgBouncer in production) and the drizzle client
 * on top of it. Every statement drizzle sends is counted into the request context, which is how
 * the tests hold endpoints to a query budget (no N+1).
 */
@Injectable()
export class Database implements OnModuleDestroy {
  readonly pool: pg.Pool;
  readonly db: Db;

  constructor(config: AppConfig, context: RequestContext) {
    this.pool = new pg.Pool({
      connectionString: config.env.DATABASE_URL,
      max: config.env.DATABASE_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: `taskin-api:${config.env.APP_ROLE}`,
    });
    // An idle client losing its connection must not crash the process; the pool replaces it.
    this.pool.on('error', () => undefined);
    this.db = drizzle({
      client: this.pool,
      schema,
      casing: 'snake_case',
      logger: {
        logQuery: (query) => {
          if (!TRANSACTION_CONTROL.test(query)) context.countStatement();
        },
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

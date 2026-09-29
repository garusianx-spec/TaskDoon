import { AsyncLocalStorage } from 'node:async_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { RequestContext } from '../context/request-context.js';
import { Database, type Tx } from './database.js';
import { isRetryable, pgError } from './pg-errors.js';

/** The tenant and user a transaction acts for; row-level security keys on both. */
export interface TenantScope {
  /** `null` for global work (sign-in, the workspace list); tenant tables then show no rows. */
  readonly workspaceId: string | null;
  readonly userId: string | null;
  /** Trashed rows (projects) become visible: only the trash itself, its restore and purge. */
  readonly includeDeleted?: boolean;
}

export interface Unit {
  readonly tx: Tx;
  /** Runs after COMMIT (never after a rollback): cache invalidation, Redis writes, wake-ups. */
  afterCommit(effect: () => unknown): void;
}

export interface RunOptions {
  /** Attempts for serialization failures, deadlocks and lock timeouts. Default 3. */
  readonly attempts?: number;
  readonly isolation?: 'read committed' | 'repeatable read' | 'serializable';
}

const insideUnit = new AsyncLocalStorage<true>();

/**
 * One use case, one transaction. Opens it, pins the tenant with transaction-local settings (so
 * PgBouncer transaction pooling can never leak them), runs the work, commits, then runs the
 * after-commit effects. Retryable failures re-run the whole unit with jittered backoff; that is
 * safe because nothing outside the database happens until after commit.
 *
 * Units do not nest: a use case that needs another's writes passes its `Unit` along.
 */
@Injectable()
export class UnitOfWork {
  private readonly logger = new Logger('UnitOfWork');

  constructor(
    private readonly database: Database,
    private readonly context: RequestContext,
  ) {}

  async run<T>(scope: TenantScope, work: (unit: Unit) => Promise<T>, options: RunOptions = {}): Promise<T> {
    if (insideUnit.getStore()) {
      throw new Error('UnitOfWork.run called inside another unit; pass the outer Unit instead');
    }
    const attempts = options.attempts ?? 3;
    for (let attempt = 1; ; attempt += 1) {
      const effects: (() => unknown)[] = [];
      try {
        const result = await insideUnit.run(true, () =>
          this.database.db.transaction(
            async (tx) => {
              await tx.execute(sql`select
                set_config('app.workspace_id', ${scope.workspaceId ?? ''}, true),
                set_config('app.user_id', ${scope.userId ?? ''}, true),
                set_config('app.request_id', ${this.context.requestId ?? ''}, true),
                set_config('app.include_deleted', ${scope.includeDeleted ? 'on' : ''}, true),
                set_config('statement_timeout', '15s', true)`);
              return work({ tx, afterCommit: (effect) => effects.push(effect) });
            },
            options.isolation ? { isolationLevel: options.isolation } : undefined,
          ),
        );
        for (const effect of effects) {
          try {
            await effect();
          } catch (error) {
            this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'after-commit effect failed');
          }
        }
        return result;
      } catch (error) {
        if (attempt >= attempts || !isRetryable(error)) throw error;
        const delay = 20 * 2 ** attempt + Math.floor(Math.random() * 30);
        this.logger.debug({ attempt, pgCode: pgError(error)?.code, delay }, 'retrying transaction');
        await sleep(delay);
      }
    }
  }
}

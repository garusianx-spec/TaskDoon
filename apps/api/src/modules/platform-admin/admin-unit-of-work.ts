import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { RequestContext } from '../../platform/context/request-context.js';
import type { Tx } from '../../platform/db/database.js';
import { pgError } from '../../platform/db/pg-errors.js';
import { ApiError } from '../../platform/http/api-error.js';
import { PlatformAdminDatabase } from './admin-database.js';
import type { PlatformAdmin } from './platform-admin.guard.js';

/**
 * The administrative unit of work: one READ ONLY transaction on the platform-admin pool, which
 * sees every workspace (no tenant filter). Only the platform-admin services call it, and only
 * for a request `PlatformAdminGuard` and the step-up guard already let through; it takes the
 * verified admin as proof. The admin and request ids are set for the session, so the database's
 * own logs can tell whose reads these were.
 */
/**
 * What the database answering with these codes means for the admin pool: it is misconfigured,
 * not the request. Postgres reports a login role that does not exist as a wrong password (28P01).
 */
const MISCONFIGURED: Readonly<Record<string, string>> = {
  '28P01': 'the role in DATABASE_PLATFORM_ADMIN_URL does not exist or its password differs',
  '28000': 'the role in DATABASE_PLATFORM_ADMIN_URL may not log in',
  '3D000': 'the database in DATABASE_PLATFORM_ADMIN_URL does not exist',
  '42501': 'taskin_platform_admin is missing a grant (CONNECT on the database or SELECT on a table)',
};
const FIX_HINT = 'run infra/postgres/platform-admin-role.sql as the Postgres superuser';
const PROBE_CACHE_MS = 30_000;
const LOG_EVERY_MS = 60_000;

/** The misconfiguration behind an error from the admin pool, if that is what it is. */
export function adminPoolProblem(error: unknown): { readonly code: string; readonly cause: string } | null {
  const code = pgError(error)?.code;
  const cause = code ? MISCONFIGURED[code] : undefined;
  return code && cause ? { code, cause } : null;
}

@Injectable()
export class PlatformAdminUnitOfWork {
  private readonly logger = new Logger('PlatformAdminUnitOfWork');
  private probed: { readonly ok: boolean; readonly at: number } | null = null;
  private probing: Promise<boolean> | null = null;
  private loggedAt = 0;

  constructor(
    private readonly database: PlatformAdminDatabase,
    private readonly context: RequestContext,
  ) {}

  /**
   * Whether the admin pool can actually serve: configured, able to log in, and granted what the
   * screens read. Checked through the pool itself and cached for 30 seconds, so the admin
   * shell can say "not set up" instead of failing screen by screen.
   */
  async available(): Promise<boolean> {
    const db = this.database.db;
    if (!db) return false;
    if (this.probed && Date.now() - this.probed.at < PROBE_CACHE_MS) return this.probed.ok;
    this.probing ??= (async () => {
      let ok = false;
      try {
        const result = await db.execute<{ ok: boolean }>(
          sql`select has_table_privilege('users', 'select') and has_table_privilege('platform_audit_logs', 'select') as ok`,
        );
        ok = result.rows[0]?.ok === true;
        if (!ok) this.report('42501', MISCONFIGURED['42501'] ?? '');
      } catch (error) {
        const problem = adminPoolProblem(error);
        this.report(problem?.code ?? 'unreachable', problem?.cause ?? 'the database could not be reached');
      }
      this.probed = { ok, at: Date.now() };
      this.probing = null;
      return ok;
    })();
    return this.probing;
  }

  async read<T>(admin: PlatformAdmin, work: (tx: Tx) => Promise<T>): Promise<T> {
    const db = this.database.db;
    if (!db) throw new ApiError('PLATFORM_ADMIN_UNAVAILABLE');
    try {
      return await db.transaction(
        async (tx) => {
          await tx.execute(sql`select set_config('app.user_id', ${admin.userId}, true), set_config('app.request_id', ${this.context.requestId ?? ''}, true)`);
          return work(tx);
        },
        { accessMode: 'read only' },
      );
    } catch (error) {
      // A misconfigured admin role is the deployment's problem, not a bug: 503 with a clear log line.
      const problem = adminPoolProblem(error);
      if (!problem) throw error;
      this.probed = { ok: false, at: Date.now() };
      this.report(problem.code, problem.cause);
      throw new ApiError('PLATFORM_ADMIN_UNAVAILABLE', 'The platform admin database refused this request; see the API log.');
    }
  }

  /** One error line a minute at most, naming the cause and the fix. */
  private report(code: string, cause: string): void {
    if (Date.now() - this.loggedAt < LOG_EVERY_MS) return;
    this.loggedAt = Date.now();
    this.logger.error({ pgCode: code }, `platform admin database unavailable: ${cause}; ${FIX_HINT}`);
  }
}

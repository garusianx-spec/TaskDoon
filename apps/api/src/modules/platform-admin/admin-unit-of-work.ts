import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { RequestContext } from '../../platform/context/request-context.js';
import type { Tx } from '../../platform/db/database.js';
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
@Injectable()
export class PlatformAdminUnitOfWork {
  constructor(
    private readonly database: PlatformAdminDatabase,
    private readonly context: RequestContext,
  ) {}

  get available(): boolean {
    return this.database.enabled;
  }

  async read<T>(admin: PlatformAdmin, work: (tx: Tx) => Promise<T>): Promise<T> {
    const db = this.database.db;
    if (!db) throw new ApiError('PLATFORM_ADMIN_UNAVAILABLE');
    return db.transaction(
      async (tx) => {
        await tx.execute(sql`select set_config('app.user_id', ${admin.userId}, true), set_config('app.request_id', ${this.context.requestId ?? ''}, true)`);
        return work(tx);
      },
      { accessMode: 'read only' },
    );
  }
}

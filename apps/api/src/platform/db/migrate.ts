import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { PlanLimits } from '@taskin/contracts';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../db/migrations', import.meta.url));

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

/**
 * Plan tiers and their entitlements. Placeholder values until business sets them (RFC §10.1);
 * the seed is an upsert, so changing a number here and re-running the migrate job applies it.
 */
export const PLANS: readonly { readonly id: string; readonly name: string; readonly limits: PlanLimits }[] = [
  { id: 'free', name: 'رایگان', limits: { maxMembers: 10, storageBytes: 5 * GIB, maxFileBytes: 25 * MIB, messageHistoryDays: 90, maxProjects: 5 } },
  { id: 'team', name: 'تیمی', limits: { maxMembers: 100, storageBytes: 100 * GIB, maxFileBytes: 100 * MIB, messageHistoryDays: null, maxProjects: null } },
  {
    id: 'enterprise',
    name: 'سازمانی',
    limits: { maxMembers: 1000, storageBytes: 1024 * GIB, maxFileBytes: 1024 * MIB, messageHistoryDays: null, maxProjects: null },
  },
];

/** Applies pending migrations as the table owner (`taskin_migrator`), then the idempotent seeds. */
export async function runMigrations(migratorUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: migratorUrl, max: 1, application_name: 'taskin-migrate' });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_FOLDER });
    for (const plan of PLANS) {
      await pool.query(
        `insert into plans (id, name, limits) values ($1, $2, $3)
         on conflict (id) do update set name = excluded.name, limits = excluded.limits`,
        [plan.id, plan.name, JSON.stringify(plan.limits)],
      );
    }
  } finally {
    await pool.end();
  }
}

import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { PlanLimits } from '@taskin/contracts';
import { SITE_SEED_DOCUMENTS } from '../../modules/site/site.seed.js';
import { validateSiteDocument, validateSitePublish } from '../../modules/site/site.validation.js';

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
    for (const seed of SITE_SEED_DOCUMENTS) {
      const { kind, slug, published, ...content } = seed;
      validateSiteDocument({ kind, slug, draft: content });
      if (published) validateSitePublish(kind, slug, content);
      await pool.query(
        `insert into site_documents (kind, slug, status, draft, published, published_slug, published_version, published_at, published_updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $8) on conflict (kind, slug) do nothing`,
        [kind, slug, published ? 'published' : 'draft', JSON.stringify(content), published ? JSON.stringify(content) : null, published ? slug : null, published ? 1 : null, published ? new Date() : null],
      );
      // Preserve the original version of freshly seeded content before an administrator edits
      // it. Existing editorial history and documents changed by users are never overwritten.
      await pool.query(
        `insert into site_revisions (document_id, content, slug, version, actor_id, action)
         select d.id, d.draft, d.slug, d.version, null, 'seed'
         from site_documents d where d.kind = $1 and d.slug = $2 and d.version = 1
         and not exists (select 1 from site_revisions r where r.document_id = d.id)`,
        [kind, slug],
      );
    }
  } finally {
    await pool.end();
  }
}

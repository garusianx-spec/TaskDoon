import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { PlanLimits } from '@taskin/contracts';
import { SITE_SEED_DOCUMENTS } from '../../modules/site/site.seed.js';
import { validateSiteDocument, validateSitePublish } from '../../modules/site/site.validation.js';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../db/migrations', import.meta.url));

/**
 * Reconciles the database migration ledger against the local journal file.
 * Handles historical ghost migrations (such as an orphaned 0030 migration row
 * whose SQL was identical to 0029 but subsequently removed from Git).
 */
export async function reconcileMigrationLedger(pool: pg.Pool, migrationsFolder: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('taskin_migration_ledger_lock'))");

    const { rows: tableCheck } = await client.query<{ reg: string | null }>(`
      SELECT coalesce(to_regclass('drizzle.__drizzle_migrations'), to_regclass('public.__drizzle_migrations'))::text as reg
    `);
    const tableName = tableCheck[0]?.reg;
    if (!tableName) {
      await client.query('COMMIT');
      return;
    }

    const journalPath = join(migrationsFolder, 'meta', '_journal.json');
    let journalEntries: { idx: number; when: number; tag: string }[] = [];
    try {
      const journalRaw = readFileSync(journalPath, 'utf8');
      journalEntries = JSON.parse(journalRaw).entries ?? [];
    } catch {
      await client.query('COMMIT');
      return;
    }

    const { rows: recordedRows } = await client.query<{ id: number; hash: string; created_at: string }>(
      `SELECT id, hash, created_at FROM ${tableName} ORDER BY id ASC`,
    );

    const journalTimestamps = new Set(journalEntries.map((e) => String(e.when)));
    const target0029 = journalEntries.find((e) => e.tag.includes('0029'));

    for (const row of recordedRows) {
      if (!journalTimestamps.has(String(row.created_at))) {
        const has0029Recorded =
          target0029 && recordedRows.some((r) => String(r.created_at) === String(target0029.when));

        if (has0029Recorded) {
          await client.query(`DELETE FROM ${tableName} WHERE id = $1`, [row.id]);
          console.log(
            JSON.stringify({
              event: 'migrations.ledger.ghost_removed',
              rowId: row.id,
              createdAt: row.created_at,
              message: 'Removed orphaned migration row not present in journal',
            }),
          );
        } else if (target0029) {
          await client.query(`UPDATE ${tableName} SET created_at = $1 WHERE id = $2`, [target0029.when, row.id]);
          console.log(
            JSON.stringify({
              event: 'migrations.ledger.ghost_realigned',
              rowId: row.id,
              oldCreatedAt: row.created_at,
              newCreatedAt: target0029.when,
              message: 'Realigned orphan migration timestamp with 0029 journal entry',
            }),
          );
        }
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.warn(
      JSON.stringify({
        event: 'migrations.ledger.reconcile_warning',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  } finally {
    client.release();
  }
}

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

/**
 * Plan tiers and their entitlements. Placeholder values until business sets them (RFC §10.1);
 * the seed is an upsert, so changing a number here and re-running the migrate job applies it.
 */
export const PLANS: readonly { readonly id: string; readonly name: string; readonly limits: PlanLimits }[] = [
  {
    id: 'free',
    name: 'رایگان',
    limits: {
      maxMembers: 10,
      storageBytes: 5 * GIB,
      maxFileBytes: 25 * MIB,
      messageHistoryDays: 90,
      maxProjects: 5,
    },
  },
  {
    id: 'team',
    name: 'تیمی',
    limits: {
      maxMembers: 100,
      storageBytes: 100 * GIB,
      maxFileBytes: 100 * MIB,
      messageHistoryDays: null,
      maxProjects: null,
    },
  },
  {
    id: 'enterprise',
    name: 'سازمانی',
    limits: {
      maxMembers: 1000,
      storageBytes: 1024 * GIB,
      maxFileBytes: 1024 * MIB,
      messageHistoryDays: null,
      maxProjects: null,
    },
  },
];

/** Applies pending migrations as the table owner (`taskin_migrator`), then the idempotent seeds. */
export async function runMigrations(migratorUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: migratorUrl, max: 1, application_name: 'taskin-migrate' });
  try {
    await reconcileMigrationLedger(pool, MIGRATIONS_FOLDER);
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
         select $1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8::timestamptz, $8::timestamptz
         where not exists (
           select 1 from site_documents d where d.kind = $1 and (
             d.slug = $2 or d.published_slug = $2 or exists (
               select 1 from site_revisions r where r.document_id = d.id and r.action = 'seed' and r.slug = $2
             )
           )
         ) on conflict do nothing`,
        [
          kind,
          slug,
          published ? 'published' : 'draft',
          JSON.stringify(content),
          published ? JSON.stringify(content) : null,
          published ? slug : null,
          published ? 1 : null,
          published ? new Date() : null,
        ],
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

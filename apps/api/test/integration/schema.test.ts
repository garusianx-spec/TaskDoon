import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { buildOpenApiDocument, OPENAPI_FILE } from '../../src/openapi.js';
import { schemaSnapshot, SNAPSHOT_FILE } from '../../src/platform/db/schema-snapshot.js';
import { dbUrl } from './infra.js';

describe('M1 checklist: migrations and generated contracts', () => {
  it('migrates from zero to exactly the committed schema snapshot', async () => {
    // The global setup migrated the template database from an empty database.
    const snapshot = await schemaSnapshot(dbUrl(inject('templateDb'), 'migrator'));
    const committed = await readFile(SNAPSHOT_FILE, 'utf8');
    expect(snapshot, 'run `npm run db:snapshot` and review the diff').toBe(committed);
  });

  it('applied every migration in the journal', async () => {
    const journal = JSON.parse(await readFile(new URL('../../db/migrations/meta/_journal.json', import.meta.url), 'utf8')) as {
      entries: unknown[];
    };
    const client = new pg.Client({ connectionString: dbUrl(inject('templateDb'), 'migrator') });
    await client.connect();
    const { rows } = await client.query<{ count: string }>('select count(*) from drizzle.__drizzle_migrations');
    await client.end();
    expect(Number(rows[0]?.count)).toBe(journal.entries.length);
  });

  it('seeds the plan tiers', async () => {
    const client = new pg.Client({ connectionString: dbUrl(inject('templateDb'), 'app') });
    await client.connect();
    const { rows } = await client.query<{ id: string }>('select id from plans order by id');
    await client.end();
    expect(rows.map((row) => row.id)).toEqual(['enterprise', 'free', 'team']);
  });

  it('keeps openapi.json in step with the controllers and DTOs', async () => {
    const generated = `${JSON.stringify(await buildOpenApiDocument(), null, 2)}\n`;
    const committed = await readFile(OPENAPI_FILE, 'utf8');
    expect(generated, 'run `npm run openapi -w @taskin/api`').toBe(committed);
  });
});

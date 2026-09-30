import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../../src/platform/db/migrate.js';
import { adminUrl, dbUrl, TEMPLATE_DB } from './infra.js';

const ROLES_SQL = fileURLToPath(new URL('../../../../infra/postgres/init/01-roles.sql', import.meta.url));

/**
 * Once per run: create the two roles, migrate a fresh template database from zero, and seed it.
 * Each test file then clones the template (CREATE DATABASE … TEMPLATE, a file copy), so files
 * run in parallel against identical, isolated databases.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    await admin.query(await readFile(ROLES_SQL, 'utf8'));
    await admin.query(`drop database if exists ${TEMPLATE_DB} with (force)`);
    await admin.query(`create database ${TEMPLATE_DB} owner taskin_migrator`);
    await admin.query(`revoke all on database ${TEMPLATE_DB} from public`);
    await admin.query(`grant connect, temporary on database ${TEMPLATE_DB} to taskin_app`);
  } finally {
    await admin.end();
  }
  await runMigrations(dbUrl(TEMPLATE_DB, 'migrator'));
  project.provide('templateDb', TEMPLATE_DB);
  return async () => {
    const cleanup = new pg.Client({ connectionString: adminUrl() });
    await cleanup.connect();
    const { rows } = await cleanup.query<{ datname: string }>(`select datname from pg_database where datname like 'taskin_test_%'`);
    for (const { datname } of rows) await cleanup.query(`drop database if exists ${datname} with (force)`);
    await cleanup.end();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    templateDb: string;
  }
}

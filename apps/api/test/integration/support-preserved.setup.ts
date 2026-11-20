import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../../src/platform/db/migrate.js';
import { adminUrl, dbUrl, REDIS_URL, S3 } from './infra.js';

/** No shared template, role changes, reset, drop, or fixture cleanup. Local development only. */
export default async function setup(project: TestProject): Promise<void> {
  if (
    process.env.SUPPORT_ISOLATED_TEST !== '1' ||
    ![adminUrl(), REDIS_URL, S3.endpoint].every((url) =>
      ['localhost', '127.0.0.1'].includes(new URL(url).hostname),
    )
  )
    throw new Error(
      'Requires SUPPORT_ISOLATED_TEST=1 and local development PostgreSQL, Redis and S3 services',
    );
  const name = `taskin_support_template_${randomBytes(6).toString('hex')}`;
  const client = new pg.Client({ connectionString: adminUrl() });
  await client.connect();
  try {
    const roles = await client.query(
      "select rolname from pg_roles where rolname in ('taskin_app', 'taskin_migrator', 'taskin_platform_admin')",
    );
    if (roles.rowCount !== 3) throw new Error('Development database roles must already be provisioned');
    await client.query(`create database ${name} owner taskin_migrator`);
    await client.query(`revoke all on database ${name} from public`);
    await client.query(`grant connect, temporary on database ${name} to taskin_app`);
    await client.query(`grant connect on database ${name} to taskin_platform_admin`);
  } finally {
    await client.end();
  }
  console.info(`Created fresh preserved support template database: ${name}`);
  await runMigrations(dbUrl(name, 'migrator'));
  project.provide('templateDb', name);
  console.info(`Preserved fresh support template database: ${name}`);
}

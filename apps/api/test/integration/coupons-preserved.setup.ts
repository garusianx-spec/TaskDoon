import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../../src/platform/db/migrate.js';
import { adminUrl, dbUrl } from './infra.js';

/** No shared template, role changes, reset, drop, or fixture cleanup. Local development only. */
export default async function setup(project: TestProject): Promise<void> {
  if (
    process.env.COUPON_ISOLATED_TEST !== '1' ||
    !['localhost', '127.0.0.1'].includes(new URL(adminUrl()).hostname)
  )
    throw new Error('Requires COUPON_ISOLATED_TEST=1 and a local development PostgreSQL server');
  const name = `taskin_coupon_template_${randomBytes(6).toString('hex')}`;
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
  console.info(`Created fresh preserved coupon template database: ${name}`);
  await runMigrations(dbUrl(name, 'migrator'));
  project.provide('templateDb', name);
  console.info(`Preserved fresh coupon template database: ${name}`);
}

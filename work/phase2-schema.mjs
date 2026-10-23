import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { runMigrations } from '../apps/api/dist/platform/db/migrate.js';
import { schemaSnapshot, SNAPSHOT_FILE } from '../apps/api/dist/platform/db/schema-snapshot.js';

const name = `taskdoon_phase2_schema_${randomBytes(5).toString('hex')}`;
const admin = new pg.Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:5432/postgres' });
await admin.connect();
let created = false;
try {
  await admin.query(`create database ${name} owner taskin_migrator`);
  created = true;
  const url = `postgres://taskin_migrator:taskin_migrator@127.0.0.1:5432/${name}`;
  await runMigrations(url);
  await writeFile(SNAPSHOT_FILE, await schemaSnapshot(url));
  console.log('Fresh PostgreSQL migration and catalog snapshot succeeded.');
} finally {
  if (created) await admin.query(`drop database ${name} with (force)`);
  await admin.end();
}

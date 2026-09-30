/**
 * `npm run db:snapshot`: prints the schema snapshot of DATABASE_MIGRATOR_URL, or with `--write`
 * stores it in db/schema.snapshot.txt. The integration suite fails when the two differ.
 */
import { writeFile } from 'node:fs/promises';
import { SNAPSHOT_FILE, schemaSnapshot } from '../platform/db/schema-snapshot.js';

const url = process.env.DATABASE_MIGRATOR_URL;
if (!url) {
  console.error('DATABASE_MIGRATOR_URL is required.');
  process.exit(78);
}
const snapshot = await schemaSnapshot(url);
if (process.argv.includes('--write')) {
  await writeFile(SNAPSHOT_FILE, snapshot);
  console.log(`wrote ${SNAPSHOT_FILE}`);
} else {
  process.stdout.write(snapshot);
}

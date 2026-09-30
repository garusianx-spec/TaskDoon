/** `npm run db:migrate`: applies migrations and seeds as DATABASE_MIGRATOR_URL (the table owner). */
import { runMigrations } from '../platform/db/migrate.js';

const url = process.env.DATABASE_MIGRATOR_URL;
if (!url) {
  console.error('DATABASE_MIGRATOR_URL is required (a connection as taskin_migrator).');
  process.exit(78);
}
await runMigrations(url);
console.log('migrations applied, seeds upserted');

import { defineConfig } from 'drizzle-kit';

/**
 * `npm run db:generate` diffs the TypeScript schema against the last snapshot in db/migrations
 * and writes the next SQL migration. Policies, triggers and functions that the schema cannot
 * express live in hand-written migrations made with `drizzle-kit generate --custom`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/platform/db/schema/index.ts',
  out: './db/migrations',
  casing: 'snake_case',
  strict: true,
  verbose: true,
});

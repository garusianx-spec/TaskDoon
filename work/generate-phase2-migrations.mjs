import fs from 'node:fs/promises';
import { generateDrizzleJson, generateMigration } from '../node_modules/drizzle-kit/api.mjs';
import * as schema from '../apps/api/dist/platform/db/schema/index.js';

const root = new URL('../apps/api/db/migrations/', import.meta.url);
const previous = JSON.parse(await fs.readFile(new URL('meta/0020_snapshot.json', root), 'utf8'));
const next = generateDrizzleJson(schema, previous.id, ['public'], 'snake_case');
const statements = await generateMigration(previous, next);
if (statements.length === 0 || statements.some(statement => /DROP |ALTER TABLE "(?!project_departments)/.test(statement))) {
  throw new Error(`Unexpected schema diff: ${statements.join('\n')}`);
}
const journal = JSON.parse(await fs.readFile(new URL('meta/_journal.json', root), 'utf8'));
if (journal.entries.length !== 21) throw new Error('Migrations already generated or unexpected baseline.');
await fs.writeFile(new URL('0021_project_departments.sql', root), statements.join('--> statement-breakpoint\n') + '\n');
await fs.writeFile(new URL('meta/0021_snapshot.json', root), JSON.stringify(next, null, 2) + '\n');
const custom = generateDrizzleJson(schema, next.id, ['public'], 'snake_case');
await fs.writeFile(new URL('meta/0022_snapshot.json', root), JSON.stringify(custom, null, 2) + '\n');
const now = Date.now();
journal.entries.push(
  { idx: 21, version: '7', when: now, tag: '0021_project_departments', breakpoints: true },
  { idx: 22, version: '7', when: now + 1, tag: '0022_project_departments_security', breakpoints: true },
);
await fs.writeFile(new URL('meta/_journal.json', root), JSON.stringify(journal, null, 2) + '\n');
console.log(statements.join('\n'));

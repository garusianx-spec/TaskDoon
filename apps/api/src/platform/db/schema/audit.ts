import { bigint, inet, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { instant } from './columns.js';

/**
 * Append-only audit trail, range-partitioned by month. drizzle-kit cannot declare partitioned
 * tables, so this table is created by the hand-written audit migration and is deliberately left
 * out of `index.ts` (the drizzle-kit entry); the runtime client still gets it through `all.ts`.
 * `taskin_app` may only INSERT and SELECT.
 */
export const auditLogs = pgTable('audit_logs', {
  id: bigint({ mode: 'number' }).notNull().generatedAlwaysAsIdentity(),
  workspaceId: uuid(),
  actorUserId: uuid(),
  actorSessionId: uuid(),
  /** Dotted verb, e.g. `workspace.delete`, `rbac.permissions.replace`, `auth.session.revoke`. */
  action: text().notNull(),
  resourceType: text(),
  resourceId: text(),
  /** `{ before, after }` with phone numbers, emails and tokens redacted. */
  changes: jsonb().$type<Record<string, unknown>>(),
  ip: inet(),
  userAgent: text(),
  requestId: text(),
  traceId: text(),
  createdAt: instant().notNull().defaultNow(),
});

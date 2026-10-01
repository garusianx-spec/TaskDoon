import { sql } from 'drizzle-orm';
import { bigint, index, inet, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './columns.js';
import { users } from './identity.js';

/**
 * What platform super admins did and looked at (Phase 1 of the platform admin): every inspection
 * of a person's sessions, conversations, messages or files, and every action on their account.
 * Platform-wide by design — it has no workspace and no row-level security — and append-only:
 * `taskin_app` may INSERT and SELECT, never change or delete a row.
 */
export const platformAuditLogs = pgTable(
  'platform_audit_logs',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    adminId: uuid()
      .notNull()
      .references(() => users.id),
    /** The person whose data was looked at or changed, when there is one. */
    targetUserId: uuid().references(() => users.id),
    /** Dotted verb, e.g. `admin.messages.read`, `admin.session.revoke`. */
    action: text().notNull(),
    resourceType: text(),
    resourceId: text(),
    ip: inet(),
    userAgent: text(),
    requestId: text(),
    /** The request's trace id (Phase 2), as on the matching `audit_logs` row. */
    traceId: text(),
    /** Filters and counts of the inspection (never message content or secrets). */
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('platform_audit_logs_target_idx').on(t.targetUserId, t.createdAt.desc()).where(sql`${t.targetUserId} is not null`),
    index('platform_audit_logs_admin_idx').on(t.adminId, t.createdAt.desc()),
  ],
);

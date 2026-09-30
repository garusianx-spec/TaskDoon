import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { bytea, createdAt, instant, updatedAt } from './columns.js';
import { users } from './identity.js';

/** Cross-cutting platform tables: idempotency and the transactional outbox. */

/**
 * A replayable record of one mutating request, keyed by the caller's `Idempotency-Key`. A retry
 * with the same key and body gets the stored response; the same key with another body is refused.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Method and route template, e.g. `POST /v1/workspaces/:workspaceId/invitations`. */
    scope: text().notNull(),
    key: text().notNull(),
    requestHash: bytea().notNull(),
    state: text().notNull(),
    responseStatus: integer(),
    responseBody: jsonb(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    expiresAt: instant().notNull(),
  },
  (t) => [
    primaryKey({ name: 'idempotency_keys_pk', columns: [t.userId, t.scope, t.key] }),
    index('idempotency_keys_expires_idx').on(t.expiresAt),
    check('idempotency_keys_key_len', sql`char_length(${t.key}) between 8 and 64`),
    check('idempotency_keys_state', sql`${t.state} in ('in_progress', 'completed')`),
  ],
);

/**
 * Domain events written in the same transaction as the change they describe. A single relay
 * publishes them in id order and stamps `published_at`; consumers dedupe by `id`.
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: uuid(),
    aggregateType: text().notNull(),
    aggregateId: text().notNull(),
    eventType: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    /** `traceparent`, `requestId` and `actorId`, so side effects link back to the request. */
    headers: jsonb().$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
    publishedAt: instant(),
  },
  (t) => [
    index('outbox_events_unpublished_idx').on(t.id).where(sql`${t.publishedAt} is null`),
    index('outbox_events_published_idx').on(t.publishedAt).where(sql`${t.publishedAt} is not null`),
  ],
);

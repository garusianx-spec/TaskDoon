import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, updatedAt, uuidPk } from './columns.js';
import { broadcastLevel } from './enums.js';
import { users } from './identity.js';

/** Platform-wide announcements. No tenant key and no tenant RLS classification. */
export const systemBroadcasts = pgTable(
  'system_broadcasts',
  {
    id: uuidPk(),
    message: text().notNull(),
    level: broadcastLevel().notNull(),
    isActive: boolean().notNull().default(true),
    startsAt: instant().notNull().defaultNow(),
    expiresAt: instant(),
    createdBy: uuid().notNull().references(() => users.id),
    updatedBy: uuid().notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: instant(),
  },
  (t) => [
    check('system_broadcasts_message_length', sql`char_length(btrim(${t.message})) between 1 and 500`),
    check('system_broadcasts_time_window', sql`${t.expiresAt} is null or ${t.expiresAt} > ${t.startsAt}`),
    index('system_broadcasts_active_starts_idx').on(t.startsAt).where(sql`${t.archivedAt} is null and ${t.isActive} = true`),
    index('system_broadcasts_created_idx').on(t.createdAt.desc(), t.id.desc()),
    index('system_broadcasts_created_by_idx').on(t.createdBy),
    index('system_broadcasts_updated_by_idx').on(t.updatedBy),
  ],
);

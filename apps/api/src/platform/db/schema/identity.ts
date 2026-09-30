import { sql } from 'drizzle-orm';
import { boolean, check, index, inet, integer, pgTable, smallint, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { bytea, citext, createdAt, instant, updatedAt, uuidPk } from './columns.js';
import { avatarTone, otpPurpose, sessionRevokeReason, userStatus } from './enums.js';

/**
 * Identity is global, not tenant-scoped: one person, one phone number, many workspaces. These
 * tables carry no row-level security and are only ever reached through the auth and user
 * services, keyed by the token's subject.
 */

export const users = pgTable(
  'users',
  {
    id: uuidPk(),
    /** E.164, e.g. `+989121234567`, normalised from whatever digits the person typed. */
    phone: text().notNull(),
    phoneVerifiedAt: instant().notNull(),
    email: citext(),
    emailVerifiedAt: instant(),
    fullName: text().notNull(),
    avatarKey: text(),
    avatarTone: avatarTone().notNull().default('brand'),
    locale: text().notNull().default('fa-IR'),
    timeZone: text().notNull().default('Asia/Tehran'),
    /** argon2id. Required before the user may hold the owner or admin role anywhere. */
    passwordHash: text(),
    passwordChangedAt: instant(),
    failedPasswordAttempts: integer().notNull().default(0),
    lockedUntil: instant(),
    /** Bumping it invalidates every access token the user holds (phone change, compromise). */
    securityVersion: integer().notNull().default(1),
    status: userStatus().notNull().default('active'),
    /** Platform super admin (operators of TaskDoon itself): granted only by the CLI, never through the API. */
    isPlatformAdmin: boolean().notNull().default(false),
    /** An admin issued a reset code: the old password no longer verifies until a new one is set. */
    passwordResetRequired: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: instant(),
  },
  (t) => [
    uniqueIndex('users_phone_uq').on(t.phone).where(sql`${t.deletedAt} is null`),
    uniqueIndex('users_email_uq').on(t.email).where(sql`${t.email} is not null and ${t.deletedAt} is null`),
    check('users_full_name_len', sql`char_length(${t.fullName}) between 2 and 80`),
    check('users_phone_e164', sql`${t.phone} ~ '^\\+[1-9][0-9]{7,14}$'`),
  ],
);

/** One SMS code. The code itself is never stored: only an HMAC of it, peppered and bound to the id. */
export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid().primaryKey(),
    phone: text().notNull(),
    purpose: otpPurpose().notNull(),
    codeHash: bytea().notNull(),
    attempts: smallint().notNull().default(0),
    provider: text().notNull(),
    providerMessageId: text(),
    ip: inet(),
    userAgent: text(),
    expiresAt: instant().notNull(),
    consumedAt: instant(),
    createdAt: createdAt(),
  },
  (t) => [
    index('otp_challenges_phone_idx').on(t.phone, t.purpose, t.createdAt.desc()),
    index('otp_challenges_created_idx').on(t.createdAt),
    check('otp_challenges_attempts', sql`${t.attempts} between 0 and 5`),
  ],
);

/** One signed-in device. Its id is the `sid` claim of every access token it holds. */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuidPk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceLabel: text(),
    userAgent: text(),
    ip: inet(),
    geoCity: text(),
    /** Parsed from the user agent when the session starts: browser or app, operating system, form factor. */
    clientName: text(),
    osName: text(),
    deviceType: text(),
    /** The address of the latest refresh (the session's first address is `ip`). */
    lastIp: inet(),
    /** Authentication methods (RFC 8176): `otp`, plus `pwd` once the session has stepped up. */
    amr: text().array().notNull(),
    lastActiveAt: instant().notNull().defaultNow(),
    /** Sliding: pushed forward on every refresh, capped by the absolute expiry. */
    idleExpiresAt: instant().notNull(),
    absoluteExpiresAt: instant().notNull(),
    /** Last password re-verification; step-up survives a token refresh inside its window. */
    steppedUpAt: instant(),
    revokedAt: instant(),
    revokeReason: sessionRevokeReason(),
    createdAt: createdAt(),
  },
  (t) => [index('auth_sessions_user_active_idx').on(t.userId).where(sql`${t.revokedAt} is null`)],
);

/**
 * Refresh tokens rotate on every use. Presenting one that was already used (outside a short
 * grace for two tabs refreshing at once) means it leaked, and revokes the whole session.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuidPk(),
    sessionId: uuid()
      .notNull()
      .references(() => authSessions.id, { onDelete: 'cascade' }),
    /** SHA-256 of the 256-bit opaque token. */
    tokenHash: bytea().notNull().unique('refresh_tokens_hash_uq'),
    issuedAt: instant().notNull().defaultNow(),
    expiresAt: instant().notNull(),
    usedAt: instant(),
    replacedBy: uuid(),
  },
  (t) => [index('refresh_tokens_session_idx').on(t.sessionId)],
);

/**
 * Single-use password reset codes a platform admin issued (sent as a link, or handed over). Only
 * a SHA-256 of the 256-bit code is stored; a newer code supersedes the older ones.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuidPk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: bytea().notNull().unique('password_reset_tokens_hash_uq'),
    channel: text().notNull(),
    /** The platform admin who issued it. */
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    expiresAt: instant().notNull(),
    usedAt: instant(),
    createdAt: createdAt(),
  },
  (t) => [
    index('password_reset_tokens_user_idx').on(t.userId).where(sql`${t.usedAt} is null`),
    check('password_reset_tokens_channel', sql`${t.channel} in ('sms', 'email', 'manual')`),
  ],
);

import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { Database } from '../../platform/db/database.js';
import { auditLogs, users } from '../../platform/db/schema/all.js';
import type { Unit } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';

/** OWASP's argon2id baseline: 19 MiB, two passes, one lane. */
const ARGON2 = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const MAX_FAILURES = 10;
const LOCK_MINUTES = 15;

/** At least 8 characters, at most 128, from at least two of: lower, upper, digits, symbols. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'must be at least 8 characters';
  if (password.length > 128) return 'must be at most 128 characters';
  const classes = [/[a-z]/, /[A-Z]/, /[0-9۰-۹]/, /[^a-zA-Z0-9۰-۹]/].filter((pattern) => pattern.test(password)).length;
  if (classes < 2) return 'must mix letters with digits or symbols';
  return null;
}

/**
 * Passwords: the step-up factor for sensitive actions (RFC §5.2), and, for accounts that set one,
 * an alternative to the SMS code at sign-in. Ten wrong passwords in a row, at either, lock the
 * password for fifteen minutes and text the owner of the number.
 */
@Injectable()
export class PasswordService {
  /** A hash of nothing anyone knows: unknown accounts cost the same Argon2 work as known ones. */
  private decoyHash: Promise<string> | null = null;

  constructor(
    private readonly database: Database,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  hash(password: string): Promise<string> {
    const problem = passwordProblem(password);
    if (problem) throw new ApiError('PASSWORD_TOO_WEAK', `The password ${problem}.`);
    return argon2.hash(password, ARGON2);
  }

  /**
   * Checks `password` for `userId` and records the outcome. Failures are committed on their own
   * (with an audit row) even though the request then fails, so the lockout counter is real.
   */
  async verify(userId: string, password: string): Promise<void> {
    const [user] = await this.database.db
      .select({
        phone: users.phone,
        passwordHash: users.passwordHash,
        resetRequired: users.passwordResetRequired,
        failures: users.failedPasswordAttempts,
        locked: sql<boolean>`coalesce(${users.lockedUntil} > now(), false)`,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new ApiError('UNAUTHENTICATED');
    if (!user.passwordHash) throw new ApiError('PASSWORD_REQUIRED');
    // A platform admin issued a reset code: the old password is retired until a new one is set.
    if (user.resetRequired) throw new ApiError('PASSWORD_RESET_REQUIRED');
    if (user.locked) throw new ApiError('ACCOUNT_LOCKED', `Try again in ${LOCK_MINUTES} minutes.`);

    if (await argon2.verify(user.passwordHash, password)) {
      if (user.failures > 0) {
        await this.database.db.update(users).set({ failedPasswordAttempts: 0, lockedUntil: null }).where(eq(users.id, userId));
      }
      return;
    }

    const lock = await this.recordFailure(userId, user.phone, user.failures);
    throw lock ? new ApiError('ACCOUNT_LOCKED', `Try again in ${LOCK_MINUTES} minutes.`) : new ApiError('PASSWORD_INVALID');
  }

  /**
   * Sign-in with phone and password: the account's id, or `CREDENTIALS_INVALID` — the same answer
   * for an unknown number, an account without a password, a suspended one and a wrong password,
   * after the same Argon2 work. Wrong passwords count toward the same lockout as step-up. A
   * locked account says so only to whoever knows its password. The old password of an account an
   * admin reset stops working (`PASSWORD_RESET_REQUIRED`, again only for the right password).
   */
  async authenticate(phone: string, password: string): Promise<string> {
    const [user] = await this.database.db
      .select({
        id: users.id,
        phone: users.phone,
        passwordHash: users.passwordHash,
        resetRequired: users.passwordResetRequired,
        usable: sql<boolean>`${users.status} = 'active'`,
        failures: users.failedPasswordAttempts,
        locked: sql<boolean>`coalesce(${users.lockedUntil} > now(), false)`,
      })
      .from(users)
      // A deleted account may share its number with the live one (the unique index is partial).
      .where(and(eq(users.phone, phone), isNull(users.deletedAt)));
    if (!user?.passwordHash || !user.usable) {
      await argon2.verify(await this.decoy(), password).catch(() => false);
      throw new ApiError('CREDENTIALS_INVALID');
    }
    const matches = await argon2.verify(user.passwordHash, password);
    if (user.locked) throw matches ? new ApiError('ACCOUNT_LOCKED', `Try again in ${LOCK_MINUTES} minutes.`) : new ApiError('CREDENTIALS_INVALID');
    if (matches) {
      if (user.resetRequired) throw new ApiError('PASSWORD_RESET_REQUIRED');
      if (user.failures > 0) {
        await this.database.db.update(users).set({ failedPasswordAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id));
      }
      return user.id;
    }
    const lock = await this.recordFailure(user.id, user.phone, user.failures, 'signin');
    throw lock ? new ApiError('ACCOUNT_LOCKED', `Try again in ${LOCK_MINUTES} minutes.`) : new ApiError('CREDENTIALS_INVALID');
  }

  /**
   * One more wrong password, committed on its own (with an audit row) even though the request
   * then fails, so the counter is real. The tenth locks the password and texts the owner.
   * Returns whether it locked.
   */
  private async recordFailure(userId: string, phone: string, failuresSoFar: number, via?: 'signin'): Promise<boolean> {
    const failures = failuresSoFar + 1;
    const lock = failures >= MAX_FAILURES;
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set(
          lock
            ? { failedPasswordAttempts: 0, lockedUntil: sql`now() + make_interval(mins => ${LOCK_MINUTES})` }
            : { failedPasswordAttempts: failures },
        )
        .where(eq(users.id, userId));
      await tx
        .insert(auditLogs)
        .values(this.audit.row({ action: lock ? 'auth.password.locked' : 'auth.password.failed', actorUserId: userId, ...(via ? { changes: { via } } : {}) }));
      if (lock) {
        await this.outbox.add(tx, {
          type: 'notification.sms',
          aggregateType: 'user',
          aggregateId: userId,
          payload: { to: phone, template: 'alert', tokens: { event: 'ورود با رمز عبور به دلیل تلاش‌های نادرست موقتاً قفل شد' } },
        });
      }
    });
    return lock;
  }

  private decoy(): Promise<string> {
    this.decoyHash ??= argon2.hash(randomBytes(24).toString('base64url'), ARGON2);
    return this.decoyHash;
  }

  /** Stores a hash from `hash()`; hashing happens before the transaction opens. */
  async store(unit: Unit, userId: string, passwordHash: string): Promise<void> {
    await unit.tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: sql`now()`, failedPasswordAttempts: 0, lockedUntil: null })
      .where(eq(users.id, userId));
  }
}

import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { sha256 } from '../../platform/crypto/crypto.js';
import { passwordResetTokens, users } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { RedisClients } from '../../platform/redis/redis.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';

/** Codes are 256-bit, so this only keeps a scripted client from hammering the endpoint. */
const ATTEMPTS_PER_IP_PER_HOUR = 30;

/**
 * The other half of an admin-issued reset: the person opens the link and chooses a new password.
 * The code is checked against its hash, used once, and only within its lifetime; the new password
 * passes the usual policy and is stored as an argon2id hash. Every session of the account ends
 * (as after any password change), and its owner gets a text saying so.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly redis: RedisClients,
  ) {}

  async complete(code: string, newPassword: string, ip: string | undefined): Promise<void> {
    await this.limit(ip);
    const passwordHash = await this.passwords.hash(newPassword);
    await this.uow.run({ workspaceId: null, userId: null }, async (unit) => {
      const { tx } = unit;
      const [row] = await tx
        .select({
          id: passwordResetTokens.id,
          userId: passwordResetTokens.userId,
          usable: sql<boolean>`${passwordResetTokens.usedAt} is null and ${passwordResetTokens.expiresAt} > now()`,
          phone: users.phone,
          active: sql<boolean>`${users.status} = 'active' and ${users.deletedAt} is null`,
        })
        .from(passwordResetTokens)
        .innerJoin(users, eq(users.id, passwordResetTokens.userId))
        .where(eq(passwordResetTokens.tokenHash, sha256(code)))
        .for('update', { of: [passwordResetTokens, users] });
      if (!row?.usable || !row.active) throw new ApiError('RESET_TOKEN_INVALID');

      await tx.update(passwordResetTokens).set({ usedAt: sql`now()` }).where(eq(passwordResetTokens.id, row.id));
      await this.passwords.store(unit, row.userId, passwordHash);
      await tx.update(users).set({ passwordResetRequired: false }).where(eq(users.id, row.userId));
      const signedOut = await this.sessions.revokeOthers(unit, row.userId, null, 'password_changed');
      await this.audit.write(tx, {
        action: 'auth.password.reset',
        actorUserId: row.userId,
        resourceType: 'user',
        resourceId: row.userId,
        changes: { resetId: row.id, sessionsSignedOut: signedOut },
      });
      await this.outbox.add(tx, {
        type: 'notification.sms',
        aggregateType: 'user',
        aggregateId: row.userId,
        payload: { to: row.phone, template: 'alert', tokens: { event: 'رمز عبور حساب شما با کد بازنشانی تغییر کرد' } },
      });
    });
  }

  /** Fixed window per IP, failing closed like the sign-in limits. */
  private async limit(ip: string | undefined): Promise<void> {
    const key = this.redis.key('password-reset', 'ip', ip ?? 'unknown');
    let count: number;
    let ttl: number;
    try {
      const results = await this.redis.core.multi().incr(key).expire(key, 3600, 'NX').ttl(key).exec();
      count = Number(results?.[0]?.[1] ?? 0);
      ttl = Number(results?.[2]?.[1] ?? 3600);
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Password reset is temporarily unavailable.');
    }
    if (count > ATTEMPTS_PER_IP_PER_HOUR) throw ApiError.rateLimited(ttl > 0 ? ttl : 3600);
  }
}

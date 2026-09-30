import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { AuthMethod, SessionView } from '@taskin/contracts';
import { AppConfig } from '../../config/app-config.js';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { randomToken, sha256 } from '../../platform/crypto/crypto.js';
import type { Tx } from '../../platform/db/database.js';
import { authSessions, refreshTokens, users } from '../../platform/db/schema/all.js';
import { UnitOfWork, type Unit } from '../../platform/db/unit-of-work.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { RevocationService } from './revocation.service.js';

type SessionRow = typeof authSessions.$inferSelect;
type UserRow = typeof users.$inferSelect;
type RevokeReason = NonNullable<SessionRow['revokeReason']>;

export interface DeviceInfo {
  readonly deviceLabel?: string | null;
  readonly userAgent?: string | null;
  readonly ip?: string | null;
}

export interface IssuedRefresh {
  readonly token: string;
  readonly expiresAt: Date;
}

export type RefreshOutcome =
  | { readonly kind: 'rotated'; readonly session: SessionRow; readonly user: UserRow; readonly refresh: IssuedRefresh }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'revoked' }
  | { readonly kind: 'reuse'; readonly userId: string };

/** Two tabs refreshing with the same token at once is not theft; one reused later is. */
const CONCURRENT_REFRESH_GRACE_SECONDS = 10;
const DAY_MS = 24 * 3600 * 1000;

/**
 * Sessions and refresh tokens. A session is one signed-in device; its refresh token rotates on
 * every use, and a rotated-out token presented again revokes the whole session (RFC §5.1).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly config: AppConfig,
    private readonly uow: UnitOfWork,
    private readonly revocations: RevocationService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async create(unit: Unit, userId: string, device: DeviceInfo, amr: readonly AuthMethod[]): Promise<{ session: SessionRow; refresh: IssuedRefresh }> {
    const now = Date.now();
    const absolute = new Date(now + this.config.env.REFRESH_ABSOLUTE_DAYS * DAY_MS);
    const idle = new Date(Math.min(now + this.config.env.REFRESH_IDLE_DAYS * DAY_MS, absolute.getTime()));
    const [session] = await unit.tx
      .insert(authSessions)
      .values({
        userId,
        deviceLabel: device.deviceLabel?.slice(0, 120) ?? null,
        userAgent: device.userAgent?.slice(0, 512) ?? null,
        ip: device.ip ?? null,
        amr: [...amr],
        idleExpiresAt: idle,
        absoluteExpiresAt: absolute,
      })
      .returning();
    if (!session) throw new Error('session insert returned nothing');
    const refresh = await this.issueRefresh(unit.tx, session.id, idle);
    return { session, refresh };
  }

  async rotate(presented: string): Promise<RefreshOutcome> {
    const hash = sha256(presented);
    return this.uow.run({ workspaceId: null, userId: null }, async (unit) => {
      const { tx } = unit;
      const [row] = await tx
        .select({
          token: refreshTokens,
          session: authSessions,
          user: users,
          recentlyUsed: sql<boolean>`${refreshTokens.usedAt} > now() - make_interval(secs => ${CONCURRENT_REFRESH_GRACE_SECONDS})`,
          tokenExpired: sql<boolean>`${refreshTokens.expiresAt} <= now()`,
          sessionExpired: sql<boolean>`${authSessions.idleExpiresAt} <= now() or ${authSessions.absoluteExpiresAt} <= now()`,
        })
        .from(refreshTokens)
        .innerJoin(authSessions, eq(authSessions.id, refreshTokens.sessionId))
        .innerJoin(users, eq(users.id, authSessions.userId))
        .where(eq(refreshTokens.tokenHash, hash))
        .for('update', { of: [refreshTokens, authSessions] });

      if (!row) return { kind: 'invalid' };
      const { token, session, user } = row;
      if (session.revokedAt) return { kind: 'revoked' };
      if (row.sessionExpired) {
        await this.revoke(unit, [session.id], 'expired', user.id);
        return { kind: 'revoked' };
      }
      if (user.status !== 'active' || user.deletedAt) return { kind: 'revoked' };

      if (token.usedAt && !row.recentlyUsed) {
        await this.revoke(unit, [session.id], 'reuse_detected', user.id);
        await this.audit.write(tx, {
          action: 'auth.refresh.reuse_detected',
          actorUserId: user.id,
          resourceType: 'session',
          resourceId: session.id,
        });
        await this.outbox.add(tx, {
          type: 'notification.sms',
          aggregateType: 'user',
          aggregateId: user.id,
          payload: { to: user.phone, template: 'alert', tokens: { event: 'نشستی به دلیل استفاده دوباره از توکن بسته شد' } },
        });
        return { kind: 'reuse', userId: user.id };
      }
      if (row.tokenExpired) return { kind: 'invalid' };

      const idle = new Date(Math.min(Date.now() + this.config.env.REFRESH_IDLE_DAYS * DAY_MS, session.absoluteExpiresAt.getTime()));
      const refresh = await this.issueRefresh(tx, session.id, idle);
      if (!token.usedAt) {
        await tx.update(refreshTokens).set({ usedAt: sql`now()` }).where(eq(refreshTokens.id, token.id));
      }
      const [updated] = await tx
        .update(authSessions)
        .set({ lastActiveAt: sql`now()`, idleExpiresAt: idle })
        .where(eq(authSessions.id, session.id))
        .returning();
      await this.audit.write(tx, { action: 'auth.refresh', actorUserId: user.id, resourceType: 'session', resourceId: session.id });
      return { kind: 'rotated', session: updated ?? session, user, refresh };
    });
  }

  /**
   * Revokes sessions inside the caller's unit. After commit, their ids go into the revocation
   * cache (so access tokens die now, not at expiry) and an event tells the gateway to drop sockets.
   */
  async revoke(unit: Unit, sessionIds: readonly string[], reason: RevokeReason, userId: string): Promise<void> {
    if (sessionIds.length === 0) return;
    const revoked = await unit.tx
      .update(authSessions)
      .set({ revokedAt: sql`now()`, revokeReason: reason })
      .where(and(inArray(authSessions.id, [...sessionIds]), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    const ids = revoked.map((row) => row.id);
    if (ids.length === 0) return;
    await this.outbox.add(unit.tx, {
      type: 'session.revoked',
      aggregateType: 'user',
      aggregateId: userId,
      payload: { userId, sessionIds: ids, reason },
    });
    unit.afterCommit(() => this.revocations.markRevoked(ids));
  }

  /** Every other live session of the user (password change, "sign out everywhere else"). */
  async revokeOthers(unit: Unit, userId: string, keepSessionId: string | null, reason: RevokeReason): Promise<number> {
    const others = await unit.tx
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.userId, userId),
          isNull(authSessions.revokedAt),
          keepSessionId ? ne(authSessions.id, keepSessionId) : undefined,
        ),
      );
    await this.revoke(unit, others.map((row) => row.id), reason, userId);
    return others.length;
  }

  async listActive(userId: string, currentSessionId: string): Promise<SessionView[]> {
    const rows = await this.uow.run({ workspaceId: null, userId }, ({ tx }) =>
      tx
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.userId, userId),
            isNull(authSessions.revokedAt),
            gt(authSessions.idleExpiresAt, sql`now()`),
            gt(authSessions.absoluteExpiresAt, sql`now()`),
          ),
        )
        .orderBy(desc(authSessions.lastActiveAt)),
    );
    return rows.map((session) => ({
      id: session.id,
      deviceLabel: session.deviceLabel,
      userAgent: session.userAgent,
      ip: session.ip,
      city: session.geoCity,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
      current: session.id === currentSessionId,
    }));
  }

  async find(tx: Tx, sessionId: string): Promise<SessionRow | undefined> {
    const [session] = await tx.select().from(authSessions).where(eq(authSessions.id, sessionId));
    return session;
  }

  private async issueRefresh(tx: Tx, sessionId: string, expiresAt: Date): Promise<IssuedRefresh> {
    const token = randomToken(32);
    await tx.insert(refreshTokens).values({ sessionId, tokenHash: sha256(token), expiresAt });
    return { token, expiresAt };
  }
}

import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PasswordResetRequiredBody, PlatformModerationResult } from '@taskin/contracts';
import { users } from '../../platform/db/schema/all.js';
import { type Unit, UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import { RevocationService } from '../auth/revocation.service.js';
import { SessionService } from '../auth/session.service.js';
import { PlatformAdminUnitOfWork } from './admin-unit-of-work.js';
import type { PlatformAdmin } from './platform-admin.guard.js';
import { PlatformAuditWriter } from './platform-audit.writer.js';
import { summary, USER_COLUMNS, type UserRow } from './platform-users.service.js';

type Target = Pick<typeof users.$inferSelect, 'id' | 'status' | 'isPlatformAdmin' | 'passwordResetRequired' | 'deletedAt'>;

/**
 * Phase 2 of the platform admin: acting on an account. Suspending stops it at once: the status
 * and security version change in one transaction with ending every session, so its access tokens,
 * refresh tokens and sockets all stop (the cached standing is dropped after commit). Requiring a
 * password reset retires the password until its owner sets a new one.
 *
 * Writes go through the ordinary unit of work, like the phase 1 actions; the platform audit row is
 * part of the same transaction, so an action that cannot be recorded does not happen. The result
 * is re-read through the read-only admin pool.
 */
@Injectable()
export class PlatformModerationService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly admins: PlatformAdminUnitOfWork,
    private readonly sessions: SessionService,
    private readonly revocations: RevocationService,
    private readonly auditLog: PlatformAuditWriter,
  ) {}

  async suspend(admin: PlatformAdmin, userId: string, reason: string): Promise<PlatformModerationResult> {
    const { changed, sessionsRevoked } = await this.uow.run({ workspaceId: null, userId: admin.userId }, async (unit) => {
      const target = await this.lockTarget(unit, admin, userId);
      // A platform admin is demoted with the CLI first; one admin cannot lock another out from here.
      if (target.isPlatformAdmin) throw new ApiError('ADMIN_TARGET_PROTECTED');
      const already = target.status === 'suspended';
      let revoked = 0;
      if (!already) {
        await unit.tx
          .update(users)
          .set({ status: 'suspended', securityVersion: sql`${users.securityVersion} + 1` })
          .where(eq(users.id, userId));
        revoked = await this.sessions.revokeOthers(unit, userId, null, 'admin_action');
        unit.afterCommit(() => this.revocations.forgetStanding(userId));
      }
      await this.auditLog.record(
        admin,
        {
          action: 'admin.user.suspend',
          targetUserId: userId,
          resourceType: 'user',
          resourceId: userId,
          metadata: { reason: reason.trim(), previousStatus: target.status, sessionsRevoked: revoked, changed: !already },
        },
        unit,
      );
      return { changed: !already, sessionsRevoked: revoked };
    });
    return this.result(admin, userId, sessionsRevoked, changed);
  }

  async unsuspend(admin: PlatformAdmin, userId: string, reason: string | undefined): Promise<PlatformModerationResult> {
    const changed = await this.uow.run({ workspaceId: null, userId: admin.userId }, async (unit) => {
      const target = await this.lockTarget(unit, admin, userId);
      const suspended = target.status === 'suspended';
      if (suspended) {
        await unit.tx.update(users).set({ status: 'active' }).where(eq(users.id, userId));
        unit.afterCommit(() => this.revocations.forgetStanding(userId));
      }
      await this.auditLog.record(
        admin,
        {
          action: 'admin.user.unsuspend',
          targetUserId: userId,
          resourceType: 'user',
          resourceId: userId,
          metadata: { reason: reason?.trim() || null, previousStatus: target.status, changed: suspended },
        },
        unit,
      );
      return suspended;
    });
    return this.result(admin, userId, 0, changed);
  }

  /**
   * Requires (or stops requiring) a new password. While required, the password signs nobody in
   * and opens no step-up; its owner sets a new one with an SMS code («فراموشی رمز عبور») or an
   * admin-issued reset link, either of which clears the flag. Requiring it signs every session
   * out unless `signOut` is `false`.
   */
  async setPasswordResetRequired(admin: PlatformAdmin, userId: string, body: PasswordResetRequiredBody): Promise<PlatformModerationResult> {
    const signOut = body.required && body.signOut !== false;
    const { changed, sessionsRevoked } = await this.uow.run({ workspaceId: null, userId: admin.userId }, async (unit) => {
      const target = await this.lockTarget(unit, admin, userId);
      const differs = target.passwordResetRequired !== body.required;
      if (differs) await unit.tx.update(users).set({ passwordResetRequired: body.required }).where(eq(users.id, userId));
      const revoked = signOut ? await this.sessions.revokeOthers(unit, userId, null, 'admin_action') : 0;
      await this.auditLog.record(
        admin,
        {
          action: 'admin.user.password_reset_required',
          targetUserId: userId,
          resourceType: 'user',
          resourceId: userId,
          metadata: { required: body.required, signOut, sessionsRevoked: revoked, reason: body.reason?.trim() || null, changed: differs },
        },
        unit,
      );
      return { changed: differs, sessionsRevoked: revoked };
    });
    return this.result(admin, userId, sessionsRevoked, changed);
  }

  /** The target row, locked for the change; never one's own account, never a deleted one. */
  private async lockTarget(unit: Unit, admin: PlatformAdmin, userId: string): Promise<Target> {
    if (userId === admin.userId) throw new ApiError('ADMIN_SELF_ACTION');
    const [target] = await unit.tx
      .select({
        id: users.id,
        status: users.status,
        isPlatformAdmin: users.isPlatformAdmin,
        passwordResetRequired: users.passwordResetRequired,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');
    if (!target || target.deletedAt || target.status === 'deleted') throw ApiError.notFound('The user');
    return target;
  }

  /** The account as the directory now shows it (read-only pool; not a separate "view" in the audit). */
  private async result(admin: PlatformAdmin, userId: string, sessionsRevoked: number, changed: boolean): Promise<PlatformModerationResult> {
    const [row] = await this.admins.read(admin, async (tx) => (await tx.execute<UserRow>(sql`select ${USER_COLUMNS} from users u where u.id = ${userId}`)).rows);
    if (!row) throw ApiError.notFound('The user');
    return { user: summary(row), sessionsRevoked, changed };
  }
}

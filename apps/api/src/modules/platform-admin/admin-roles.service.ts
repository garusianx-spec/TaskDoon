import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { AdministrativeUser, AssignAdminRoleBody, UpdateAdminRoleBody } from '@taskin/contracts';
import { authChallenges, users } from '../../platform/db/schema/all.js';
import { type Unit, UnitOfWork } from '../../platform/db/unit-of-work.js';
import { isUniqueViolation } from '../../platform/db/pg-errors.js';
import { ApiError } from '../../platform/http/api-error.js';
import { administrativeStatus, isPrimaryOwner, platformRole } from '../../platform/security/platform-role-policy.js';
import { toIranMobileE164 } from '../auth/otp.service.js';
import { RevocationService } from '../auth/revocation.service.js';
import { SessionService } from '../auth/session.service.js';
import type { PlatformAdmin } from './platform-admin.guard.js';
import { PlatformAuditWriter } from './platform-audit.writer.js';

type User = typeof users.$inferSelect;
const view = (u: User): AdministrativeUser => ({ id: u.id, fullName: u.fullName, phone: u.phone, email: u.email, role: platformRole(u) ?? 'ADMIN', status: administrativeStatus(u), createdAt: u.createdAt.toISOString(), protected: isPrimaryOwner(u.phone) });

/** Global administrative roles; writes and their audit records commit atomically. */
@Injectable()
export class AdminRolesService {
  constructor(private readonly uow: UnitOfWork, private readonly audit: PlatformAuditWriter, private readonly sessions: SessionService, private readonly revocations: RevocationService) {}

  private async authority(unit: Unit, actor: PlatformAdmin): Promise<void> {
    const [user] = await unit.tx.select().from(users).where(eq(users.id, actor.userId)).for('update');
    if (!user || user.deletedAt || user.status !== 'active' || user.platformAdminStatus !== 'ACTIVE' || platformRole(user) !== 'SUPER_ADMIN') throw ApiError.forbidden('A super administrator is required.');
  }
  private async invalidate(unit: Unit, id: string): Promise<void> {
    await unit.tx.update(users).set({ securityVersion: sql`${users.securityVersion} + 1` }).where(eq(users.id, id));
    await unit.tx.update(authChallenges).set({ consumedAt: sql`now()` }).where(and(eq(authChallenges.userId, id), isNull(authChallenges.consumedAt)));
    await this.sessions.revokeOthers(unit, id, null, 'admin_action');
    unit.afterCommit(() => this.revocations.forgetStanding(id));
  }
  async list(actor: PlatformAdmin): Promise<AdministrativeUser[]> {
    return this.uow.run({ workspaceId: null, userId: actor.userId }, async unit => {
      await this.authority(unit, actor);
      const rows = await unit.tx.select().from(users).where(and(eq(users.isPlatformAdmin, true), isNull(users.deletedAt))).orderBy(desc(users.createdAt));
      await this.audit.record(actor, { action: 'admin.roles.list', metadata: { count: rows.length } }, unit);
      return rows.map(view);
    });
  }
  async assign(actor: PlatformAdmin, body: AssignAdminRoleBody): Promise<AdministrativeUser> {
    const phone = toIranMobileE164(body.phone);
    if (!phone) throw ApiError.validation([{ field: 'phone', message: 'not an Iranian mobile number' }]);
    if (body.fullName.trim().length < 2) throw ApiError.validation([{ field: 'fullName', message: 'Provide the full administrator name.' }]);
    if (isPrimaryOwner(phone)) throw new ApiError('ADMIN_TARGET_PROTECTED');
    try {
      return await this.uow.run({ workspaceId: null, userId: actor.userId }, async unit => {
        await this.authority(unit, actor);
        // Serialize concurrent provisioning of the same phone, including the previously absent case.
        await unit.tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${phone}, 0))`);
        const [existing] = await unit.tx.select().from(users).where(and(eq(users.phone, phone), isNull(users.deletedAt))).for('update');
        if (existing?.isPlatformAdmin) throw new ApiError('CONFLICT', 'This account already has administrative access.');
        if (existing && existing.status !== 'active') throw new ApiError('CONFLICT', 'Restore the account before assigning administrative access.');
        const values = { fullName: body.fullName.trim(), email: body.recoveryEmail.trim().toLowerCase(), emailVerifiedAt: null, isPlatformAdmin: true, platformAdminRole: body.role, adminSetupRequired: true, platformAdminStatus: 'PENDING_SETUP' as const };
        const [user] = existing
          ? await unit.tx.update(users).set(values).where(eq(users.id, existing.id)).returning()
          : await unit.tx.insert(users).values({ ...values, phone, phoneVerifiedAt: null }).returning();
        if (!user) throw new ApiError('CONFLICT');
        await this.invalidate(unit, user.id);
        await this.audit.record(actor, { action: 'admin.roles.assign', targetUserId: user.id, resourceType: 'user', resourceId: user.id, metadata: { role: body.role, preProvisioned: !existing } }, unit);
        return view(user);
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_uq') || isUniqueViolation(error, 'users_phone_uq')) throw new ApiError('CONFLICT', 'The phone or email is already assigned.');
      throw error;
    }
  }
  async update(actor: PlatformAdmin, id: string, body: UpdateAdminRoleBody): Promise<AdministrativeUser> {
    if (body.role === undefined && body.suspended === undefined) throw ApiError.validation([{ field: 'role', message: 'Provide a role or suspension change.' }]);
    return this.uow.run({ workspaceId: null, userId: actor.userId }, async unit => {
      await this.authority(unit, actor);
      const target = await this.target(unit, actor, id);
      // Resuming a pending setup must not skip its phone/email/password proofs.
      const status = body.suspended === true ? 'SUSPENDED' : body.suspended === false ? target.adminSetupRequired ? 'PENDING_SETUP' : 'ACTIVE' : target.platformAdminStatus;
      const [updated] = await unit.tx.update(users).set({ ...(body.role ? { platformAdminRole: body.role } : {}), platformAdminStatus: status }).where(eq(users.id, id)).returning();
      await this.invalidate(unit, id);
      await this.audit.record(actor, { action: 'admin.roles.update', targetUserId: id, resourceType: 'user', resourceId: id, metadata: { role: body.role ?? target.platformAdminRole, status } }, unit);
      if (!updated) throw new ApiError('CONFLICT');
      return view(updated);
    });
  }
  async revoke(actor: PlatformAdmin, id: string): Promise<void> {
    await this.uow.run({ workspaceId: null, userId: actor.userId }, async unit => {
      await this.authority(unit, actor);
      await this.target(unit, actor, id);
      await unit.tx.update(users).set({ isPlatformAdmin: false, platformAdminRole: null, adminSetupRequired: false, platformAdminStatus: 'ACTIVE' }).where(eq(users.id, id));
      await this.invalidate(unit, id);
      await this.audit.record(actor, { action: 'admin.roles.revoke', targetUserId: id, resourceType: 'user', resourceId: id }, unit);
    });
  }
  private async target(unit: Unit, actor: PlatformAdmin, id: string): Promise<User> {
    const [user] = await unit.tx.select().from(users).where(and(eq(users.id, id), isNull(users.deletedAt))).for('update');
    if (!user?.isPlatformAdmin) throw ApiError.notFound('The administrator');
    if (isPrimaryOwner(user.phone)) throw new ApiError('ADMIN_TARGET_PROTECTED');
    if (actor.userId === id) throw new ApiError('ADMIN_SELF_ACTION');
    return user;
  }
}

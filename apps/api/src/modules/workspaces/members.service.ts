import { Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { MemberView, RoleId, UpdateMemberBody, UpdatePresenceBody } from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import type { Tx } from '../../platform/db/database.js';
import { departments, projectMembers, projectStars, roles, users, workspaceMembers, workspaces } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { PresenceDirectory } from '../../platform/realtime/presence-directory.js';
import { RealtimePublisher } from '../../platform/realtime/realtime-publisher.js';
import { rooms } from '../../platform/realtime/rooms.js';
import { AbilityFactory } from '../rbac/ability.js';
import { MembershipService } from '../rbac/membership.service.js';

/**
 * The rank rules beyond the matrix (RFC §5.3 rule 6): a member manages only members and roles
 * ranked strictly below their own, and the owner is never changed this way.
 */
export function assertCanManage(actor: MembershipContext, target: { readonly rank: number; readonly isOwner: boolean }): void {
  if (target.isOwner) throw new ApiError('OWNER_IMMUTABLE', 'Transfer ownership first.');
  if (!actor.isOwner && target.rank <= actor.rank) throw new ApiError('ROLE_RANK_VIOLATION');
}

/**
 * Days a removed member's place is kept: re-invited within them, they get their conversations and
 * projects back as they were. Their messages, tasks, comments and activity are never deleted.
 */
export const DEPARTED_MEMBER_DAYS = 40;

interface TargetRow {
  readonly userId: string;
  readonly status: 'active' | 'suspended' | 'left';
  readonly rank: number;
  readonly roleKey: string;
  readonly hasPassword: boolean;
}

@Injectable()
export class MembersService {
  private readonly logger = new Logger('MembersService');

  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly abilities: AbilityFactory,
    private readonly memberships: MembershipService,
    private readonly presence: PresenceDirectory,
    private readonly realtime: RealtimePublisher,
  ) {}

  /**
   * Members with their manual status and, from the gateway, whether they are connected now.
   * `includeFormer` adds people who were removed or left: their messages, tasks and activity stay,
   * so clients still name them (as former members; their phone and email are not shown).
   */
  async list(member: MembershipContext, options: { readonly includeFormer?: boolean } = {}): Promise<MemberView[]> {
    const statuses: Array<'active' | 'suspended' | 'left'> = options.includeFormer ? ['active', 'suspended', 'left'] : ['active', 'suspended'];
    const rows = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, ({ tx }) =>
      tx
        .select({ m: workspaceMembers, u: users, roleKey: roles.key })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .innerJoin(roles, and(eq(roles.workspaceId, workspaceMembers.workspaceId), eq(roles.id, workspaceMembers.roleId)))
        .where(and(eq(workspaceMembers.workspaceId, member.workspaceId), inArray(workspaceMembers.status, statuses)))
        .orderBy(asc(roles.rank), asc(users.fullName)),
    );
    const online = await this.presence.online(rows.map(({ u }) => u.id));
    return rows.map(({ m, u, roleKey }) => this.view(m, u, roleKey as RoleId, member.ownerUserId, online.has(u.id)));
  }

  async update(actor: MembershipContext, targetUserId: string, body: UpdateMemberBody): Promise<MemberView> {
    const ability = this.abilities.forMember(actor);
    if (body.role !== undefined && !ability.can('assign', 'Member')) throw ApiError.forbidden();
    if ((body.departmentId !== undefined || body.jobTitle !== undefined || body.status !== undefined) && !ability.can('edit', 'Member')) {
      throw ApiError.forbidden();
    }
    const online = await this.presence.online([targetUserId]);
    return this.uow.run({ workspaceId: actor.workspaceId, userId: actor.userId }, async (unit) => {
      const target = await this.target(unit.tx, actor.workspaceId, targetUserId);
      assertCanManage(actor, { rank: target.rank, isOwner: targetUserId === actor.ownerUserId });

      let roleId: string | undefined;
      if (body.role !== undefined && body.role !== target.roleKey) {
        if (body.role === 'owner') throw new ApiError('OWNER_IMMUTABLE', 'Use the ownership transfer.');
        const [role] = await unit.tx
          .select({ id: roles.id, rank: roles.rank })
          .from(roles)
          .where(and(eq(roles.workspaceId, actor.workspaceId), eq(roles.key, body.role)));
        if (!role) throw ApiError.validation([{ field: 'role', message: 'unknown role' }]);
        if (!actor.isOwner && role.rank <= actor.rank) throw new ApiError('ROLE_RANK_VIOLATION');
        if (body.role === 'admin' && !target.hasPassword) {
          throw new ApiError('PASSWORD_REQUIRED', 'An admin needs an admin password; ask them to set one first.');
        }
        roleId = role.id;
      }
      if (body.departmentId) await this.assertDepartment(unit.tx, actor.workspaceId, body.departmentId);

      const [updated] = await unit.tx
        .update(workspaceMembers)
        .set({
          ...(roleId ? { roleId } : {}),
          ...(body.departmentId !== undefined ? { departmentId: body.departmentId } : {}),
          ...(body.jobTitle !== undefined ? { jobTitle: body.jobTitle.trim() } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
        })
        .where(and(eq(workspaceMembers.workspaceId, actor.workspaceId), eq(workspaceMembers.userId, targetUserId)))
        .returning();
      if (!updated) throw ApiError.notFound('The member');
      if (roleId || (body.status !== undefined && body.status !== target.status)) {
        await this.memberships.bump(unit, actor.workspaceId);
        await this.outbox.add(unit.tx, {
          type: 'rbac.changed',
          aggregateType: 'workspace',
          aggregateId: actor.workspaceId,
          workspaceId: actor.workspaceId,
          payload: { workspaceId: actor.workspaceId, userIds: [targetUserId] },
        });
      }
      await this.audit.write(unit.tx, {
        action: roleId ? 'member.role.change' : 'member.update',
        workspaceId: actor.workspaceId,
        resourceType: 'member',
        resourceId: targetUserId,
        changes: { before: { role: target.roleKey, status: target.status }, after: body },
      });
      const [user] = await unit.tx.select().from(users).where(eq(users.id, targetUserId));
      if (!user) throw ApiError.notFound('The member');
      return this.view(updated, user, (body.role ?? target.roleKey) as RoleId, actor.ownerUserId, online.has(targetUserId));
    });
  }

  /**
   * Worker: forgets what people gone for {@link DEPARTED_MEMBER_DAYS} days still held — project
   * memberships and stars — so a much later invitation starts afresh. Everything they wrote stays,
   * and so does their member row, the anchor of that history.
   */
  async purgeDeparted(limit = 50): Promise<number> {
    const due = await this.uow.run({ workspaceId: null, userId: null }, ({ tx }) =>
      tx.execute<{ workspace_id: string; user_id: string }>(sql`select * from app.departed_members_due(${DEPARTED_MEMBER_DAYS}, ${limit})`),
    );
    let purged = 0;
    for (const { workspace_id: workspaceId, user_id: userId } of due.rows) {
      await this.uow.run({ workspaceId, userId: null }, async ({ tx }) => {
        // Re-invited meanwhile: they keep everything.
        const [still] = await tx
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, 'left')))
          .for('update');
        if (!still) return;
        await tx.delete(projectMembers).where(and(eq(projectMembers.workspaceId, workspaceId), eq(projectMembers.userId, userId)));
        await tx.delete(projectStars).where(and(eq(projectStars.workspaceId, workspaceId), eq(projectStars.userId, userId)));
        await this.audit.write(tx, { action: 'member.state_purge', workspaceId, actorUserId: null, resourceType: 'member', resourceId: userId });
      });
      this.logger.log({ workspaceId, userId }, 'departed member state purged');
      purged += 1;
    }
    return purged;
  }

  /**
   * Removes a member. Nothing they wrote goes: messages, tasks, comments and activity keep their
   * name (clients show them as a former member). They leave every conversation; their project
   * memberships stay for {@link DEPARTED_MEMBER_DAYS} days, so re-inviting them restores both.
   * Their sessions stay (they may belong to other workspaces).
   */
  async remove(actor: MembershipContext, targetUserId: string): Promise<void> {
    const ability = this.abilities.forMember(actor);
    if (!ability.can('delete', 'Member')) throw ApiError.forbidden();
    await this.uow.run({ workspaceId: actor.workspaceId, userId: actor.userId }, async (unit) => {
      const target = await this.target(unit.tx, actor.workspaceId, targetUserId);
      assertCanManage(actor, { rank: target.rank, isOwner: targetUserId === actor.ownerUserId });
      await unit.tx
        .update(workspaceMembers)
        .set({ status: 'left', leftAt: sql`now()` })
        .where(and(eq(workspaceMembers.workspaceId, actor.workspaceId), eq(workspaceMembers.userId, targetUserId)));
      await unit.tx
        .update(workspaces)
        .set({ memberCount: sql`greatest(${workspaces.memberCount} - 1, 0)` })
        .where(eq(workspaces.id, actor.workspaceId));
      // Out of every conversation of the workspace too (RFC §14 #18); their messages stay.
      await unit.tx.execute(sql`
        update conversation_members set left_at = now(), pinned_at = null
        where workspace_id = ${actor.workspaceId} and user_id = ${targetUserId} and left_at is null`);
      await this.memberships.bump(unit, actor.workspaceId);
      await this.audit.write(unit.tx, {
        action: 'member.remove',
        workspaceId: actor.workspaceId,
        resourceType: 'member',
        resourceId: targetUserId,
        changes: { before: { role: target.roleKey, status: target.status } },
      });
      await this.outbox.add(unit.tx, {
        type: 'member.removed',
        aggregateType: 'workspace',
        aggregateId: actor.workspaceId,
        workspaceId: actor.workspaceId,
        payload: { workspaceId: actor.workspaceId, userId: targetUserId },
      });
    });
  }

  /** The caller's own presence and status line in this workspace. */
  async updatePresence(member: MembershipContext, body: UpdatePresenceBody): Promise<void> {
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx, afterCommit }) => {
      afterCommit(async () => {
        const online = await this.presence.online([member.userId]);
        await this.realtime.emit({
          type: 'presence:updated',
          workspaceId: member.workspaceId,
          rooms: [rooms.workspace(member.workspaceId)],
          data: {
            userId: member.userId,
            online: online.has(member.userId),
            presence: body.presence,
            ...(body.statusMessage !== undefined ? { statusMessage: body.statusMessage.trim() } : {}),
          },
        });
      });
      await tx
        .update(workspaceMembers)
        .set({ presenceStatus: body.presence, ...(body.statusMessage !== undefined ? { statusMessage: body.statusMessage.trim() } : {}) })
        .where(and(eq(workspaceMembers.workspaceId, member.workspaceId), eq(workspaceMembers.userId, member.userId)));
      await this.audit.write(tx, {
        action: 'member.presence.update',
        workspaceId: member.workspaceId,
        resourceType: 'member',
        resourceId: member.userId,
        changes: { after: body },
      });
    });
  }

  private async target(tx: Tx, workspaceId: string, userId: string): Promise<TargetRow> {
    const [row] = await tx
      .select({
        userId: workspaceMembers.userId,
        status: workspaceMembers.status,
        rank: roles.rank,
        roleKey: roles.key,
        hasPassword: sql<boolean>`${users.passwordHash} is not null`,
      })
      .from(workspaceMembers)
      .innerJoin(roles, and(eq(roles.workspaceId, workspaceMembers.workspaceId), eq(roles.id, workspaceMembers.roleId)))
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .for('update', { of: workspaceMembers });
    if (!row || row.status === 'left') throw ApiError.notFound('The member');
    return row;
  }

  private async assertDepartment(tx: Tx, workspaceId: string, departmentId: string): Promise<void> {
    const [department] = await tx
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.workspaceId, workspaceId), eq(departments.id, departmentId)));
    if (!department) throw ApiError.validation([{ field: 'departmentId', message: 'unknown department' }]);
  }

  private view(
    m: typeof workspaceMembers.$inferSelect,
    u: typeof users.$inferSelect,
    role: RoleId,
    ownerUserId: string,
    online: boolean,
  ): MemberView {
    return {
      userId: u.id,
      fullName: u.fullName,
      phone: u.phone,
      email: u.email,
      avatarTone: u.avatarTone,
      role,
      isOwner: u.id === ownerUserId,
      departmentId: m.departmentId,
      jobTitle: m.jobTitle,
      status: m.status,
      presence: m.presenceStatus,
      online,
      statusMessage: m.statusMessage,
      joinedAt: m.joinedAt.toISOString(),
      // A former member: named on their history, nothing more.
      ...(m.status === 'left' ? { phone: '', email: null, online: false, statusMessage: '', leftAt: m.leftAt?.toISOString() ?? null } : {}),
    };
  }
}

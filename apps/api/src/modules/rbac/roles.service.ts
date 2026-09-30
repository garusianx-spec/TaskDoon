import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import {
  DEFAULT_PERMISSION_MATRIX,
  grantedCells,
  type MyPermissions,
  type RoleId,
  type RolePermissions,
  type RoleView,
} from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import type { Tx } from '../../platform/db/database.js';
import { rolePermissions, roles, workspaceMembers } from '../../platform/db/schema/all.js';
import { UnitOfWork, type Unit } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { AbilityFactory, ALL_CELLS, cell, grantsToRow } from './ability.js';
import { MembershipService } from './membership.service.js';

type RoleRow = typeof roles.$inferSelect;

/**
 * The workspace permission matrix (RFC §5.3). Editing a role replaces its whole row, guarded by
 * the row's version (`If-Match`), the rank rule (only roles below your own) and the no-escalation
 * rule (you cannot grant a cell you do not hold). The owner row never changes.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly abilities: AbilityFactory,
    private readonly memberships: MembershipService,
  ) {}

  async list(member: MembershipContext): Promise<RoleView[]> {
    if (!this.abilities.forMember(member).can('view', 'Role')) throw ApiError.forbidden();
    return this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const rows = await tx
        .select({
          role: roles,
          grants: sql<string[]>`coalesce(array_agg(${rolePermissions.module}::text || ':' || ${rolePermissions.action}::text) filter (where ${rolePermissions.module} is not null), '{}')`,
        })
        .from(roles)
        .leftJoin(rolePermissions, and(eq(rolePermissions.workspaceId, roles.workspaceId), eq(rolePermissions.roleId, roles.id)))
        .where(eq(roles.workspaceId, member.workspaceId))
        .groupBy(roles.id)
        .orderBy(asc(roles.rank));
      const counts = await tx
        .select({ roleId: workspaceMembers.roleId, members: count() })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, member.workspaceId), inArray(workspaceMembers.status, ['active', 'suspended'])))
        .groupBy(workspaceMembers.roleId);
      return rows.map(({ role, grants }) => this.view(role, grants, counts.find((c) => c.roleId === role.id)?.members ?? 0));
    });
  }

  async replace(actor: MembershipContext, roleId: string, permissions: RolePermissions, ifMatch: string | undefined): Promise<RoleView> {
    if (!this.abilities.forMember(actor).can('edit', 'Role')) throw ApiError.forbidden();
    if (ifMatch === undefined) throw new ApiError('PRECONDITION_REQUIRED');
    const expected = Number(ifMatch.replaceAll('"', '').replace(/^W\//, ''));
    return this.uow.run({ workspaceId: actor.workspaceId, userId: actor.userId }, async (unit) => {
      const role = await this.lockRole(unit.tx, actor.workspaceId, roleId);
      if (role.version !== expected) throw new ApiError('PRECONDITION_FAILED', `The role is at version ${role.version}.`);
      const updated = await this.replaceRow(unit, actor, role, permissions);
      const [members] = await unit.tx
        .select({ members: count() })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, actor.workspaceId), eq(workspaceMembers.roleId, role.id)));
      return this.view(updated.role, updated.grants, members?.members ?? 0);
    });
  }

  /** Puts every role the actor may manage back to the shipping defaults. */
  async resetDefaults(actor: MembershipContext): Promise<RoleView[]> {
    if (!this.abilities.forMember(actor).can('edit', 'Role')) throw ApiError.forbidden();
    await this.uow.run({ workspaceId: actor.workspaceId, userId: actor.userId }, async (unit) => {
      const rows = await unit.tx.select().from(roles).where(eq(roles.workspaceId, actor.workspaceId)).orderBy(asc(roles.rank)).for('update');
      for (const role of rows) {
        if (role.isLocked || !role.isSystem || (!actor.isOwner && role.rank <= actor.rank)) continue;
        await this.replaceRow(unit, actor, role, DEFAULT_PERMISSION_MATRIX[role.key as RoleId]);
      }
    });
    return this.list(actor);
  }

  permissionsOf(member: MembershipContext): MyPermissions {
    return {
      workspaceId: member.workspaceId,
      role: member.roleKey,
      isOwner: member.isOwner,
      permissions: grantsToRow(member.grants),
      rbacVersion: member.rbacVersion,
    };
  }

  private async replaceRow(unit: Unit, actor: MembershipContext, role: RoleRow, permissions: RolePermissions) {
    if (role.isLocked) throw new ApiError('OWNER_IMMUTABLE');
    if (!actor.isOwner && role.rank <= actor.rank) throw new ApiError('ROLE_RANK_VIOLATION');
    const next = grantedCells(permissions).map(({ module, action }) => ({ module, action, key: cell(module, action) }));
    if (!actor.isOwner) {
      const beyond = next.filter((entry) => !actor.grants.includes(entry.key));
      if (beyond.length > 0) {
        throw new ApiError('PRIVILEGE_ESCALATION', `You do not hold: ${beyond.map((entry) => entry.key).join(', ')}.`);
      }
    }
    const before = await unit.tx
      .select({ module: rolePermissions.module, action: rolePermissions.action })
      .from(rolePermissions)
      .where(and(eq(rolePermissions.workspaceId, role.workspaceId), eq(rolePermissions.roleId, role.id)));
    await unit.tx.delete(rolePermissions).where(and(eq(rolePermissions.workspaceId, role.workspaceId), eq(rolePermissions.roleId, role.id)));
    if (next.length > 0) {
      await unit.tx
        .insert(rolePermissions)
        .values(next.map(({ module, action }) => ({ workspaceId: role.workspaceId, roleId: role.id, module, action })));
    }
    const [updated] = await unit.tx
      .update(roles)
      .set({ version: sql`${roles.version} + 1` })
      .where(eq(roles.id, role.id))
      .returning();
    await this.memberships.bump(unit, role.workspaceId);
    await this.audit.write(unit.tx, {
      action: 'rbac.permissions.replace',
      workspaceId: role.workspaceId,
      resourceType: 'role',
      resourceId: role.id,
      changes: {
        role: role.key,
        before: before.map((entry) => cell(entry.module, entry.action)),
        after: next.map((entry) => entry.key),
      },
    });
    await this.outbox.add(unit.tx, {
      type: 'rbac.changed',
      aggregateType: 'workspace',
      aggregateId: role.workspaceId,
      workspaceId: role.workspaceId,
      payload: { workspaceId: role.workspaceId },
    });
    return { role: updated ?? role, grants: next.map((entry) => entry.key) };
  }

  private async lockRole(tx: Tx, workspaceId: string, roleId: string): Promise<RoleRow> {
    const [role] = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.workspaceId, workspaceId), eq(roles.id, roleId)))
      .for('update');
    if (!role) throw ApiError.notFound('The role');
    return role;
  }

  private view(role: RoleRow, grants: readonly string[], memberCount: number): RoleView {
    return {
      id: role.id,
      key: role.key as RoleId,
      rank: role.rank,
      locked: role.isLocked,
      memberCount,
      permissions: grantsToRow(role.isLocked ? ALL_CELLS : grants),
      version: role.version,
    };
  }
}

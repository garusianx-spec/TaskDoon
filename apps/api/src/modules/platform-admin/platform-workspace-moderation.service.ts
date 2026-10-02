import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { PlatformWorkspaceModerationResult, WorkspaceLimitOverrides, WorkspaceLimitsBody } from '@taskin/contracts';
import { plans, roles, users, workspaceMembers, workspaces } from '../../platform/db/schema/all.js';
import { type Unit, UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { MembershipService } from '../rbac/membership.service.js';
import { PlatformAdminUnitOfWork } from './admin-unit-of-work.js';
import type { PlatformAdmin } from './platform-admin.guard.js';
import { PlatformAuditWriter } from './platform-audit.writer.js';
import { summary, WORKSPACE_COLUMNS, WORKSPACE_JOINS, type WorkspaceRow } from './platform-workspaces.service.js';

type Workspace = Pick<typeof workspaces.$inferSelect, 'id' | 'ownerUserId' | 'planId' | 'memberCount' | 'suspendedAt' | 'limitOverrides' | 'deletedAt'>;

/** The limits an admin may override, in the order they are stored and compared. */
const LIMIT_KEYS = ['maxMembers', 'storageBytes', 'maxFileBytes', 'messageHistoryDays', 'maxProjects'] as const;

/** Only the keys that were given, in a fixed order; nothing at all is `null`. */
function normalise(overrides: WorkspaceLimitOverrides | null): WorkspaceLimitOverrides | null {
  if (!overrides) return null;
  const kept: Record<string, number | null> = {};
  for (const key of LIMIT_KEYS) if (overrides[key] !== undefined) kept[key] = overrides[key] ?? null;
  return Object.keys(kept).length > 0 ? (kept as WorkspaceLimitOverrides) : null;
}

/**
 * Phase 3 of the platform admin: acting on a workspace. Suspending it stops every member at once
 * (the permission version moves, so no cached membership survives, and open sockets are told);
 * the emergency ownership transfer and the limits work as the owner's own settings would.
 *
 * Writes go through the ordinary unit of work, scoped to the workspace (its tenant policies only
 * check that), with the platform audit row and its `audit_logs` twin in the same transaction: an
 * action that cannot be recorded does not happen. The result is re-read through the read-only
 * admin pool.
 */
@Injectable()
export class PlatformWorkspaceModerationService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly admins: PlatformAdminUnitOfWork,
    private readonly memberships: MembershipService,
    private readonly outbox: OutboxWriter,
    private readonly auditLog: PlatformAuditWriter,
  ) {}

  async suspend(admin: PlatformAdmin, workspaceId: string, reason: string): Promise<PlatformWorkspaceModerationResult> {
    const changed = await this.uow.run({ workspaceId, userId: admin.userId }, async (unit) => {
      const workspace = await this.lock(unit, workspaceId);
      const already = workspace.suspendedAt !== null;
      if (!already) {
        await unit.tx.update(workspaces).set({ suspendedAt: sql`now()` }).where(eq(workspaces.id, workspaceId));
        await this.everyoneRechecked(unit, workspaceId);
      }
      await this.auditLog.record(
        admin,
        {
          action: 'admin.workspace.suspend',
          workspaceId,
          resourceType: 'workspace',
          resourceId: workspaceId,
          metadata: { reason: reason.trim(), changed: !already, memberCount: workspace.memberCount },
        },
        unit,
      );
      return !already;
    });
    return this.result(admin, workspaceId, changed);
  }

  async unsuspend(admin: PlatformAdmin, workspaceId: string, reason: string | undefined): Promise<PlatformWorkspaceModerationResult> {
    const changed = await this.uow.run({ workspaceId, userId: admin.userId }, async (unit) => {
      const workspace = await this.lock(unit, workspaceId);
      const suspended = workspace.suspendedAt !== null;
      if (suspended) {
        await unit.tx.update(workspaces).set({ suspendedAt: null }).where(eq(workspaces.id, workspaceId));
        await this.everyoneRechecked(unit, workspaceId);
      }
      await this.auditLog.record(
        admin,
        {
          action: 'admin.workspace.unsuspend',
          workspaceId,
          resourceType: 'workspace',
          resourceId: workspaceId,
          metadata: { reason: reason?.trim() || null, changed: suspended },
        },
        unit,
      );
      return suspended;
    });
    return this.result(admin, workspaceId, changed);
  }

  /**
   * The emergency override of the owner's own transfer: the new owner must be an active member
   * with an active account, but needs no password yet (they are asked for one by the first owner
   * action that takes a step-up). The previous owner stays on as an admin.
   */
  async transferOwnership(admin: PlatformAdmin, workspaceId: string, userId: string, reason: string): Promise<PlatformWorkspaceModerationResult> {
    await this.uow.run({ workspaceId, userId: admin.userId }, async (unit) => {
      const workspace = await this.lock(unit, workspaceId);
      if (workspace.ownerUserId === userId) throw new ApiError('ALREADY_OWNER');
      const [target] = await unit.tx
        .select({ status: workspaceMembers.status, account: users.status, deletedAt: users.deletedAt, hasPassword: sql<boolean>`${users.passwordHash} is not null` })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
      if (!target || target.status !== 'active' || target.account !== 'active' || target.deletedAt) throw new ApiError('OWNERSHIP_TARGET_INVALID');

      const roleIds = Object.fromEntries(
        (await unit.tx.select({ id: roles.id, key: roles.key }).from(roles).where(eq(roles.workspaceId, workspaceId))).map((role) => [role.key, role.id]),
      );
      const previousOwnerId = workspace.ownerUserId;
      await unit.tx.update(workspaces).set({ ownerUserId: userId }).where(eq(workspaces.id, workspaceId));
      await unit.tx
        .update(workspaceMembers)
        .set({ roleId: roleIds.owner })
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
      await unit.tx
        .update(workspaceMembers)
        .set({ roleId: roleIds.admin })
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, previousOwnerId)));
      await this.memberships.bump(unit, workspaceId);
      await this.outbox.add(unit.tx, {
        type: 'rbac.changed',
        aggregateType: 'workspace',
        aggregateId: workspaceId,
        workspaceId,
        payload: { workspaceId, userIds: [previousOwnerId, userId] },
      });
      await this.auditLog.record(
        admin,
        {
          action: 'admin.workspace.transfer_ownership',
          workspaceId,
          targetUserId: userId,
          resourceType: 'workspace',
          resourceId: workspaceId,
          metadata: { reason: reason.trim(), previousOwnerId, newOwnerHasPassword: target.hasPassword },
        },
        unit,
      );
    });
    return this.result(admin, workspaceId, true);
  }

  /**
   * Moves the workspace to another plan and/or replaces the admin's overrides of its limits
   * (`null` clears them; omitted leaves them). Lowering a limit below what is in use takes nothing
   * away: it only stops the next member, project or upload.
   */
  async setLimits(admin: PlatformAdmin, workspaceId: string, body: WorkspaceLimitsBody): Promise<PlatformWorkspaceModerationResult> {
    const changed = await this.uow.run({ workspaceId, userId: admin.userId }, async (unit) => {
      const workspace = await this.lock(unit, workspaceId);
      if (body.planId !== undefined) {
        const [plan] = await unit.tx.select({ id: plans.id }).from(plans).where(eq(plans.id, body.planId));
        if (!plan) throw ApiError.notFound('The plan');
      }
      const before = { planId: workspace.planId, overrides: normalise(workspace.limitOverrides ?? null) };
      const after = { planId: body.planId ?? workspace.planId, overrides: body.overrides === undefined ? before.overrides : normalise(body.overrides) };
      const differs = after.planId !== before.planId || JSON.stringify(after.overrides) !== JSON.stringify(before.overrides);
      if (differs) {
        await unit.tx.update(workspaces).set({ planId: after.planId, limitOverrides: after.overrides }).where(eq(workspaces.id, workspaceId));
      }
      await this.auditLog.record(
        admin,
        {
          action: 'admin.workspace.limits',
          workspaceId,
          resourceType: 'workspace',
          resourceId: workspaceId,
          metadata: { reason: body.reason.trim(), before, after, changed: differs },
        },
        unit,
      );
      return differs;
    });
    return this.result(admin, workspaceId, changed);
  }

  /** Every cached membership goes, and every open socket of the workspace is checked again. */
  private async everyoneRechecked(unit: Unit, workspaceId: string): Promise<void> {
    await this.memberships.bump(unit, workspaceId);
    await this.outbox.add(unit.tx, { type: 'rbac.changed', aggregateType: 'workspace', aggregateId: workspaceId, workspaceId, payload: { workspaceId } });
  }

  /** The workspace row, locked for the change; never a deleted one. */
  private async lock(unit: Unit, workspaceId: string): Promise<Workspace> {
    const [workspace] = await unit.tx
      .select({
        id: workspaces.id,
        ownerUserId: workspaces.ownerUserId,
        planId: workspaces.planId,
        memberCount: workspaces.memberCount,
        suspendedAt: workspaces.suspendedAt,
        limitOverrides: workspaces.limitOverrides,
        deletedAt: workspaces.deletedAt,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for('update');
    if (!workspace || workspace.deletedAt) throw ApiError.notFound('The workspace');
    return workspace;
  }

  /** The workspace as the admin list shows it (read-only pool; not a separate "view" in the audit). */
  private async result(admin: PlatformAdmin, workspaceId: string, changed: boolean): Promise<PlatformWorkspaceModerationResult> {
    const [row] = await this.admins.read(
      admin,
      async (tx) => (await tx.execute<WorkspaceRow>(sql`select ${WORKSPACE_COLUMNS} from workspaces w ${WORKSPACE_JOINS} where w.id = ${workspaceId}`)).rows,
    );
    if (!row) throw ApiError.notFound('The workspace');
    return { workspace: summary(row), changed };
  }
}

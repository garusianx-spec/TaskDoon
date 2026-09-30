import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { CreateWorkspaceBody, PlanLimits, UpdateWorkspaceBody, WorkspaceSettings, WorkspaceView } from '@taskin/contracts';
import { monogram } from '@taskin/text';
import { AppConfig } from '../../config/app-config.js';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import type { Tx } from '../../platform/db/database.js';
import { plans, roles, users, workspaceMembers, workspaces } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { AuthPrincipal, MembershipContext } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { StorageService } from '../../platform/storage/storage.js';
import { AbilityFactory } from '../rbac/ability.js';
import { MembershipService } from '../rbac/membership.service.js';
import { ICON_URL_TTL_SECONDS } from '../users/users.service.js';
import { IconsService } from './icons.service.js';
import { seedWorkspace } from './workspace-seed.js';

type WorkspaceRow = typeof workspaces.$inferSelect;

const TIME_ZONES = new Set(Intl.supportedValuesOf('timeZone'));

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger('WorkspacesService');

  constructor(
    private readonly config: AppConfig,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
    private readonly storage: StorageService,
    private readonly icons: IconsService,
    private readonly abilities: AbilityFactory,
    private readonly memberships: MembershipService,
  ) {}

  /**
   * Creates a workspace owned by the caller, with the five system roles, the default matrix and
   * departments. Becoming an owner is an elevation, so the caller needs an admin password first.
   */
  async create(principal: AuthPrincipal, body: CreateWorkspaceBody): Promise<WorkspaceView> {
    const workspaceId = uuidv7();
    const [owner] = await this.uow.run({ workspaceId: null, userId: principal.userId }, ({ tx }) =>
      tx.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, principal.userId)),
    );
    if (!owner?.passwordHash) throw new ApiError('PASSWORD_REQUIRED', 'Owners need an admin password; set one first.');
    const iconKey = body.iconUploadKey ? await this.icons.claim(principal.userId, body.iconUploadKey, workspaceId) : null;

    const row = await this.uow.run({ workspaceId, userId: principal.userId }, async (unit) => {
      const name = body.name.trim();
      const [workspace] = await unit.tx
        .insert(workspaces)
        .values({
          id: workspaceId,
          slug: `ws-${randomBytes(6).toString('hex')}`,
          name,
          description: body.description?.trim() ?? '',
          initials: monogram(name),
          tone: body.tone ?? 'brand',
          iconKey,
          ownerUserId: principal.userId,
        })
        .returning();
      if (!workspace) throw new Error('workspace insert returned nothing');
      const roleIds = await seedWorkspace(unit.tx, workspaceId);
      await unit.tx.insert(workspaceMembers).values({ workspaceId, userId: principal.userId, roleId: roleIds.owner });
      await this.audit.write(unit.tx, {
        action: 'workspace.create',
        workspaceId,
        resourceType: 'workspace',
        resourceId: workspaceId,
        changes: { after: { name: workspace.name, tone: workspace.tone, plan: workspace.planId } },
      });
      await this.outbox.add(unit.tx, {
        type: 'workspace.created',
        aggregateType: 'workspace',
        aggregateId: workspaceId,
        workspaceId,
        payload: { workspaceId, ownerId: principal.userId },
      });
      return workspace;
    });
    return this.view(row, await this.limits(row.planId));
  }

  async get(member: MembershipContext): Promise<WorkspaceView> {
    const { row, limits } = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async ({ tx }) => {
      const [joined] = await tx
        .select({ row: workspaces, limits: plans.limits })
        .from(workspaces)
        .innerJoin(plans, eq(plans.id, workspaces.planId))
        .where(and(eq(workspaces.id, member.workspaceId), isNull(workspaces.deletedAt)));
      if (!joined) throw ApiError.notFound('The workspace');
      return joined;
    });
    return this.view(row, limits);
  }

  async update(member: MembershipContext, body: UpdateWorkspaceBody): Promise<WorkspaceView> {
    if (!this.abilities.forMember(member).can('edit', 'WorkspaceSettings')) throw ApiError.forbidden();
    if (body.settings?.timeZone && !TIME_ZONES.has(body.settings.timeZone)) {
      throw ApiError.validation([{ field: 'settings.timeZone', message: 'must be an IANA time zone' }]);
    }
    const iconKey =
      body.iconUploadKey === undefined
        ? undefined
        : body.iconUploadKey === null
          ? null
          : await this.icons.claim(member.userId, body.iconUploadKey, member.workspaceId);

    const { before, after } = await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async (unit) => {
      const before = await this.lock(unit.tx, member.workspaceId);
      // DTO instances carry every declared field, set or not; merge only what was sent.
      const patch = Object.fromEntries(Object.entries(body.settings ?? {}).filter(([, value]) => value !== undefined));
      const settings: WorkspaceSettings | undefined = body.settings ? { ...before.settings, ...patch } : undefined;
      const name = body.name?.trim();
      const [after] = await unit.tx
        .update(workspaces)
        .set({
          ...(name !== undefined ? { name, initials: monogram(name) } : {}),
          ...(body.description !== undefined ? { description: body.description.trim() } : {}),
          ...(body.tone !== undefined ? { tone: body.tone } : {}),
          ...(iconKey !== undefined ? { iconKey } : {}),
          ...(settings ? { settings } : {}),
        })
        .where(eq(workspaces.id, member.workspaceId))
        .returning();
      if (!after) throw ApiError.notFound('The workspace');
      await this.audit.write(unit.tx, {
        action: 'workspace.update',
        workspaceId: member.workspaceId,
        resourceType: 'workspace',
        resourceId: member.workspaceId,
        changes: {
          before: { name: before.name, description: before.description, tone: before.tone, iconKey: before.iconKey, settings: before.settings },
          after: { name: after.name, description: after.description, tone: after.tone, iconKey: after.iconKey, settings: after.settings },
        },
      });
      return { before, after };
    });
    if (iconKey !== undefined && before.iconKey && before.iconKey !== after.iconKey) {
      await this.storage.delete(before.iconKey).catch(() => undefined);
    }
    return this.view(after, await this.limits(after.planId));
  }

  /**
   * Owner only, after a password step-up and typing the exact name. The workspace disappears at
   * once (every member gets 404) and its data is purged after the grace period.
   */
  async remove(member: MembershipContext, confirmName: string): Promise<void> {
    if (!member.isOwner) throw ApiError.forbidden('Only the owner can delete the workspace.');
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async (unit) => {
      const workspace = await this.lock(unit.tx, member.workspaceId);
      if (workspace.name !== confirmName) throw new ApiError('WORKSPACE_NAME_MISMATCH');
      const graceDays = this.config.env.WORKSPACE_PURGE_GRACE_DAYS;
      const [deleted] = await unit.tx
        .update(workspaces)
        .set({ deletedAt: sql`now()`, purgeAfter: sql`now() + make_interval(days => ${graceDays})` })
        .where(eq(workspaces.id, member.workspaceId))
        .returning({ purgeAfter: workspaces.purgeAfter });
      await this.memberships.bump(unit, member.workspaceId);
      await this.audit.write(unit.tx, {
        action: 'workspace.delete',
        workspaceId: member.workspaceId,
        resourceType: 'workspace',
        resourceId: member.workspaceId,
        changes: { before: { name: workspace.name }, purgeAfter: deleted?.purgeAfter?.toISOString() },
      });
      await this.outbox.add(unit.tx, {
        type: 'workspace.deleted',
        aggregateType: 'workspace',
        aggregateId: member.workspaceId,
        workspaceId: member.workspaceId,
        payload: { workspaceId: member.workspaceId, purgeAfter: deleted?.purgeAfter?.toISOString() ?? '' },
      });
    });
  }

  /** Owner only, after a step-up. The new owner needs an admin password; the old owner becomes an admin. */
  async transferOwnership(member: MembershipContext, targetUserId: string): Promise<void> {
    if (!member.isOwner) throw ApiError.forbidden('Only the owner can transfer the workspace.');
    if (targetUserId === member.userId) throw new ApiError('CONFLICT', 'You already own this workspace.');
    await this.uow.run({ workspaceId: member.workspaceId, userId: member.userId }, async (unit) => {
      await this.lock(unit.tx, member.workspaceId);
      const [target] = await unit.tx
        .select({ status: workspaceMembers.status, passwordHash: users.passwordHash })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(and(eq(workspaceMembers.workspaceId, member.workspaceId), eq(workspaceMembers.userId, targetUserId)));
      if (!target || target.status !== 'active') throw ApiError.notFound('The member');
      if (!target.passwordHash) throw new ApiError('PASSWORD_REQUIRED', 'The new owner needs an admin password first.');
      const roleIds = Object.fromEntries(
        (await unit.tx.select({ id: roles.id, key: roles.key }).from(roles).where(eq(roles.workspaceId, member.workspaceId))).map(
          (role) => [role.key, role.id],
        ),
      );
      await unit.tx.update(workspaces).set({ ownerUserId: targetUserId }).where(eq(workspaces.id, member.workspaceId));
      await unit.tx
        .update(workspaceMembers)
        .set({ roleId: roleIds.owner })
        .where(and(eq(workspaceMembers.workspaceId, member.workspaceId), eq(workspaceMembers.userId, targetUserId)));
      await unit.tx
        .update(workspaceMembers)
        .set({ roleId: roleIds.admin })
        .where(and(eq(workspaceMembers.workspaceId, member.workspaceId), eq(workspaceMembers.userId, member.userId)));
      await this.memberships.bump(unit, member.workspaceId);
      await this.audit.write(unit.tx, {
        action: 'workspace.ownership.transfer',
        workspaceId: member.workspaceId,
        resourceType: 'workspace',
        resourceId: member.workspaceId,
        changes: { before: { ownerId: member.userId }, after: { ownerId: targetUserId } },
      });
      await this.outbox.add(unit.tx, {
        type: 'rbac.changed',
        aggregateType: 'workspace',
        aggregateId: member.workspaceId,
        workspaceId: member.workspaceId,
        payload: { workspaceId: member.workspaceId, userIds: [member.userId, targetUserId] },
      });
    });
  }

  /** Worker: hard-deletes workspaces whose grace period ended, with their files. */
  async purgeDue(limit = 20): Promise<number> {
    const due = await this.uow.run({ workspaceId: null, userId: null }, ({ tx }) =>
      tx.execute<{ id: string }>(sql`select id from app.workspaces_due_for_purge(${limit}) as id`),
    );
    let purged = 0;
    for (const { id } of due.rows) {
      await this.uow.run({ workspaceId: id, userId: null }, async (unit) => {
        await unit.tx.delete(workspaces).where(eq(workspaces.id, id));
        await this.audit.write(unit.tx, { action: 'workspace.purge', workspaceId: id, actorUserId: null, resourceType: 'workspace', resourceId: id });
        await this.outbox.add(unit.tx, { type: 'workspace.purged', aggregateType: 'workspace', aggregateId: id, workspaceId: id, payload: { workspaceId: id } });
      });
      const files = await this.storage.deletePrefix(`ws/${id}/`).catch((error: unknown) => {
        this.logger.error({ workspaceId: id, error: error instanceof Error ? error.message : String(error) }, 'purging workspace files failed');
        return 0;
      });
      this.logger.log({ workspaceId: id, files }, 'workspace purged');
      purged += 1;
    }
    return purged;
  }

  private async lock(tx: Tx, workspaceId: string): Promise<WorkspaceRow> {
    const [workspace] = await tx
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)))
      .for('update');
    if (!workspace) throw ApiError.notFound('The workspace');
    return workspace;
  }

  private async limits(planId: string): Promise<PlanLimits> {
    const [plan] = await this.uow.run({ workspaceId: null, userId: null }, ({ tx }) =>
      tx.select({ limits: plans.limits }).from(plans).where(eq(plans.id, planId)),
    );
    if (!plan) throw new Error(`plan ${planId} is missing; run the seeds`);
    return plan.limits;
  }

  private async view(row: WorkspaceRow, limits: PlanLimits): Promise<WorkspaceView> {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      initials: row.initials,
      tone: row.tone,
      iconUrl: row.iconKey ? await this.storage.presignGet(row.iconKey, ICON_URL_TTL_SECONDS) : null,
      ownerId: row.ownerUserId,
      planId: row.planId,
      limits,
      memberCount: row.memberCount,
      settings: row.settings,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

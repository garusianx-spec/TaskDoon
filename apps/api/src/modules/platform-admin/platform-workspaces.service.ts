import { Injectable } from '@nestjs/common';
import { type SQL, sql } from 'drizzle-orm';
import type {
  PlanLimits,
  PlatformAuditPage,
  PlatformWorkspaceDetail,
  PlatformWorkspacePage,
  PlatformWorkspaceStatus,
  PlatformWorkspaceSummary,
  WorkspaceLimitOverrides,
} from '@taskin/contracts';
import { mergeLimits } from '../../platform/db/plan-limits.js';
import { iso, isoOrNull, num } from '../../platform/db/rows.js';
import { ApiError } from '../../platform/http/api-error.js';
import { ALL_CELLS } from '../rbac/ability.js';
import { decodeCursor, encodeCursor, likeContains, roleName } from './admin-queries.js';
import { PlatformAdminUnitOfWork } from './admin-unit-of-work.js';
import type { PlatformAdmin } from './platform-admin.guard.js';
import { PlatformAuditWriter } from './platform-audit.writer.js';

export interface WorkspaceRow extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
  plan: string;
  owner_id: string;
  owner_name: string;
  member_count: number;
  created_at: string;
  cursor_at: string;
  deleted_at: string | null;
  suspended_at: string | null;
}

interface AuditRow extends Record<string, unknown> {
  id: string;
  admin_id: string;
  admin_name: string;
  target_user_id: string | null;
  target_name: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  trace_id: string | null;
  target_workspace_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export const WORKSPACE_COLUMNS = sql`
  w.id, w.name, w.slug, pl.name as plan, w.owner_user_id as owner_id, u.full_name as owner_name, w.member_count,
  w.created_at, w.created_at::text as cursor_at, w.deleted_at, w.suspended_at`;

export const WORKSPACE_JOINS = sql`join plans pl on pl.id = w.plan_id join users u on u.id = w.owner_user_id`;

/** Phase 3: a deleted workspace is deleted, whatever else it was. */
function statusOf(row: WorkspaceRow): PlatformWorkspaceStatus {
  return row.deleted_at ? 'deleted' : row.suspended_at ? 'suspended' : 'active';
}

export function summary(row: WorkspaceRow): PlatformWorkspaceSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    memberCount: num(row.member_count),
    createdAt: iso(row.created_at),
    deletedAt: isoOrNull(row.deleted_at),
    status: statusOf(row),
    suspendedAt: isoOrNull(row.suspended_at),
  };
}

interface QuotaRow extends Record<string, unknown> {
  plan_id: string;
  plan_name: string;
  plan_limits: PlanLimits;
  limit_overrides: WorkspaceLimitOverrides | null;
  member_count: number | string;
  storage_used_bytes: number | string;
  projects: number | string;
}

/**
 * «ورک‌اسپیس‌ها و نقش‌ها»: every workspace, its roles with their permission matrix, and who holds
 * which role; plus the platform audit log itself. Reading the audit log is not itself logged.
 */
@Injectable()
export class PlatformWorkspacesService {
  constructor(
    private readonly admins: PlatformAdminUnitOfWork,
    private readonly auditLog: PlatformAuditWriter,
  ) {}

  async list(
    admin: PlatformAdmin,
    filters: { readonly q?: string; readonly status?: PlatformWorkspaceStatus; readonly cursor?: string; readonly limit?: number },
  ): Promise<PlatformWorkspacePage> {
    const limit = filters.limit ?? 50;
    const cursor = decodeCursor(filters.cursor);
    const where: SQL[] = [];
    const q = filters.q?.trim();
    if (q) where.push(sql`(w.name ilike ${likeContains(q)} or w.slug ilike ${likeContains(q)})`);
    if (filters.status === 'deleted') where.push(sql`w.deleted_at is not null`);
    if (filters.status === 'suspended') where.push(sql`w.deleted_at is null and w.suspended_at is not null`);
    if (filters.status === 'active') where.push(sql`w.deleted_at is null and w.suspended_at is null`);
    if (cursor) where.push(sql`(w.created_at, w.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`);
    const rows = await this.admins.read(admin, async (tx) =>
      (
        await tx.execute<WorkspaceRow>(sql`
          select ${WORKSPACE_COLUMNS} from workspaces w ${WORKSPACE_JOINS}
          where ${where.length > 0 ? sql.join(where, sql` and `) : sql`true`}
          order by w.created_at desc, w.id desc
          limit ${limit + 1}`)
      ).rows,
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    await this.auditLog.record(admin, {
      action: 'admin.workspaces.search',
      metadata: { filters: { q: q ?? null, ...(filters.status ? { status: filters.status } : {}) }, results: page.length },
    });
    return { items: page.map(summary), nextCursor: rows.length > limit && last ? encodeCursor(last.cursor_at, last.id) : null };
  }

  async detail(admin: PlatformAdmin, workspaceId: string): Promise<PlatformWorkspaceDetail> {
    const { workspace, roles, members, suspension, quota, planOptions } = await this.admins.read(admin, async (tx) => {
      const [row] = (await tx.execute<WorkspaceRow>(sql`select ${WORKSPACE_COLUMNS} from workspaces w ${WORKSPACE_JOINS} where w.id = ${workspaceId}`)).rows;
      if (!row) throw ApiError.notFound('The workspace');
      const roleRows = await tx.execute<{ id: string; key: string; rank: number; is_locked: boolean; grants: string[] | null; member_count: string }>(sql`
        select r.id, r.key, r.rank, r.is_locked,
          (select array_agg(rp.module::text || ':' || rp.action::text order by rp.module, rp.action) from role_permissions rp
           where rp.workspace_id = r.workspace_id and rp.role_id = r.id) as grants,
          (select count(*) from workspace_members wm where wm.workspace_id = r.workspace_id and wm.role_id = r.id and wm.status <> 'left') as member_count
        from roles r where r.workspace_id = ${workspaceId}
        order by r.rank, r.key`);
      const memberRows = await tx.execute<{
        user_id: string;
        full_name: string;
        phone: string;
        role_key: string;
        status: PlatformWorkspaceDetail['members'][number]['status'];
        is_owner: boolean;
        joined_at: string;
        left_at: string | null;
        account_status: 'active' | 'suspended' | 'deleted';
        has_password: boolean;
      }>(sql`
        select wm.user_id, u.full_name, u.phone, r.key as role_key, wm.status, w.owner_user_id = wm.user_id as is_owner, wm.joined_at, wm.left_at,
          case when u.deleted_at is not null then 'deleted' else u.status::text end as account_status, u.password_hash is not null as has_password
        from workspace_members wm
        join users u on u.id = wm.user_id
        join roles r on r.workspace_id = wm.workspace_id and r.id = wm.role_id
        join workspaces w on w.id = wm.workspace_id
        where wm.workspace_id = ${workspaceId}
        order by r.rank, wm.status = 'left', u.full_name
        limit 1000`);
      // Phase 3: while suspended, the suspension that took effect (from the platform audit log).
      const suspended = row.suspended_at && !row.deleted_at
        ? (
            await tx.execute<{ created_at: string; reason: string | null; admin_id: string | null; admin_name: string | null }>(sql`
              select l.created_at, l.metadata ->> 'reason' as reason, l.admin_id, a.full_name as admin_name
              from platform_audit_logs l left join users a on a.id = l.admin_id
              where l.target_workspace_id = ${workspaceId} and l.action = 'admin.workspace.suspend' and coalesce((l.metadata ->> 'changed')::boolean, true)
              order by l.id desc limit 1`)
          ).rows[0] ?? null
        : null;
      const [quotaRow] = (
        await tx.execute<QuotaRow>(sql`
          select pl.id as plan_id, pl.name as plan_name, pl.limits as plan_limits, w.limit_overrides, w.member_count, w.storage_used_bytes,
            (select count(*) from projects p where p.workspace_id = w.id and p.deleted_at is null) as projects
          from workspaces w join plans pl on pl.id = w.plan_id
          where w.id = ${workspaceId}`)
      ).rows;
      const plans = await tx.execute<{ id: string; name: string; limits: PlanLimits }>(
        sql`select id, name, limits from plans order by (limits ->> 'maxMembers')::int, id`,
      );
      return { workspace: row, roles: roleRows.rows, members: memberRows.rows, suspension: suspended, quota: quotaRow, planOptions: plans.rows };
    });
    await this.auditLog.record(admin, { action: 'admin.workspace.view', resourceType: 'workspace', resourceId: workspaceId });
    return {
      ...summary(workspace),
      roles: roles.map((row) => ({
        id: row.id,
        key: row.key,
        name: roleName(row.key),
        rank: Number(row.rank),
        // The owner row is locked to every cell, as the RBAC screen shows it.
        grants: row.is_locked ? [...ALL_CELLS] : (row.grants ?? []),
        memberCount: num(row.member_count),
      })),
      members: members.map((row) => ({
        userId: row.user_id,
        fullName: row.full_name,
        phone: row.phone,
        roleKey: row.role_key,
        roleName: roleName(row.role_key),
        status: row.status,
        isOwner: row.is_owner,
        joinedAt: iso(row.joined_at),
        leftAt: isoOrNull(row.left_at),
        accountStatus: row.account_status,
        hasPassword: row.has_password,
      })),
      suspension: suspension ? { at: iso(suspension.created_at), reason: suspension.reason, adminId: suspension.admin_id, adminName: suspension.admin_name } : null,
      ...(quota
        ? {
            quota: {
              planId: quota.plan_id,
              planName: quota.plan_name,
              overrides: quota.limit_overrides,
              effective: mergeLimits(quota.plan_limits, quota.limit_overrides),
              usage: { members: num(quota.member_count), storageUsedBytes: num(quota.storage_used_bytes), projects: num(quota.projects) },
            },
          }
        : {}),
      planOptions: planOptions.map((plan) => ({ id: plan.id, name: plan.name, limits: plan.limits })),
    };
  }

  /** Newest first; `action` matches itself and every action under it (`admin.messages` → `admin.messages.read`). */
  async audit(
    admin: PlatformAdmin,
    filters: {
      readonly adminId?: string;
      readonly targetUserId?: string;
      readonly action?: string;
      readonly workspaceId?: string;
      readonly cursor?: string;
      readonly limit?: number;
    },
  ): Promise<PlatformAuditPage> {
    const limit = filters.limit ?? 50;
    const where: SQL[] = [];
    if (filters.adminId) where.push(sql`l.admin_id = ${filters.adminId}`);
    if (filters.targetUserId) where.push(sql`l.target_user_id = ${filters.targetUserId}`);
    if (filters.action) where.push(sql`(l.action = ${filters.action} or l.action like ${`${filters.action.replace(/_/g, '\\_')}.%`})`);
    // Phase 3: what was done to a workspace, and (before the column existed) every look at it.
    if (filters.workspaceId) where.push(sql`(l.target_workspace_id = ${filters.workspaceId} or (l.resource_type = 'workspace' and l.resource_id = ${filters.workspaceId}))`);
    if (filters.cursor) {
      const before = Number(Buffer.from(filters.cursor, 'base64url').toString('utf8'));
      if (!Number.isSafeInteger(before) || before < 1) throw ApiError.validation([{ field: 'cursor', message: 'is not a cursor from this list' }]);
      where.push(sql`l.id < ${before}`);
    }
    const rows = await this.admins.read(admin, async (tx) =>
      (
        await tx.execute<AuditRow>(sql`
          select l.id, l.admin_id, a.full_name as admin_name, l.target_user_id, t.full_name as target_name, l.action,
            l.resource_type, l.resource_id, host(l.ip) as ip, l.user_agent, l.request_id, l.trace_id, l.target_workspace_id, l.metadata, l.created_at
          from platform_audit_logs l
          join users a on a.id = l.admin_id
          left join users t on t.id = l.target_user_id
          where ${where.length > 0 ? sql.join(where, sql` and `) : sql`true`}
          order by l.id desc
          limit ${limit + 1}`)
      ).rows,
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: Number(row.id),
        adminId: row.admin_id,
        adminName: row.admin_name,
        targetUserId: row.target_user_id,
        targetName: row.target_name,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        ip: row.ip,
        userAgent: row.user_agent,
        requestId: row.request_id,
        traceId: row.trace_id ?? null,
        workspaceId: row.target_workspace_id ?? null,
        metadata: row.metadata,
        createdAt: iso(row.created_at),
      })),
      nextCursor: rows.length > limit && last ? Buffer.from(String(last.id), 'utf8').toString('base64url') : null,
    };
  }
}

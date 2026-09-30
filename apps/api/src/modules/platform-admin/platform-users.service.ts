import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull, gt, type SQL, sql } from 'drizzle-orm';
import type {
  PasswordResetChannel,
  PasswordResetIssued,
  PlatformMembership,
  PlatformSessionStatus,
  PlatformSessionView,
  PlatformUserDetail,
  PlatformUserPage,
  PlatformUserStatus,
  PlatformUserSummary,
  ProjectRole,
} from '@taskin/contracts';
import { toLatinDigits } from '@taskin/text';
import { AppConfig } from '../../config/app-config.js';
import { randomToken, SecretBox, sha256 } from '../../platform/crypto/crypto.js';
import type { Tx } from '../../platform/db/database.js';
import { iso, isoOrNull, num } from '../../platform/db/rows.js';
import { authSessions, passwordResetTokens, users } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import { maskPhone } from '../../platform/logging/logging.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { toIranMobileE164 } from '../auth/otp.service.js';
import { SessionService } from '../auth/session.service.js';
import { decodeCursor, encodeCursor, likeContains, maskEmail, roleName } from './admin-queries.js';
import { PlatformAdminUnitOfWork } from './admin-unit-of-work.js';
import type { PlatformAdmin } from './platform-admin.guard.js';
import { PlatformAuditWriter } from './platform-audit.writer.js';

export interface PlatformUserFilters {
  readonly q?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly status?: PlatformUserStatus;
  readonly platformRole?: 'admin' | 'user';
  readonly cursor?: string;
  readonly limit?: number;
}

interface UserRow extends Record<string, unknown> {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  status: PlatformUserStatus;
  is_platform_admin: boolean;
  has_password: boolean;
  password_reset_required: boolean;
  password_changed_at: string | null;
  created_at: string;
  cursor_at: string;
  workspace_count: string;
  active_session_count: string;
  last_active_at: string | null;
}

interface MembershipRow extends Record<string, unknown> {
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  workspace_deleted: boolean;
  is_owner: boolean;
  role_key: string;
  member_status: PlatformMembership['memberStatus'];
  department: string | null;
  job_title: string;
  joined_at: string;
  left_at: string | null;
  projects: { id: string; key: string; name: string; role: ProjectRole }[];
}

/** One person's line in the directory, with the counts the list shows. */
const USER_COLUMNS = sql`
  u.id, u.full_name, u.phone, u.email, u.status, u.is_platform_admin, u.password_hash is not null as has_password,
  u.password_reset_required, u.password_changed_at, u.created_at, u.created_at::text as cursor_at,
  (select count(*) from workspace_members wm where wm.user_id = u.id and wm.status <> 'left') as workspace_count,
  (select count(*) from auth_sessions s where s.user_id = u.id and s.revoked_at is null
     and s.idle_expires_at > now() and s.absolute_expires_at > now()) as active_session_count,
  (select max(s.last_active_at) from auth_sessions s where s.user_id = u.id) as last_active_at`;

/** Digits of a partial phone number as stored (E.164 without the local leading zero). */
function phoneFragment(raw: string): string {
  const digits = toLatinDigits(raw).replace(/\D/g, '');
  return digits.startsWith('0') ? digits.slice(1) : digits;
}

function summary(row: UserRow): PlatformUserSummary {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    status: row.status,
    isPlatformAdmin: row.is_platform_admin,
    hasPassword: row.has_password,
    passwordResetRequired: row.password_reset_required,
    workspaceCount: num(row.workspace_count),
    activeSessionCount: num(row.active_session_count),
    lastActiveAt: isoOrNull(row.last_active_at),
    createdAt: iso(row.created_at),
  };
}

/**
 * «کاربران و سشن‌ها»: the people of the platform, their workspaces and roles, their signed-in
 * devices, and the two account actions an operator has (end sessions, issue a password reset).
 * Reads go through the read-only admin unit of work; the two actions through the ordinary one,
 * reusing the session and password machinery the members' own screens use.
 */
@Injectable()
export class PlatformUsersService {
  constructor(
    private readonly config: AppConfig,
    private readonly admins: PlatformAdminUnitOfWork,
    private readonly uow: UnitOfWork,
    private readonly sessions: SessionService,
    private readonly outbox: OutboxWriter,
    private readonly box: SecretBox,
    private readonly auditLog: PlatformAuditWriter,
  ) {}

  async list(admin: PlatformAdmin, filters: PlatformUserFilters): Promise<PlatformUserPage> {
    const limit = filters.limit ?? 50;
    const cursor = decodeCursor(filters.cursor);
    const where: SQL[] = [];
    const q = filters.q?.trim();
    if (q) {
      const fragment = phoneFragment(q);
      where.push(
        sql`(u.full_name ilike ${likeContains(q)} or u.email ilike ${likeContains(q)}${fragment.length >= 3 ? sql` or u.phone like ${likeContains(fragment)}` : sql``})`,
      );
    }
    const phone = filters.phone?.trim();
    if (phone) {
      const e164 = toIranMobileE164(phone);
      where.push(e164 ? sql`u.phone = ${e164}` : sql`u.phone like ${likeContains(phoneFragment(phone))}`);
    }
    const email = filters.email?.trim();
    if (email) where.push(sql`u.email ilike ${likeContains(email)}`);
    if (filters.status) where.push(sql`u.status = ${filters.status}`);
    if (filters.platformRole) where.push(sql`u.is_platform_admin = ${filters.platformRole === 'admin'}`);
    if (cursor) where.push(sql`(u.created_at, u.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`);

    const rows = await this.admins.read(admin, async (tx) =>
      (
        await tx.execute<UserRow>(sql`
          select ${USER_COLUMNS} from users u
          where ${where.length > 0 ? sql.join(where, sql` and `) : sql`true`}
          order by u.created_at desc, u.id desc
          limit ${limit + 1}`)
      ).rows,
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    await this.auditLog.record(admin, {
      action: 'admin.users.search',
      metadata: { filters: { q: q ?? null, phone: phone ?? null, email: email ?? null, status: filters.status ?? null, platformRole: filters.platformRole ?? null }, results: page.length },
    });
    return { items: page.map(summary), nextCursor: rows.length > limit && last ? encodeCursor(last.cursor_at, last.id) : null };
  }

  async detail(admin: PlatformAdmin, userId: string): Promise<PlatformUserDetail> {
    const { user, memberships } = await this.admins.read(admin, async (tx) => {
      const [row] = (await tx.execute<UserRow>(sql`select ${USER_COLUMNS} from users u where u.id = ${userId}`)).rows;
      if (!row) throw ApiError.notFound('The user');
      const joined = await tx.execute<MembershipRow>(sql`
        select wm.workspace_id, w.name as workspace_name, w.slug as workspace_slug, w.deleted_at is not null as workspace_deleted,
          w.owner_user_id = wm.user_id as is_owner, r.key as role_key, wm.status as member_status, d.name as department,
          wm.job_title, wm.joined_at, wm.left_at,
          coalesce((select json_agg(json_build_object('id', p.id, 'key', p.key, 'name', p.name, 'role', pm.role) order by p.name)
                    from project_members pm
                    join projects p on p.workspace_id = pm.workspace_id and p.id = pm.project_id and p.deleted_at is null
                    where pm.workspace_id = wm.workspace_id and pm.user_id = wm.user_id), '[]') as projects
        from workspace_members wm
        join workspaces w on w.id = wm.workspace_id
        join roles r on r.workspace_id = wm.workspace_id and r.id = wm.role_id
        left join departments d on d.workspace_id = wm.workspace_id and d.id = wm.department_id
        where wm.user_id = ${userId}
        order by wm.joined_at, w.name`);
      return { user: row, memberships: joined.rows };
    });
    await this.auditLog.record(admin, { action: 'admin.user.view', targetUserId: userId, resourceType: 'user', resourceId: userId });
    return {
      ...summary(user),
      passwordChangedAt: isoOrNull(user.password_changed_at),
      memberships: memberships.map((row) => ({
        workspaceId: row.workspace_id,
        workspaceName: row.workspace_name,
        workspaceSlug: row.workspace_slug,
        workspaceDeleted: row.workspace_deleted,
        isOwner: row.is_owner,
        roleKey: row.role_key,
        roleName: roleName(row.role_key),
        memberStatus: row.member_status,
        department: row.department,
        jobTitle: row.job_title,
        joinedAt: iso(row.joined_at),
        leftAt: isoOrNull(row.left_at),
        projects: row.projects,
      })),
    };
  }

  async sessionsOf(admin: PlatformAdmin, userId: string, status: 'active' | 'revoked' | 'all'): Promise<PlatformSessionView[]> {
    const live = and(isNull(authSessions.revokedAt), gt(authSessions.idleExpiresAt, sql`now()`), gt(authSessions.absoluteExpiresAt, sql`now()`));
    const rows = await this.admins.read(admin, async (tx) => {
      await this.requireUser(tx, userId);
      return tx
        .select({
          session: authSessions,
          status: sql<PlatformSessionStatus>`case when ${authSessions.revokedAt} is not null then 'revoked'
            when ${authSessions.idleExpiresAt} <= now() or ${authSessions.absoluteExpiresAt} <= now() then 'expired' else 'active' end`,
          expiresAt: sql<string>`least(${authSessions.idleExpiresAt}, ${authSessions.absoluteExpiresAt})`,
        })
        .from(authSessions)
        .where(and(eq(authSessions.userId, userId), status === 'active' ? live : status === 'revoked' ? isNotNull(authSessions.revokedAt) : undefined))
        .orderBy(desc(authSessions.lastActiveAt))
        .limit(200);
    });
    await this.auditLog.record(admin, { action: 'admin.sessions.view', targetUserId: userId, resourceType: 'user', resourceId: userId, metadata: { status, results: rows.length } });
    return rows.map(({ session, status: state, expiresAt }) => ({
      id: session.id,
      status: state,
      deviceLabel: session.deviceLabel,
      userAgent: session.userAgent,
      client: session.clientName,
      os: session.osName,
      deviceType: session.deviceType,
      ip: session.ip,
      lastIp: session.lastIp,
      amr: session.amr,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
      expiresAt: iso(expiresAt),
      revokedAt: session.revokedAt?.toISOString() ?? null,
      revokeReason: session.revokeReason,
    }));
  }

  /** Ends one session now: its refresh token stops working, its access token and sockets die. */
  async revokeSession(admin: PlatformAdmin, sessionId: string): Promise<void> {
    await this.uow.run({ workspaceId: null, userId: admin.userId }, async (unit) => {
      const session = await this.sessions.find(unit.tx, sessionId);
      if (!session) throw ApiError.notFound('The session');
      await this.sessions.revoke(unit, [sessionId], 'admin_action', session.userId);
      await this.auditLog.record(
        admin,
        { action: 'admin.session.revoke', targetUserId: session.userId, resourceType: 'session', resourceId: sessionId, metadata: { alreadyEnded: session.revokedAt !== null } },
        unit,
      );
    });
  }

  async revokeAll(admin: PlatformAdmin, userId: string): Promise<{ revoked: number }> {
    return this.uow.run({ workspaceId: null, userId: admin.userId }, async (unit) => {
      await this.requireUser(unit.tx, userId);
      const revoked = await this.sessions.revokeOthers(unit, userId, null, 'admin_action');
      await this.auditLog.record(admin, { action: 'admin.sessions.revoke_all', targetUserId: userId, resourceType: 'user', resourceId: userId, metadata: { revoked } }, unit);
      return { revoked };
    });
  }

  /**
   * A single-use reset code (256 bits, stored only as its SHA-256): texted or emailed as a link,
   * or shown once to the admin to hand over in person. From now until it is used, the old
   * password no longer works; an earlier unused code stops working. The password itself is never
   * seen, set or returned by anyone but its owner.
   */
  async issuePasswordReset(admin: PlatformAdmin, userId: string, channel: PasswordResetChannel): Promise<PasswordResetIssued> {
    const code = randomToken(32);
    const link = `${new URL('/reset-password', this.config.env.PUBLIC_WEB_ORIGIN).toString()}?token=${code}`;
    return this.uow.run({ workspaceId: null, userId: admin.userId }, async (unit) => {
      const { tx } = unit;
      const [user] = await tx
        .select({ phone: users.phone, email: users.email, fullName: users.fullName, status: users.status, deletedAt: users.deletedAt })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!user || user.deletedAt || user.status === 'deleted') throw ApiError.notFound('The user');
      if (channel === 'email' && !user.email) throw ApiError.validation([{ field: 'channel', message: 'the user has no email address' }]);

      await tx.update(passwordResetTokens).set({ usedAt: sql`now()` }).where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
      const [token] = await tx
        .insert(passwordResetTokens)
        .values({
          userId,
          tokenHash: sha256(code),
          channel,
          createdBy: admin.userId,
          expiresAt: sql`now() + make_interval(mins => ${this.config.env.PASSWORD_RESET_TTL_MINUTES})`,
        })
        .returning({ id: passwordResetTokens.id, expiresAt: passwordResetTokens.expiresAt });
      if (!token) throw new Error('password reset insert returned nothing');
      await tx.update(users).set({ passwordResetRequired: true }).where(eq(users.id, userId));

      if (channel === 'sms') {
        await this.outbox.add(tx, {
          type: 'notification.sms',
          aggregateType: 'user',
          aggregateId: userId,
          payload: { to: user.phone, template: 'password_reset', tokens: { link: this.box.seal(link) }, sealed: ['link'] },
        });
      } else if (channel === 'email' && user.email) {
        await this.outbox.add(tx, {
          type: 'notification.email',
          aggregateType: 'user',
          aggregateId: userId,
          payload: { to: user.email, template: 'password_reset', params: { name: user.fullName, link: this.box.seal(link) }, sealed: ['link'] },
        });
      }
      await this.auditLog.record(
        admin,
        { action: 'admin.password_reset.issue', targetUserId: userId, resourceType: 'password_reset', resourceId: token.id, metadata: { channel, expiresAt: token.expiresAt.toISOString() } },
        unit,
      );
      return {
        channel,
        expiresAt: token.expiresAt.toISOString(),
        sentTo: channel === 'sms' ? maskPhone(user.phone) : channel === 'email' && user.email ? maskEmail(user.email) : null,
        code: channel === 'manual' ? code : null,
        link: channel === 'manual' ? link : null,
      };
    });
  }

  private async requireUser(tx: Tx, userId: string): Promise<void> {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!user) throw ApiError.notFound('The user');
  }
}

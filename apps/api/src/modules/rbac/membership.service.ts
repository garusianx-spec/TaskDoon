import { Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { RoleId } from '@taskin/contracts';
import type { Tx } from '../../platform/db/database.js';
import { workspaces } from '../../platform/db/schema/all.js';
import { UnitOfWork, type Unit } from '../../platform/db/unit-of-work.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { RedisClients } from '../../platform/redis/redis.js';
import { ALL_CELLS } from './ability.js';

const MEMBER_TTL_SECONDS = 300;
const VERSION_TTL_SECONDS = 60;

// Raise the cached version, never lower it: a slow reader that loaded an older version must not
// overwrite a bump that committed after it read.
const SET_IF_HIGHER = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local candidate = tonumber(ARGV[1])
if candidate > current then redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]) return candidate end
redis.call('EXPIRE', KEYS[1], ARGV[2])
return current
`;

interface MembershipRow extends Record<string, unknown> {
  status: string;
  role_id: string;
  role_key: string;
  rank: number;
  owner_user_id: string;
  rbac_version: number;
  deleted: boolean;
  grants: string[];
}

/**
 * Loads "who is this user in this workspace" once per request, from redis-core when possible.
 * Cache entries carry the workspace's `rbac_version`, which every role, matrix or membership
 * change bumps in the same transaction, so a demotion takes effect on the very next request.
 */
@Injectable()
export class MembershipService {
  private readonly logger = new Logger('MembershipService');

  constructor(
    private readonly uow: UnitOfWork,
    private readonly redis: RedisClients,
  ) {}

  /** The caller's active membership, or `null` (not a member, suspended, left, or workspace deleted). */
  async load(workspaceId: string, userId: string): Promise<MembershipContext | null> {
    const versionKey = this.versionKey(workspaceId);
    const memberKey = this.redis.key('cache', 'member', workspaceId, userId);
    try {
      const [version, cached] = await this.redis.core.mget(versionKey, memberKey);
      if (version && cached) {
        const member = JSON.parse(cached) as MembershipContext | { none: true; rbacVersion: number };
        if (member.rbacVersion === Number(version)) return 'none' in member ? null : member;
      }
    } catch (error) {
      this.logger.debug({ error: error instanceof Error ? error.message : String(error) }, 'membership cache unavailable');
    }

    const row = await this.uow.run({ workspaceId, userId }, ({ tx }) => this.query(tx, workspaceId, userId));
    const member = row && row.status === 'active' && !row.deleted ? this.toContext(workspaceId, userId, row) : null;
    const version = row?.rbac_version;
    if (version !== undefined) {
      try {
        await this.redis.core.eval(SET_IF_HIGHER, 1, versionKey, String(version), String(VERSION_TTL_SECONDS));
        await this.redis.core.set(memberKey, JSON.stringify(member ?? { none: true, rbacVersion: version }), 'EX', MEMBER_TTL_SECONDS);
      } catch {
        // Caching is best effort; the database answered.
      }
    }
    return member;
  }

  /** Same, inside a unit that already holds the tenant (no cache: the caller is mid-change). */
  async loadIn(tx: Tx, workspaceId: string, userId: string): Promise<MembershipContext | null> {
    const row = await this.query(tx, workspaceId, userId);
    return row && row.status === 'active' && !row.deleted ? this.toContext(workspaceId, userId, row) : null;
  }

  /**
   * Bumps the workspace's permission version inside the unit; after commit the cache learns the
   * new version, which orphans every cached membership of the workspace at once.
   */
  async bump(unit: Unit, workspaceId: string): Promise<number> {
    const [row] = await unit.tx
      .update(workspaces)
      .set({ rbacVersion: sql`${workspaces.rbacVersion} + 1` })
      .where(eq(workspaces.id, workspaceId))
      .returning({ version: workspaces.rbacVersion });
    const version = row?.version ?? 0;
    unit.afterCommit(() => this.redis.core.eval(SET_IF_HIGHER, 1, this.versionKey(workspaceId), String(version), String(VERSION_TTL_SECONDS)));
    return version;
  }

  private versionKey(workspaceId: string): string {
    return this.redis.key('cache', 'rbac', workspaceId);
  }

  private async query(tx: Tx, workspaceId: string, userId: string): Promise<MembershipRow | undefined> {
    const result = await tx.execute<MembershipRow>(sql`
      select m.status, m.role_id, r.key as role_key, r.rank, w.owner_user_id, w.rbac_version,
             w.deleted_at is not null as deleted,
             coalesce(array_agg(rp.module::text || ':' || rp.action::text) filter (where rp.module is not null), '{}') as grants
      from workspace_members m
      join workspaces w on w.id = m.workspace_id
      join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
      left join role_permissions rp on rp.workspace_id = r.workspace_id and rp.role_id = r.id
      where m.workspace_id = ${workspaceId} and m.user_id = ${userId}
      group by m.status, m.role_id, r.key, r.rank, w.owner_user_id, w.rbac_version, w.deleted_at`);
    return result.rows[0];
  }

  private toContext(workspaceId: string, userId: string, row: MembershipRow): MembershipContext {
    const isOwner = row.owner_user_id === userId;
    return {
      workspaceId,
      userId,
      roleId: row.role_id,
      roleKey: row.role_key as RoleId,
      rank: Number(row.rank),
      isOwner,
      ownerUserId: row.owner_user_id,
      grants: isOwner ? ALL_CELLS : row.grants,
      rbacVersion: Number(row.rbac_version),
    };
  }
}

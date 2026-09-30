import { Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { AppConfig } from '../../config/app-config.js';
import { Database } from '../../platform/db/database.js';
import { authSessions, users } from '../../platform/db/schema/all.js';
import { RedisClients } from '../../platform/redis/redis.js';

export interface UserStanding {
  readonly securityVersion: number;
  readonly active: boolean;
}

const STANDING_TTL_SECONDS = 300;
/** The most users one shared lookup asks about. */
const STANDING_BATCH = 500;

/**
 * The per-request checks behind every access token: is its session revoked, and does its
 * security version still match the user's? Both are answered from redis-core, with the
 * database as the fallback when Redis cannot answer, so a Redis outage never lets a revoked
 * token through.
 */
@Injectable()
export class RevocationService {
  private readonly logger = new Logger('RevocationService');
  private standingQueue = new Map<string, { resolve: (standing: UserStanding) => void; reject: (error: unknown) => void }[]>();
  private standingInFlight = false;

  constructor(
    private readonly config: AppConfig,
    private readonly redis: RedisClients,
    private readonly database: Database,
  ) {}

  /** Revoked session ids live in Redis for as long as any access token for them can be valid. */
  async markRevoked(sessionIds: readonly string[]): Promise<void> {
    if (sessionIds.length === 0) return;
    const ttl = this.config.env.ACCESS_TOKEN_TTL_SECONDS + 120;
    const pipeline = this.redis.core.pipeline();
    for (const id of sessionIds) pipeline.set(this.redis.key('revoked', 'sid', id), '1', 'EX', ttl);
    await pipeline.exec();
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    try {
      if ((await this.redis.core.exists(this.redis.key('revoked', 'sid', sessionId))) === 1) return true;
    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'revocation cache unavailable; asking the database');
      const [row] = await this.database.db
        .select({ revokedAt: authSessions.revokedAt })
        .from(authSessions)
        .where(eq(authSessions.id, sessionId));
      return !row || row.revokedAt !== null;
    }
    return false;
  }

  async standing(userId: string): Promise<UserStanding> {
    const key = this.redis.key('user', 'standing', userId);
    try {
      const cached = await this.redis.core.get(key);
      if (cached) return JSON.parse(cached) as UserStanding;
    } catch {
      // Fall through to the database.
    }
    return new Promise<UserStanding>((resolve, reject) => {
      const waiting = this.standingQueue.get(userId);
      if (waiting) waiting.push({ resolve, reject });
      else this.standingQueue.set(userId, [{ resolve, reject }]);
      if (!this.standingInFlight) void this.lookUpStanding();
    });
  }

  /**
   * Cache misses share queries: one is in flight at a time, and every miss that arrives
   * meanwhile goes into the next. Idle, a miss is one query as before; in a reconnect storm (a
   * WebSocket node's sockets all arriving at another at once) a few queries answer thousands.
   */
  private async lookUpStanding(): Promise<void> {
    this.standingInFlight = true;
    try {
      while (this.standingQueue.size > 0) {
        const batch = new Map([...this.standingQueue].slice(0, STANDING_BATCH));
        for (const userId of batch.keys()) this.standingQueue.delete(userId);
        try {
          const rows = await this.database.db
            .select({ id: users.id, securityVersion: users.securityVersion, status: users.status, deletedAt: users.deletedAt })
            .from(users)
            .where(sql`${users.id} = any(${sql.param([...batch.keys()])}::uuid[])`);
          const found = new Map(rows.map((row) => [row.id, row]));
          const pipeline = this.redis.core.pipeline();
          for (const [userId, waiters] of batch) {
            const row = found.get(userId);
            const standing: UserStanding = { securityVersion: row?.securityVersion ?? -1, active: row?.status === 'active' && row.deletedAt === null };
            pipeline.set(this.redis.key('user', 'standing', userId), JSON.stringify(standing), 'EX', STANDING_TTL_SECONDS);
            for (const waiter of waiters) waiter.resolve(standing);
          }
          await pipeline.exec().catch(() => undefined);
        } catch (error) {
          for (const waiters of batch.values()) for (const waiter of waiters) waiter.reject(error);
        }
      }
    } finally {
      this.standingInFlight = false;
    }
  }

  /** Call after committing a change to a user's security version or status. */
  async forgetStanding(userId: string): Promise<void> {
    await this.redis.core.del(this.redis.key('user', 'standing', userId));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Clock } from '../../platform/clock/clock.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { PresenceDirectory } from '../../platform/realtime/presence-directory.js';
import { RealtimePublisher } from '../../platform/realtime/realtime-publisher.js';
import { rooms } from '../../platform/realtime/rooms.js';
import { RedisClients } from '../../platform/redis/redis.js';
import type { RtSocket } from './ws-guards.js';

/** Timings (RFC §3). Offline is announced after a 10 s grace; a crashed node is noticed within 10 s. */
export const PRESENCE = {
  heartbeatEveryMs: 3_000,
  heartbeatTtlSeconds: 10,
  graceMs: 10_000,
  sweepEveryMs: 2_000,
  announceEveryMs: 2_000,
} as const;

// Announce offline only if the user is still disconnected and still pending (atomic: a connect
// in between wins).
const TAKE_IF_OFFLINE = `
if redis.call('EXISTS', ARGV[2] .. ARGV[1]) == 0 and redis.call('ZREM', KEYS[1], ARGV[1]) == 1 then return 1 end
if redis.call('EXISTS', ARGV[2] .. ARGV[1]) == 1 then redis.call('ZREM', KEYS[1], ARGV[1]) end
return 0
`;

/**
 * Connectivity (RFC §3). A connection adds `{nodeId}|{socketId}` to the user's set; when the set
 * empties the user is queued offline with a grace, and the leader's sweeper announces them only if
 * nobody reconnected meanwhile. Each node refreshes a heartbeat; the sweeper clears the entries of
 * a node whose heartbeat lapsed (a crash), so no ghost stays online. Transitions are announced to
 * every workspace of the user, batched every two seconds.
 */
@Injectable()
export class PresenceTracker {
  private readonly logger = new Logger('PresenceTracker');
  private nodeId = '';
  private timers: NodeJS.Timeout[] = [];
  /** userId → online, waiting for the next announcement. */
  private readonly transitions = new Map<string, boolean>();
  private leader = false;
  private sweeping = false;

  constructor(
    private readonly redis: RedisClients,
    private readonly keys: PresenceDirectory,
    private readonly publisher: RealtimePublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  start(nodeId: string): void {
    this.nodeId = nodeId;
    void this.beat();
    this.timers = [
      setInterval(() => void this.beat(), PRESENCE.heartbeatEveryMs),
      setInterval(() => void this.sweep(), PRESENCE.sweepEveryMs),
      setInterval(() => void this.announce(), PRESENCE.announceEveryMs),
    ];
    for (const timer of this.timers) timer.unref();
  }

  /** Graceful shutdown: stop, and let the sweeper collect this node's connections after the grace. */
  async drain(): Promise<void> {
    this.stop();
    await this.announce();
    await this.redis.rt.del(this.keys.heartbeat(this.nodeId)).catch(() => undefined);
    if (this.leader) await this.redis.rt.del(this.keys.sweeperLock).catch(() => undefined);
  }

  /** Test support: stop as a crashed process would (the heartbeat lapses by itself). */
  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  async connected(socket: RtSocket): Promise<void> {
    const { userId } = socket.data;
    try {
      const results = await this.redis.rt
        .multi()
        .sadd(this.keys.connections(userId), `${this.nodeId}|${socket.id}`)
        .sadd(this.keys.nodeConnections(this.nodeId), `${userId}|${this.nodeId}|${socket.id}`)
        .zrem(this.keys.pending, userId)
        .scard(this.keys.connections(userId))
        .exec();
      const wasPending = results?.[2]?.[1] === 1;
      const count = Number(results?.[3]?.[1] ?? 0);
      // Back within the grace: nobody saw them leave, so there is nothing to announce.
      if (count === 1 && !wasPending) this.transitions.set(userId, true);
    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'presence connect failed');
    }
  }

  async disconnected(socket: RtSocket): Promise<void> {
    const { userId } = socket.data;
    try {
      const results = await this.redis.rt
        .multi()
        .srem(this.keys.connections(userId), `${this.nodeId}|${socket.id}`)
        .srem(this.keys.nodeConnections(this.nodeId), `${userId}|${this.nodeId}|${socket.id}`)
        .scard(this.keys.connections(userId))
        .exec();
      if (Number(results?.[2]?.[1] ?? 1) === 0) await this.redis.rt.zadd(this.keys.pending, this.clock.now().getTime() + PRESENCE.graceMs, userId);
    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'presence disconnect failed');
    }
  }

  private async beat(): Promise<void> {
    try {
      await this.redis.rt
        .multi()
        .set(this.keys.heartbeat(this.nodeId), '1', 'EX', PRESENCE.heartbeatTtlSeconds)
        .sadd(this.keys.nodes, this.nodeId)
        .exec();
    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'presence heartbeat failed');
    }
  }

  /** Leader only: clear crashed nodes, then announce the users whose grace ran out. */
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const lock = this.keys.sweeperLock;
      const ttl = PRESENCE.sweepEveryMs * 3;
      this.leader =
        (await this.redis.rt.set(lock, this.nodeId, 'PX', ttl, 'NX')) === 'OK' ||
        ((await this.redis.rt.get(lock)) === this.nodeId && (await this.redis.rt.pexpire(lock, ttl)) === 1);
      if (!this.leader) return;
      const now = this.clock.now().getTime();

      for (const nodeId of await this.redis.rt.smembers(this.keys.nodes)) {
        if (nodeId === this.nodeId || (await this.redis.rt.exists(this.keys.heartbeat(nodeId))) === 1) continue;
        const entries = await this.redis.rt.smembers(this.keys.nodeConnections(nodeId));
        for (const entry of entries) {
          const [userId, node, socketId] = entry.split('|');
          if (!userId || !node || !socketId) continue;
          const results = await this.redis.rt.multi().srem(this.keys.connections(userId), `${node}|${socketId}`).scard(this.keys.connections(userId)).exec();
          if (Number(results?.[1]?.[1] ?? 1) === 0) await this.redis.rt.zadd(this.keys.pending, 'NX', now + PRESENCE.graceMs, userId);
        }
        await this.redis.rt.multi().del(this.keys.nodeConnections(nodeId)).srem(this.keys.nodes, nodeId).exec();
        this.logger.warn({ nodeId, connections: entries.length }, 'cleared a WebSocket node whose heartbeat lapsed');
      }

      const due = await this.redis.rt.zrangebyscore(this.keys.pending, '-inf', now, 'LIMIT', 0, 1000);
      for (const userId of due) {
        const taken = await this.redis.rt.eval(TAKE_IF_OFFLINE, 1, this.keys.pending, userId, this.redis.key('presence', 'conn', ''));
        if (taken === 1) this.transitions.set(userId, false);
      }
    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'presence sweep failed');
    } finally {
      this.sweeping = false;
    }
  }

  /** Announces the batched transitions to every workspace of each user. */
  async announce(): Promise<void> {
    if (this.transitions.size === 0) return;
    const batch = [...this.transitions];
    this.transitions.clear();
    try {
      const result = await this.uow.run({ workspaceId: null, userId: null }, ({ tx }) =>
        tx.execute<{ user_id: string; workspace_id: string }>(sql`
          select user_id, workspace_id from app.active_workspaces_of(${sql.param(batch.map(([userId]) => userId))}::uuid[])`),
      );
      const online = new Map(batch);
      await this.publisher.emit(
        ...result.rows.map((row) => ({
          type: 'presence:updated' as const,
          workspaceId: row.workspace_id,
          rooms: [rooms.workspace(row.workspace_id)],
          actorId: row.user_id,
          requestId: null,
          data: { userId: row.user_id, online: online.get(row.user_id) ?? false },
        })),
      );
    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'presence announcement failed');
    }
  }
}

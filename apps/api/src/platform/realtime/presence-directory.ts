import { Injectable } from '@nestjs/common';
import { RedisClients } from '../redis/redis.js';

/**
 * Presence keys on redis-rt (RFC §3). Connectivity lives here, never in the database: a user is
 * online while `presence:conn:{userId}` holds at least one `{nodeId}|{socketId}` (Redis deletes an
 * empty set, so "online" is simply "the key exists").
 */
@Injectable()
export class PresenceDirectory {
  constructor(private readonly redis: RedisClients) {}

  connections(userId: string): string {
    return this.redis.key('presence', 'conn', userId);
  }

  /** Users whose last connection closed, scored by when to announce them offline (the grace). */
  get pending(): string {
    return this.redis.key('presence', 'pending');
  }

  get nodes(): string {
    return this.redis.key('ws', 'nodes');
  }

  heartbeat(nodeId: string): string {
    return this.redis.key('ws', 'node', nodeId, 'hb');
  }

  /** `{userId}|{nodeId}|{socketId}` per socket on the node, for the sweeper after a crash. */
  nodeConnections(nodeId: string): string {
    return this.redis.key('ws', 'node', nodeId, 'conns');
  }

  /** When the node's heartbeat was first found missing (the sweeper's grace starts then). */
  nodeGone(nodeId: string): string {
    return this.redis.key('ws', 'node', nodeId, 'gone');
  }

  get sweeperLock(): string {
    return this.redis.key('ws', 'sweeper');
  }

  /** Which of `userIds` are connected right now (one round trip). Fails open to "nobody". */
  async online(userIds: readonly string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    try {
      const pipeline = this.redis.rt.pipeline();
      for (const userId of userIds) pipeline.exists(this.connections(userId));
      const results = (await pipeline.exec()) ?? [];
      return new Set(userIds.filter((_, index) => results[index]?.[1] === 1));
    } catch {
      return new Set();
    }
  }
}

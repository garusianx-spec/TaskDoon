import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface.js';
import { RedisClients } from '../redis/redis.js';

// Fixed window counter plus a block key, in one round trip. Returns hits, window ms left and
// block ms left.
const INCREMENT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = redis.call('PTTL', KEYS[2])
if hits > tonumber(ARGV[2]) and blocked <= 0 then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blocked = tonumber(ARGV[3])
end
return {hits, ttl, blocked}
`;

/**
 * @nestjs/throttler storage on redis-core, shared by every API instance. The general per-IP and
 * per-user limits fail open when Redis is down (availability over a coarse limit); the auth
 * limits that must fail closed live in the OTP and password services.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger('RedisThrottlerStorage');

  constructor(private readonly redis: RedisClients) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    const counter = this.redis.key('throttle', throttlerName, key);
    try {
      const [hits, ttlMs, blockedMs] = (await this.redis.core.eval(
        INCREMENT,
        2,
        counter,
        `${counter}:blocked`,
        String(ttl),
        String(limit),
        String(blockDuration > 0 ? blockDuration : ttl),
      )) as [number, number, number];
      return {
        totalHits: hits,
        timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
        isBlocked: blockedMs > 0,
        timeToBlockExpire: Math.max(0, Math.ceil(blockedMs / 1000)),
      };
    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'rate limit store unavailable; allowing request');
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}

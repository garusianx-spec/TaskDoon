import { Injectable } from '@nestjs/common';
import type { RealtimeEnvelope } from '@taskin/contracts';
import { RedisClients } from '../redis/redis.js';

export interface StreamEntry {
  readonly id: string;
  readonly rooms: readonly string[];
  readonly envelope: RealtimeEnvelope;
}

export interface StreamAppend {
  readonly workspaceId: string;
  readonly rooms: readonly string[];
  /** Stored without `eventId`: the entry's id is the event id. */
  readonly envelope: RealtimeEnvelope;
}

/** About a day of a busy workspace's events (RFC §4); older ones make the client resync. */
const MAXLEN = 20_000;
/** A workspace with no events for a day loses its stream; a client older than that resyncs. */
const TTL_SECONDS = 24 * 3600;

/** Orders two stream ids (`<ms>-<seq>`). */
export function compareStreamIds(a: string, b: string): number {
  const [aMs = '0', aSeq = '0'] = a.split('-');
  const [bMs = '0', bSeq = '0'] = b.split('-');
  const ms = BigInt(aMs) - BigInt(bMs);
  if (ms !== 0n) return ms < 0n ? -1 : 1;
  const seq = BigInt(aSeq) - BigInt(bSeq);
  return seq === 0n ? 0 : seq < 0n ? -1 : 1;
}

const STREAM_ID = /^\d{1,20}-\d{1,20}$/;

/**
 * The per-workspace replay log (`rt:events:{workspaceId}` on redis-rt): every durable realtime
 * event is appended before it is emitted, and its entry id becomes the envelope's `eventId`. A
 * reconnecting client passes its last `eventId` back and gets what it missed.
 */
@Injectable()
export class EventStream {
  constructor(private readonly redis: RedisClients) {}

  key(workspaceId: string): string {
    return this.redis.key('rt', 'events', workspaceId);
  }

  /** Appends in order, one round trip; returns each entry's id. */
  async append(entries: readonly StreamAppend[]): Promise<string[]> {
    if (entries.length === 0) return [];
    const pipeline = this.redis.rt.pipeline();
    for (const entry of entries) {
      const key = this.key(entry.workspaceId);
      pipeline.xadd(key, 'MAXLEN', '~', MAXLEN, '*', 'r', JSON.stringify(entry.rooms), 'e', JSON.stringify(entry.envelope));
      pipeline.expire(key, TTL_SECONDS);
    }
    const results = (await pipeline.exec()) ?? [];
    return entries.map((_, index) => {
      const [error, id] = results[index * 2] ?? [new Error('no reply'), null];
      if (error) throw error;
      return String(id);
    });
  }

  /**
   * The entries after `lastEventId`, up to `limit`. `gap` is true when entries after it may have
   * been trimmed or expired (or `lastEventId` is not a stream id at all): the client must resync.
   */
  async since(workspaceId: string, lastEventId: string, limit: number): Promise<{ entries: StreamEntry[]; gap: boolean; more: boolean }> {
    if (!STREAM_ID.test(lastEventId)) return { entries: [], gap: true, more: false };
    const key = this.key(workspaceId);
    let length = 0;
    let lastGenerated = '0-0';
    try {
      const info = (await this.redis.rt.call('XINFO', 'STREAM', key)) as unknown[];
      for (let index = 0; index < info.length - 1; index += 2) {
        if (info[index] === 'length') length = Number(info[index + 1]);
        if (info[index] === 'last-generated-id') lastGenerated = String(info[index + 1]);
      }
    } catch {
      // No stream: nothing was appended for a day, or ever. Events after `lastEventId` are gone.
      return { entries: [], gap: true, more: false };
    }
    // Trimming only ever removes the oldest entries. The client is safe when its last event is
    // still held (or newer); older than everything held, it may have missed trimmed ones.
    const [first] = length > 0 ? ((await this.redis.rt.xrange(key, '-', '+', 'COUNT', 1)) as [string, string[]][]) : [];
    const oldest = first?.[0];
    const gap = oldest ? compareStreamIds(lastEventId, oldest) < 0 : compareStreamIds(lastEventId, lastGenerated) < 0;
    if (gap) return { entries: [], gap: true, more: false };
    const raw = (await this.redis.rt.xrange(key, `(${lastEventId}`, '+', 'COUNT', limit + 1)) as [string, string[]][];
    const entries = raw.slice(0, limit).map(([id, fields]): StreamEntry => {
      const values: Record<string, string> = {};
      for (let index = 0; index < fields.length - 1; index += 2) values[fields[index] as string] = fields[index + 1] as string;
      const envelope = JSON.parse(values.e ?? '{}') as RealtimeEnvelope;
      return { id, rooms: JSON.parse(values.r ?? '[]') as string[], envelope: { ...envelope, eventId: id } };
    });
    return { entries, gap: false, more: raw.length > limit };
  }
}

import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@taskin/contracts';
import type { MembershipContext } from '../../platform/http/request.js';

/** What a socket carries from its handshake on. */
export interface SocketData {
  userId: string;
  sessionId: string;
  /** Unix seconds; `auth:refresh` moves it forward. */
  expiresAt: number;
  /** A short id for logs, stable for the connection. */
  connId: string;
  /** The one live workspace (`workspace:subscribe`), with the caller's standing in it. */
  workspaceId: string | null;
  member: MembershipContext | null;
}

export type RtSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** How long after `exp` a socket may keep going without `auth:refresh` (RFC §4). */
export const EXPIRY_GRACE_SECONDS = 60;

/**
 * Per-event authentication (RFC §4, `WsJwtGuard`). The handshake verified the token; per event
 * this is in memory only: past `exp` + 60 s the socket is dropped, and a session this node heard
 * was revoked is dropped at once.
 */
export class WsJwtGuard {
  /** Revoked sessions heard on the bus, remembered for as long as their tokens could live. */
  private readonly revoked = new Map<string, number>();

  constructor(private readonly tokenTtlSeconds: number) {}

  check(socket: RtSocket, nowSeconds: number): 'ok' | 'expired' | 'revoked' {
    if (this.isRevoked(socket.data.sessionId, nowSeconds)) return 'revoked';
    return nowSeconds > socket.data.expiresAt + EXPIRY_GRACE_SECONDS ? 'expired' : 'ok';
  }

  revoke(sessionIds: readonly string[], nowSeconds: number): void {
    for (const id of sessionIds) this.revoked.set(id, nowSeconds + this.tokenTtlSeconds + EXPIRY_GRACE_SECONDS);
    if (this.revoked.size > 10_000) {
      for (const [id, until] of this.revoked) if (until < nowSeconds) this.revoked.delete(id);
    }
  }

  private isRevoked(sessionId: string, nowSeconds: number): boolean {
    const until = this.revoked.get(sessionId);
    if (until === undefined) return false;
    if (until >= nowSeconds) return true;
    this.revoked.delete(sessionId);
    return false;
  }
}

export type BucketKind = 'send' | 'typing' | 'other';

export type BucketLimits = Record<BucketKind, { readonly capacity: number; readonly perSecond: number }>;

/** RFC §3: `message:send` bursts of 20, then 5 a second; typing once a second; the rest 30 / 10 a second. */
export function bucketLimits(send: { readonly burst: number; readonly perSecond: number } = { burst: 20, perSecond: 5 }): BucketLimits {
  return {
    send: { capacity: send.burst, perSecond: send.perSecond },
    typing: { capacity: 1, perSecond: 1 },
    other: { capacity: 30, perSecond: 10 },
  };
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * Per-socket token buckets (RFC §4, `WsThrottlerGuard`). They live on the node that holds the
 * socket, so no Redis round trip is spent per event.
 */
export class WsThrottlerGuard {
  private readonly buckets = new WeakMap<RtSocket, Map<BucketKind, Bucket>>();

  constructor(private readonly limits: BucketLimits = bucketLimits()) {}

  /** 0 when the event may run, otherwise how many milliseconds until it could. */
  take(socket: RtSocket, kind: BucketKind, nowMs: number): number {
    const { capacity, perSecond } = this.limits[kind];
    let map = this.buckets.get(socket);
    if (!map) {
      map = new Map();
      this.buckets.set(socket, map);
    }
    const bucket = map.get(kind) ?? { tokens: capacity, updatedAt: nowMs };
    bucket.tokens = Math.min(capacity, bucket.tokens + ((nowMs - bucket.updatedAt) / 1000) * perSecond);
    bucket.updatedAt = nowMs;
    map.set(kind, bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - bucket.tokens) / perSecond) * 1000);
  }
}

import type { ActiveBroadcastView, BroadcastLevel } from '@taskin/contracts';

export const BROADCAST_MIN_DELAY_MS = 5_000;
export const BROADCAST_MAX_DELAY_MS = 3_600_000;
export const BROADCAST_POLL_MS = BROADCAST_MAX_DELAY_MS;

/** A platform event spreads its refetches across five seconds. */
export function broadcastJitter(random = Math.random()): number {
  return Math.floor(Math.max(0, Math.min(1, Number.isFinite(random) ? random : 0)) * 5_000);
}

/** Use the server's clock: a device's time or timezone cannot move the visibility window. */
export function broadcastTimerDelay(nextChangeAt: string | null, serverNow: string, jitter = broadcastJitter()): number {
  const boundary = nextChangeAt === null ? BROADCAST_POLL_MS : Date.parse(nextChangeAt) - Date.parse(serverNow);
  const delay = (Number.isFinite(boundary) ? boundary : BROADCAST_POLL_MS) + Math.max(0, Math.min(5_000, jitter));
  return Math.max(BROADCAST_MIN_DELAY_MS, Math.min(BROADCAST_MAX_DELAY_MS, delay));
}

export const broadcastDismissalKey = (item: Pick<ActiveBroadcastView, 'id' | 'updatedAt'>): string => `${item.id}:${item.updatedAt}`;
export type BroadcastStorage = (kind: 'local' | 'session') => Pick<Storage, 'getItem' | 'setItem'>;
const browserStorage: BroadcastStorage = (kind) => kind === 'session' ? window.sessionStorage : window.localStorage;
const storageKind = (level: BroadcastLevel): 'local' | 'session' => level === 'critical' ? 'session' : 'local';

export function isBroadcastDismissed(item: Pick<ActiveBroadcastView, 'id' | 'updatedAt' | 'level'>, storage: BroadcastStorage = browserStorage): boolean {
  try {
    return storage(storageKind(item.level)).getItem(broadcastDismissalKey(item)) === '1';
  } catch {
    return false;
  }
}

/** In private mode the banner also remembers the dismissal in component state. */
export function dismissBroadcast(item: Pick<ActiveBroadcastView, 'id' | 'updatedAt' | 'level'>, storage: BroadcastStorage = browserStorage): void {
  try {
    storage(storageKind(item.level)).setItem(broadcastDismissalKey(item), '1');
  } catch {
    // A refused storage write must never make dismissing an announcement fail.
  }
}

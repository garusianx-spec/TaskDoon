import { describe, expect, it } from 'vitest';
import { activeBroadcastsFromRows, type ActiveBroadcastCandidate } from '../../src/modules/broadcasts/broadcasts.service.js';
import { realtimeFor } from '../../src/platform/realtime/outbox-realtime.js';
import { rooms } from '../../src/platform/realtime/rooms.js';

const NOW = new Date('2030-04-10T12:00:00.000Z');
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1_000).toISOString();
const candidate = (id: string, overrides: Partial<ActiveBroadcastCandidate> = {}): ActiveBroadcastCandidate => ({
  id, message: `پیام ${id}`, level: 'info', startsAt: at(-60), expiresAt: null, updatedAt: at(-10), createdAt: at(-60), ...overrides,
});

describe('activeBroadcastsFromRows: global announcement windows', () => {
  it('includes the exact start and excludes the exact expiration', () => {
    const starting = candidate('starting', { startsAt: at(0), expiresAt: at(10) });
    const expiring = candidate('expiring', { expiresAt: at(0) });
    const future = candidate('future', { startsAt: at(5), expiresAt: at(20) });
    expect(activeBroadcastsFromRows([expiring, future, starting], NOW)).toMatchObject({
      items: [{ id: 'starting' }], serverNow: at(0), nextChangeAt: at(5),
    });
    expect(activeBroadcastsFromRows([starting, future], new Date(at(5)))).toMatchObject({ nextChangeAt: at(10), serverNow: at(5) });
    expect(activeBroadcastsFromRows([starting, future], new Date(at(20)))).toEqual({ items: [], nextChangeAt: null, serverNow: at(20) });
  });

  it('finds the earliest upcoming start or expiration and permits announcements with no expiration', () => {
    const indefinite = candidate('indefinite');
    const ending = candidate('ending', { expiresAt: at(3) });
    const next = candidate('next', { startsAt: at(8), expiresAt: at(15) });
    expect(activeBroadcastsFromRows([next, indefinite, ending], NOW).nextChangeAt).toBe(at(3));
    expect(activeBroadcastsFromRows([indefinite], NOW)).toMatchObject({ items: [{ id: 'indefinite' }], nextChangeAt: null });
    expect(activeBroadcastsFromRows([], NOW)).toEqual({ items: [], nextChangeAt: null, serverNow: at(0) });
  });

  it('sorts critical, warning and info before creation recency; updating an older item does not reorder it', () => {
    const rows = [
      candidate('info', { createdAt: at(-1) }),
      candidate('warning', { level: 'warning', createdAt: at(-2) }),
      candidate('older', { level: 'critical', createdAt: at(-30), updatedAt: at(0) }),
      candidate('newer', { level: 'critical', createdAt: at(-20), updatedAt: at(-20) }),
    ];
    expect(activeBroadcastsFromRows(rows, NOW).items.map((item) => item.id)).toEqual(['newer', 'older', 'warning', 'info']);
  });

  it('uses a stable ID tie-breaker and returns public views without internal creation timestamps', () => {
    const rows = [candidate('a'), candidate('b')];
    const one = activeBroadcastsFromRows(rows, NOW);
    const two = activeBroadcastsFromRows([...rows].reverse(), NOW);
    expect(one).toEqual(two);
    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
    for (const item of one.items) expect(item).not.toHaveProperty('createdAt');
  });
});

describe('system.broadcast outbox mapping', () => {
  it.each(['published', 'updated', 'withdrawn'] as const)('routes %s to authenticated platform sockets with no tenant scope', (action) => {
    const row: Parameters<typeof realtimeFor>[0] = {
      id: 1, workspaceId: null, aggregateType: 'system_broadcast', aggregateId: 'broadcast', eventType: 'system.broadcast',
      payload: { broadcastId: 'broadcast', action }, headers: { actorId: 'operator', requestId: 'request' }, createdAt: NOW, publishedAt: null,
    };
    expect(realtimeFor(row)).toMatchObject([{
      emit: { type: 'system:broadcast', workspaceId: null, rooms: [rooms.platform], actorId: 'operator', requestId: 'request', occurredAt: at(0), data: { broadcastId: 'broadcast', action } },
    }]);
  });
});

import { describe, expect, it } from 'vitest';
import { directKey, mentionedIds } from '../../src/modules/chat/chat-access.js';
import { bucketLimits, EXPIRY_GRACE_SECONDS, type RtSocket, WsJwtGuard, WsThrottlerGuard } from '../../src/modules/realtime/ws-guards.js';
import { isUnavailable } from '../../src/platform/db/pg-errors.js';
import { compareStreamIds } from '../../src/platform/realtime/event-stream.js';
import { realtimeFor } from '../../src/platform/realtime/outbox-realtime.js';

const socket = (data: Partial<RtSocket['data']> = {}) => ({ data: { userId: 'u', sessionId: 's', expiresAt: 1_000, connId: 'c', workspaceId: null, member: null, ...data } }) as RtSocket;

describe('WsThrottlerGuard: per-socket token buckets', () => {
  it('allows the burst, then the steady rate, and says how long to wait', () => {
    const guard = new WsThrottlerGuard(bucketLimits({ burst: 3, perSecond: 2 }));
    const one = socket();
    expect([0, 1, 2].map(() => guard.take(one, 'send', 0))).toEqual([0, 0, 0]);
    expect(guard.take(one, 'send', 0)).toBe(500);
    // Half a second refills one token at two a second.
    expect(guard.take(one, 'send', 500)).toBe(0);
    expect(guard.take(one, 'send', 500)).toBe(500);
    // The bucket never holds more than the burst.
    expect([0, 1, 2, 3].map(() => guard.take(one, 'send', 60_000))).toEqual([0, 0, 0, 500]);
  });

  it('keeps kinds and sockets apart', () => {
    const guard = new WsThrottlerGuard(bucketLimits({ burst: 1, perSecond: 1 }));
    const [one, two] = [socket(), socket()];
    expect(guard.take(one, 'send', 0)).toBe(0);
    expect(guard.take(one, 'send', 0)).toBeGreaterThan(0);
    expect(guard.take(two, 'send', 0)).toBe(0);
    expect(guard.take(one, 'typing', 0)).toBe(0);
    expect(guard.take(one, 'typing', 100)).toBe(900);
    expect(guard.take(one, 'other', 0)).toBe(0);
  });
});

describe('WsJwtGuard: per-event checks in memory', () => {
  it('lets a socket run until a minute past its token, then drops it', () => {
    const guard = new WsJwtGuard(900);
    const one = socket({ expiresAt: 1_000 });
    expect(guard.check(one, 999)).toBe('ok');
    expect(guard.check(one, 1_000 + EXPIRY_GRACE_SECONDS)).toBe('ok');
    expect(guard.check(one, 1_001 + EXPIRY_GRACE_SECONDS)).toBe('expired');
  });

  it('drops a revoked session at once, and forgets it once its tokens are dead', () => {
    const guard = new WsJwtGuard(900);
    const one = socket({ sessionId: 'gone', expiresAt: 10_000 });
    guard.revoke(['gone'], 100);
    expect(guard.check(one, 100)).toBe('revoked');
    expect(guard.check(socket({ sessionId: 'other', expiresAt: 10_000 }), 100)).toBe('ok');
    expect(guard.check(one, 100 + 900 + EXPIRY_GRACE_SECONDS + 1)).toBe('ok');
  });
});

describe('compareStreamIds', () => {
  it('orders Redis stream ids by time, then sequence, beyond float precision', () => {
    expect(compareStreamIds('1-0', '2-0')).toBe(-1);
    expect(compareStreamIds('5-3', '5-2')).toBe(1);
    expect(compareStreamIds('5-2', '5-2')).toBe(0);
    expect(compareStreamIds('9007199254740993-0', '9007199254740992-5')).toBe(1);
    expect(['10-0', '9-1', '9-0'].sort(compareStreamIds)).toEqual(['9-0', '9-1', '10-0']);
  });
});

describe('mentions and direct keys', () => {
  const a = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';
  const b = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6c';

  it('reads each <@userId> token once, lower-cased, and ignores anything else', () => {
    expect(mentionedIds(null)).toEqual([]);
    expect(mentionedIds(`سلام <@${a}> و <@${b.toUpperCase()}> و دوباره <@${a}>، نه <@not-a-uuid> و نه @${a}`)).toEqual([a, b]);
  });

  it('keeps at most 50 mentions', () => {
    const ids = Array.from({ length: 60 }, (_, index) => `0192a3b4-c5d6-7e8f-9a0b-${String(index).padStart(12, '0')}`);
    expect(mentionedIds(ids.map((id) => `<@${id}>`).join(' '))).toHaveLength(50);
  });

  it('gives a direct chat the same key whoever opens it', () => {
    expect(directKey(a, b)).toBe(directKey(b, a));
    expect(directKey(b, a)).toBe(`${a}:${b}`);
  });
});

describe('realtimeFor: what a committed outbox event means to connected clients', () => {
  const row = (eventType: string, payload: object, workspaceId: string | null = 'w1') =>
    ({ id: 1, workspaceId, aggregateType: 'x', aggregateId: 'a', eventType, payload, headers: { actorId: 'actor', requestId: 'req' }, createdAt: new Date('2026-09-25T10:00:00Z'), publishedAt: null }) as unknown as Parameters<typeof realtimeFor>[0];

  it('sends task events to the project room, durable and versioned', () => {
    expect(realtimeFor(row('task.created', { taskId: 't', projectId: 'p', columnId: 'c', version: 3 }))).toEqual([
      {
        emit: {
          type: 'task:created',
          workspaceId: 'w1',
          rooms: ['project:p'],
          version: 3,
          durable: true,
          actorId: 'actor',
          requestId: 'req',
          occurredAt: '2026-09-25T10:00:00.000Z',
          data: { taskId: 't', projectId: 'p', columnId: 'c' },
        },
      },
    ]);
  });

  it('revokes sessions whatever the workspace, and ignores what clients need not hear', () => {
    expect(realtimeFor(row('session.revoked', { sessionIds: ['s1'], reason: 'logout' }, null))).toEqual([{ op: { op: 'revoke', sessionIds: ['s1'], reason: 'logout' } }]);
    expect(realtimeFor(row('task.created', { taskId: 't', projectId: 'p', columnId: 'c', version: 1 }, null))).toEqual([]);
    expect(realtimeFor(row('message.posted', { conversationId: 'c' }))).toEqual([]);
  });

  it('re-evaluates rooms when visibility changes, and asks viewers to refetch otherwise', () => {
    expect(realtimeFor(row('project.updated', { projectId: 'p', fields: ['visibility'] }))).toEqual([{ op: { op: 'rescope', workspaceId: 'w1', userIds: null, reason: 'project.visibility' } }]);
    const renamed = realtimeFor(row('project.updated', { projectId: 'p', fields: ['name'] }));
    expect(renamed).toMatchObject([{ emit: { type: 'resync:required', rooms: ['project:p'], data: { scopes: ['projects'] } } }]);
  });

  it('evicts a removed member before announcing it', () => {
    expect(realtimeFor(row('member.removed', { userId: 'u2' }))).toMatchObject([
      { op: { op: 'evict', workspaceId: 'w1', userIds: ['u2'], reason: 'removed' } },
      { emit: { type: 'member:removed', rooms: ['ws:w1'], data: { userId: 'u2' } } },
    ]);
  });

  it('joins new conversation members before announcing, and announces a removal before leaving', () => {
    expect(realtimeFor(row('conversation.member.added', { conversationId: 'c', userId: 'u2', role: 'member' }))).toMatchObject([
      { op: { op: 'join', workspaceId: 'w1', userIds: ['u2'], rooms: ['conv:c'] } },
      { emit: { type: 'conversation:member_added', rooms: ['conv:c'] } },
    ]);
    expect(realtimeFor(row('conversation.member.removed', { conversationId: 'c', userId: 'u2' }))).toMatchObject([
      { emit: { type: 'conversation:member_removed', rooms: ['conv:c', 'user:u2'] } },
      { op: { op: 'leave', userIds: ['u2'], rooms: ['conv:c'] } },
    ]);
  });
});

describe('isUnavailable: retry later, not a bug', () => {
  const pg = (code: string) => Object.assign(new Error('pg'), { code, severity: 'ERROR' });

  it('recognises an exhausted pool, a lost connection and a database going away, wrapped or not', () => {
    expect(isUnavailable(new Error('timeout exceeded when trying to connect'))).toBe(true);
    expect(isUnavailable(new Error('Failed query', { cause: new Error('timeout exceeded when trying to connect') }))).toBe(true);
    expect(isUnavailable(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))).toBe(true);
    expect(isUnavailable(new Error('Failed query', { cause: pg('57P01') }))).toBe(true);
    expect(isUnavailable(pg('08006'))).toBe(true);
  });

  it('leaves real errors alone', () => {
    expect(isUnavailable(pg('23505'))).toBe(false);
    expect(isUnavailable(new Error('boom'))).toBe(false);
    expect(isUnavailable('text')).toBe(false);
  });
});

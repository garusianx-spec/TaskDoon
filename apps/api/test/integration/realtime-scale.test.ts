import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MessageView, RealtimeEventMap, WorkspaceView } from '@taskin/contracts';
import { RealtimeGateway } from '../../src/modules/realtime/realtime.gateway.js';
import { rooms } from '../../src/platform/realtime/rooms.js';
import { bearer, createPeer, createTestApp, ownerWithWorkspace, type Peer, type Session, type TestApp } from './harness.js';
import { createConversation, type SeededMember, seedMembers } from './chat-helpers.js';
import { call, connect, type Connected, eventually, next, ok, pause } from './socket-helpers.js';
import { expectStatus, usePlan, wsPath } from './work-helpers.js';

/**
 * The M3 checklist (RFC §15) with real nodes: every "node" is a full API process in this test
 * run (its own Socket.IO server, adapter connections, presence heartbeat and bus subscription),
 * sharing one database and one Redis, as the containers of compose.scale.yml do.
 */

async function world(overrides: Record<string, string> = {}) {
  const t = await createTestApp(overrides);
  const { owner, workspace } = await ownerWithWorkspace(t);
  await usePlan(t, workspace.id, 'enterprise');
  return { t, owner, workspace };
}

describe.each(['redis', 'redis-sharded'])('M3 checklist: two WebSocket nodes, %s adapter', (adapter) => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let nodeA: Peer;
  let nodeB: Peer;
  let people: SeededMember[];

  beforeAll(async () => {
    ({ t, owner, workspace } = await world({ RT_ADAPTER: adapter }));
    [nodeA, nodeB] = await Promise.all([createPeer(t, { APP_ROLE: 'ws' }), createPeer(t, { APP_ROLE: 'ws' })]);
    people = await seedMembers(t, workspace.id, 2);
  });
  afterAll(async () => {
    await Promise.allSettled([nodeA?.close(), nodeB?.close()]);
    await t?.close();
  });

  it('delivers a message sent through node B to a client on node A, and applies a room leave issued on B to A', async () => {
    const [alice, bob] = people as [SeededMember, SeededMember];
    const group = await createConversation(t, owner, workspace.id, { kind: 'group', title: 'دو گره', memberIds: [alice.userId, bob.userId] });
    const onA = await connect(nodeA.baseUrl, alice.accessToken);
    const onB = await connect(nodeB.baseUrl, bob.accessToken);
    try {
      await ok(onA.socket, 'workspace:subscribe', { workspaceId: workspace.id });
      await ok(onB.socket, 'workspace:subscribe', { workspaceId: workspace.id });
      const sent = await ok(onB.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: 'از گره ب' });
      expect((await next(onA, 'message:new')).data).toMatchObject({ id: sent.id, text: 'از گره ب' });

      // Issued on node B, through the adapter: Alice's socket on node A leaves the room.
      const io = nodeB.app.get(RealtimeGateway).io;
      io?.in(rooms.user(alice.userId)).socketsLeave(rooms.conversation(group.id));
      const gatewayA = nodeA.app.get(RealtimeGateway);
      await eventually(() => !gatewayA.localSockets(rooms.conversation(group.id)).some((socket) => socket.data.userId === alice.userId), 3_000, 'the leave on node A');
      await ok(onB.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: 'نباید برسد' });
      await pause(300);
      expect(onA.events.filter((envelope) => envelope.type === 'message:new')).toHaveLength(1);

      // And through the relay: a REST change on the HTTP side reaches node A's sockets.
      expectStatus(await t.http().delete(`${wsPath(workspace.id)}/members/${bob.userId}`).set(bearer(owner)), 204);
      await t.flushNotifications();
      await next(onB, 'workspace:removed');
      expect(await call(onB.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: 'x' })).toMatchObject({ ok: false, code: 'NOT_SUBSCRIBED' });
    } finally {
      onA.socket.close();
      onB.socket.close();
    }
  });
});

describe('M3 checklist: ordering under concurrency', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let nodeA: Peer;
  let nodeB: Peer;

  beforeAll(async () => {
    // The per-socket send limit (5/s) is not what this measures; lift it for the senders.
    ({ t, owner, workspace } = await world({ WS_SEND_BURST: '1000', WS_SEND_PER_SECOND: '1000', DATABASE_POOL_MAX: '10' }));
    [nodeA, nodeB] = await Promise.all([createPeer(t, { APP_ROLE: 'ws' }), createPeer(t, { APP_ROLE: 'ws' })]);
  });
  afterAll(async () => {
    await Promise.allSettled([nodeA?.close(), nodeB?.close()]);
    await t?.close();
  });

  it('gives 50 concurrent senders × 200 messages the seqs 1–10,000 exactly once, retries included', { timeout: 240_000 }, async () => {
    const senders = await seedMembers(t, workspace.id, 50);
    const channel = await createConversation(t, owner, workspace.id, { kind: 'channel', title: 'همزمانی', memberIds: senders.map((sender) => sender.userId) });
    const sockets = await Promise.all(senders.map((sender, index) => connect((index % 2 === 0 ? nodeA : nodeB).baseUrl, sender.accessToken)));
    const observer = await connect(nodeA.baseUrl, owner.accessToken);
    try {
      await Promise.all([...sockets, observer].map((connected) => ok(connected.socket, 'workspace:subscribe', { workspaceId: workspace.id })));
      const acks = new Map<string, number>();
      let retried = 0;
      await Promise.all(
        sockets.map(async (connected, sender) => {
          for (let index = 0; index < 200; index += 1) {
            const clientMsgId = randomUUID();
            const body = { conversationId: channel.id, clientMsgId, kind: 'text' as const, text: `${sender}:${index}` };
            const first = await ok(connected.socket, 'message:send', body);
            acks.set(clientMsgId, first.seq);
            // Every tenth message is sent again, as a client does when an ack is lost.
            if (index % 10 === 0) {
              const again = await ok(connected.socket, 'message:send', body);
              expect(again).toMatchObject({ id: first.id, seq: first.seq, duplicate: true });
              retried += 1;
            }
          }
        }),
      );
      expect(retried).toBe(1_000);
      const seqs = [...acks.values()].sort((a, b) => a - b);
      expect(seqs).toHaveLength(10_000);
      expect(seqs.every((seq, index) => seq === index + 1)).toBe(true);

      const { rows } = await t.admin.query<{ n: string; distinct_seq: string; min: string; max: string; last_seq: string }>(
        `select count(*) as n, count(distinct seq) as distinct_seq, min(seq) as min, max(seq) as max,
                (select last_seq from conversations where id = $1) as last_seq
         from messages where conversation_id = $1`,
        [channel.id],
      );
      expect(rows[0]).toEqual({ n: '10000', distinct_seq: '10000', min: '1', max: '10000', last_seq: '10000' });
      // The observer saw every message once, whichever node it was sent through.
      await eventually(() => observer.events.filter((envelope) => envelope.type === 'message:new').length >= 10_000, 30_000, '10,000 deliveries');
      const seen = observer.events.filter((envelope) => envelope.type === 'message:new').map((envelope) => (envelope.data as MessageView).seq);
      expect(new Set(seen).size).toBe(10_000);
      expect(seen).toHaveLength(10_000);
    } finally {
      for (const connected of [...sockets, observer]) connected.socket.close();
    }
  });
});

describe('M3 checklist: a node dies mid-stream', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let nodeA: Peer;
  let nodeB: Peer;

  beforeAll(async () => {
    ({ t, owner, workspace } = await world({ WS_SEND_BURST: '1000', WS_SEND_PER_SECOND: '1000' }));
    [nodeA, nodeB] = await Promise.all([createPeer(t, { APP_ROLE: 'ws' }), createPeer(t, { APP_ROLE: 'ws' })]);
  });
  afterAll(async () => {
    await Promise.allSettled([nodeA?.close(), nodeB?.close()]);
    await t?.close();
  });

  it('reconnects every client elsewhere and recovers every missed message with sync:resume', { timeout: 120_000 }, async () => {
    const readers = await seedMembers(t, workspace.id, 10);
    const [writer] = await seedMembers(t, workspace.id, 1);
    const group = await createConversation(t, owner, workspace.id, { kind: 'group', title: 'مقاوم', memberIds: [...readers, writer as SeededMember].map((person) => person.userId) });
    const TOTAL = 300;

    /** A client that, like the web app behind a load balancer, reconnects to the surviving node and resumes. */
    const clients = await Promise.all(
      readers.map(async (reader) => {
        const received = new Map<number, string>();
        let lastSeq = 0;
        let connected: Connected = await connect(nodeA.baseUrl, reader.accessToken);
        const track = (current: Connected) =>
          current.socket.on('message:new', (envelope) => {
            received.set(envelope.data.seq, envelope.data.id);
            lastSeq = Math.max(lastSeq, envelope.data.seq);
          });
        track(connected);
        await ok(connected.socket, 'workspace:subscribe', { workspaceId: workspace.id });
        const recovered = connected.closed.then(async () => {
          connected = await connect(nodeB.baseUrl, reader.accessToken);
          track(connected);
          const resumed = await ok(connected.socket, 'sync:resume', { workspaceId: workspace.id, conversations: { [group.id]: lastSeq }, lastEventId: null });
          const page = resumed.conversations[group.id];
          if (!page || !('messages' in page)) throw new Error('expected the missed messages, not a gap');
          for (const message of page.messages) received.set(message.seq, message.id);
        });
        return { received, recovered, close: () => connected.socket.close() };
      }),
    );

    const sender = await connect(nodeB.baseUrl, (writer as SeededMember).accessToken);
    await ok(sender.socket, 'workspace:subscribe', { workspaceId: workspace.id });
    try {
      for (let index = 1; index <= TOTAL; index += 1) {
        await ok(sender.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: `${index}` });
        if (index === 100) nodeA.app.get(RealtimeGateway).crash();
      }
      await Promise.all(clients.map((client) => client.recovered));
      for (const client of clients) {
        await eventually(() => client.received.size >= TOTAL, 10_000, 'every message');
        expect([...client.received.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: TOTAL }, (_, index) => index + 1));
      }
    } finally {
      sender.socket.close();
      for (const client of clients) client.close();
    }
  });
});

describe('M3 checklist: presence', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let nodeA: Peer;
  let nodeB: Peer;

  beforeAll(async () => {
    ({ t, owner, workspace } = await world());
    [nodeA, nodeB] = await Promise.all([createPeer(t, { APP_ROLE: 'ws' }), createPeer(t, { APP_ROLE: 'ws' })]);
  });
  afterAll(async () => {
    await Promise.allSettled([nodeA?.close(), nodeB?.close()]);
    await t?.close();
  });

  it('shows a user offline within 30 s of their node dying, and never flaps on a quick reconnect', { timeout: 90_000 }, async () => {
    const [victim, flapper] = (await seedMembers(t, workspace.id, 2)) as [SeededMember, SeededMember];
    const observer = await connect(nodeB.baseUrl, owner.accessToken);
    await ok(observer.socket, 'workspace:subscribe', { workspaceId: workspace.id });
    const onA = await connect(nodeA.baseUrl, victim.accessToken);
    await next(observer, 'presence:updated', (envelope) => envelope.data.userId === victim.userId && envelope.data.online, 6_000);

    // A quick reconnect: offline for a second, well inside the 10 s grace.
    let flapping = await connect(nodeB.baseUrl, flapper.accessToken);
    await next(observer, 'presence:updated', (envelope) => envelope.data.userId === flapper.userId && envelope.data.online, 6_000);
    flapping.socket.close();
    await pause(1_000);
    flapping = await connect(nodeA.baseUrl, flapper.accessToken);

    const killedAt = Date.now();
    nodeA.app.get(RealtimeGateway).crash();
    // The flapper was on node A too: they reconnect elsewhere at once, as a client does.
    flapping = await connect(nodeB.baseUrl, flapper.accessToken);
    const offline = await next(observer, 'presence:updated', (envelope) => envelope.data.userId === victim.userId && !envelope.data.online, 30_000);
    const elapsed = Date.now() - killedAt;
    expect(offline.data).toEqual({ userId: victim.userId, online: false });
    expect(elapsed).toBeLessThan(30_000);
    // Give any late announcement time to arrive: the flapper was never reported offline.
    await pause(3_000);
    const flaps = observer.events
      .filter((envelope) => envelope.type === 'presence:updated')
      .map((envelope) => envelope.data as RealtimeEventMap['presence:updated'])
      .filter((data) => data.userId === flapper.userId && !data.online);
    expect(flaps).toEqual([]);
    const members = (await t.http().get(`${wsPath(workspace.id)}/members`).set(bearer(owner))).body as { userId: string; online: boolean }[];
    expect(members.find((entry) => entry.userId === victim.userId)?.online).toBe(false);
    expect(members.find((entry) => entry.userId === flapper.userId)?.online).toBe(true);
    for (const connected of [observer, onA, flapping]) connected.socket.close();
  });
});

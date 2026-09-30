import { randomUUID } from 'node:crypto';
import { importJWK, type JWK, SignJWT } from 'jose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { WorkspaceView } from '@taskin/contracts';
import { Clock } from '../../src/platform/clock/clock.js';
import { addMember, bearer, createTestApp, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { createConversation } from './chat-helpers.js';
import { call, connect, type Connected, eventually, next, ok, pause, received } from './socket-helpers.js';
import { createProject, createTask, expectStatus, usePlan, wsPath } from './work-helpers.js';

describe('M3: the realtime gateway', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  let ali: Session;
  let sara: Session;
  const open: Connected[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    await usePlan(t, workspace.id, 'team');
    ali = await addMember(t, owner, workspace.id, 'member');
    sara = await addMember(t, owner, workspace.id, 'member');
  });
  afterEach(() => {
    t.app.get(Clock).pin(null);
    for (const connected of open.splice(0)) connected.socket.close();
  });
  afterAll(async () => {
    await t?.close();
  });

  const join = async (session: Session) => {
    const connected = await connect(t.baseUrl, session.accessToken);
    open.push(connected);
    await ok(connected.socket, 'workspace:subscribe', { workspaceId: workspace.id });
    return connected;
  };

  it('refuses a handshake without a valid, live token, with a code the client can act on', async () => {
    await expect(connect(t.baseUrl, '')).rejects.toMatchObject({ code: 'AUTH_INVALID' });
    await expect(connect(t.baseUrl, 'not-a-token')).rejects.toMatchObject({ code: 'AUTH_INVALID' });
    // A token that expired five minutes ago (signed with the deployment's own key).
    const [jwk] = JSON.parse(t.settings.JWT_PRIVATE_JWKS ?? '[]') as JWK[];
    const issued = Math.floor(Date.now() / 1000) - 20 * 60;
    const stale = await new SignJWT({ sid: ali.sessionId, auth_time: issued, amr: ['otp'], sv: 1 })
      .setProtectedHeader({ alg: 'EdDSA', kid: jwk?.kid, typ: 'at+jwt' })
      .setIssuer(t.env.JWT_ISSUER)
      .setAudience(t.env.JWT_AUDIENCE)
      .setSubject(ali.userId)
      .setJti(randomUUID())
      .setIssuedAt(issued)
      .setExpirationTime(issued + 15 * 60)
      .sign(await importJWK(jwk as JWK, 'EdDSA'));
    await expect(connect(t.baseUrl, stale)).rejects.toMatchObject({ code: 'AUTH_EXPIRED' });
    // A signed-out session's token is refused, though it has not expired.
    const other = await addMember(t, owner, workspace.id, 'member');
    expectStatus(await t.http().post('/api/v1/auth/logout').set(bearer(other)).set('Cookie', other.cookies).set('X-CSRF-Token', other.csrf).set('Origin', 'https://app.taskin.test'), 204);
    await expect(connect(t.baseUrl, other.accessToken)).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  });

  it('subscribes a socket to one workspace, and only one it belongs to', async () => {
    const connected = await connect(t.baseUrl, ali.accessToken);
    open.push(connected);
    const refused = await call(connected.socket, 'message:send', { conversationId: randomUUID(), clientMsgId: randomUUID(), kind: 'text', text: 'x' });
    expect(refused).toMatchObject({ ok: false, code: 'NOT_SUBSCRIBED' });
    expect(await call(connected.socket, 'workspace:subscribe', { workspaceId: randomUUID() })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await call(connected.socket, 'workspace:subscribe', { workspaceId: 'nope' } as never)).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    const subscribed = await ok(connected.socket, 'workspace:subscribe', { workspaceId: workspace.id });
    expect(subscribed.online).toContain(ali.userId);
  });

  it('delivers a message to the other members at once, acks the sender with its seq, and keeps retries single', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'زنده', memberIds: [sara.userId] });
    const [aliSocket, saraSocket] = await Promise.all([join(ali), join(sara)]);
    const clientMsgId = randomUUID();
    const ack = await ok(aliSocket.socket, 'message:send', { conversationId: group.id, clientMsgId, kind: 'text', text: 'سلام سارا' });
    expect(ack).toMatchObject({ seq: 1, duplicate: false });
    const delivered = await next(saraSocket, 'message:new');
    expect(delivered).toMatchObject({ eventId: null, workspaceId: workspace.id, actorId: ali.userId, data: { id: ack.id, seq: 1, text: 'سلام سارا', authorId: ali.userId, clientMsgId } });
    // The sender's own socket gets the ack, not an echo.
    await pause(150);
    expect(received(aliSocket, 'message:new')).toEqual([]);
    const again = await ok(aliSocket.socket, 'message:send', { conversationId: group.id, clientMsgId, kind: 'text', text: 'سلام سارا' });
    expect(again).toMatchObject({ id: ack.id, seq: 1, duplicate: true });
    await pause(150);
    expect(received(saraSocket, 'message:new')).toHaveLength(1);
    // Validation happens before anything is stored.
    expect(await call(aliSocket.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: '' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(await call(aliSocket.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: 'x', extra: 1 } as never)).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    // A plain message takes the one-round-trip path, which refuses exactly what the transactional one does.
    const elsewhere = await createConversation(t, owner, workspace.id, { kind: 'group', title: 'جای دیگر', memberIds: [] });
    expect(await call(aliSocket.socket, 'message:send', { conversationId: elsewhere.id, clientMsgId: randomUUID(), kind: 'text', text: 'سلام' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    const announcements = await createConversation(t, owner, workspace.id, { kind: 'channel', title: 'اطلاعیه', postPolicy: 'admins', memberIds: [ali.userId] });
    expect(await call(aliSocket.socket, 'message:send', { conversationId: announcements.id, clientMsgId: randomUUID(), kind: 'text', text: 'نه' })).toMatchObject({ ok: false, code: 'POSTING_RESTRICTED' });
    // A mention takes the transactional path, with the notification in the same transaction.
    const mention = await ok(aliSocket.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: `<@${sara.userId}> ببین` });
    expect((await next(saraSocket, 'message:new', (envelope) => envelope.data.id === mention.id)).data.mentionIds).toEqual([sara.userId]);
  });

  it('broadcasts edits, deletes and reactions as replayable events', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'تغییر', memberIds: [sara.userId] });
    const [aliSocket, saraSocket] = await Promise.all([join(ali), join(sara)]);
    const sent = await ok(aliSocket.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: 'اول' });
    await ok(aliSocket.socket, 'message:edit', { messageId: sent.id, text: 'دوم' });
    expect((await next(saraSocket, 'message:updated')).data).toMatchObject({ id: sent.id, text: 'دوم' });
    const reaction = await ok(saraSocket.socket, 'message:react', { messageId: sent.id, emoji: '🔥', on: true });
    expect(reaction.reaction).toEqual({ emoji: '🔥', userIds: [sara.userId] });
    const heard = await next(aliSocket, 'reaction:updated');
    expect(heard.data).toMatchObject({ messageId: sent.id, emoji: '🔥', userIds: [sara.userId] });
    expect(heard.eventId).toMatch(/^\d+-\d+$/);
    await ok(aliSocket.socket, 'message:delete', { messageId: sent.id });
    expect((await next(saraSocket, 'message:deleted')).data).toMatchObject({ messageId: sent.id, seq: 1 });
    expect(await call(saraSocket.socket, 'message:edit', { messageId: sent.id, text: 'نه' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('relays typing to the others, and stops it by itself', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'تایپ', memberIds: [sara.userId] });
    const [aliSocket, saraSocket] = await Promise.all([join(ali), join(sara)]);
    aliSocket.socket.emit('typing:start', { conversationId: group.id });
    expect((await next(saraSocket, 'typing')).data).toEqual({ conversationId: group.id, userId: ali.userId, typing: true });
    aliSocket.socket.emit('typing:stop', { conversationId: group.id });
    expect((await next(saraSocket, 'typing', (envelope) => !envelope.data.typing)).data.typing).toBe(false);
    // Typing in a conversation you are not in goes nowhere.
    const other = await createConversation(t, owner, workspace.id, { kind: 'group', title: 'دیگر', memberIds: [sara.userId] });
    aliSocket.socket.emit('typing:start', { conversationId: other.id });
    await pause(200);
    expect(received(saraSocket, 'typing').filter((envelope) => envelope.data.conversationId === other.id)).toEqual([]);
  });

  it('advances read cursors and announces them, coalesced to one event a second', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'خوانده', memberIds: [sara.userId] });
    const [aliSocket, saraSocket] = await Promise.all([join(ali), join(sara)]);
    for (let index = 0; index < 3; index += 1) await ok(aliSocket.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: `${index}` });
    await ok(saraSocket.socket, 'message:delivered', { conversationId: group.id, seq: 3 });
    await ok(saraSocket.socket, 'message:read', { conversationId: group.id, seq: 1 });
    await ok(saraSocket.socket, 'message:read', { conversationId: group.id, seq: 2 });
    const update = await next(aliSocket, 'read:updated', (envelope) => envelope.data.userId === sara.userId, 3_000);
    expect(update.data).toEqual({ conversationId: group.id, userId: sara.userId, lastReadSeq: 2, lastDeliveredSeq: 3 });
    await pause(1_200);
    expect(received(aliSocket, 'read:updated').filter((envelope) => envelope.data.userId === sara.userId)).toHaveLength(1);
    // Socket receipts are written in one batch per window: by the announcement they are stored.
    const list = await t.http().get(`${wsPath(workspace.id)}/conversations`).set(bearer(sara));
    expect((list.body as { id: string }[]).find((item) => item.id === group.id)).toMatchObject({ unreadCount: 1, lastReadSeq: 2 });
    // A receipt for a conversation the socket is not in goes nowhere.
    const other = await createConversation(t, owner, workspace.id, { kind: 'group', title: 'بیرون', memberIds: [] });
    expect(await call(saraSocket.socket, 'message:read', { conversationId: other.id, seq: 1 })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('moves sockets into new conversations and out of removed ones, through the relay', async () => {
    const [aliSocket, saraSocket] = await Promise.all([join(ali), join(sara)]);
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'اتاق', memberIds: [] });
    await t.flushNotifications();
    expectStatus(await t.http().put(`${wsPath(workspace.id)}/conversations/${group.id}/members/${sara.userId}`).set(bearer(ali)).send({}), 200);
    await t.flushNotifications();
    expect((await next(saraSocket, 'conversation:member_added')).data).toMatchObject({ conversationId: group.id, userId: sara.userId });
    await ok(aliSocket.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: 'خوش آمدی' });
    await next(saraSocket, 'message:new', (envelope) => envelope.data.conversationId === group.id);

    expectStatus(await t.http().delete(`${wsPath(workspace.id)}/conversations/${group.id}/members/${sara.userId}`).set(bearer(ali)), 204);
    await t.flushNotifications();
    await next(saraSocket, 'conversation:member_removed', (envelope) => envelope.data.userId === sara.userId);
    await ok(aliSocket.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: 'رفت' });
    await pause(200);
    expect(received(saraSocket, 'message:new').filter((envelope) => envelope.data.conversationId === group.id)).toHaveLength(1);
  });

  it('pushes board events to the project room only, and notifications to their recipient', async () => {
    const project = await createProject(t, owner, workspace.id, { visibility: 'private' });
    const [aliSocket, saraSocket] = await Promise.all([join(ali), join(sara)]);
    expectStatus(await t.http().put(`${wsPath(workspace.id)}/projects/${project.id}/members/${ali.userId}`).set(bearer(owner)).send({ role: 'contributor' }), 200);
    await t.flushNotifications();
    // The relay re-evaluated Ali's rooms: he can see the private project now.
    await next(aliSocket, 'permissions:updated');
    const task = await createTask(t, owner, workspace.id, { projectId: project.id, assigneeIds: [ali.userId] });
    await t.flushNotifications();
    const created = await next(aliSocket, 'task:created');
    expect(created).toMatchObject({ version: 1, data: { taskId: task.id, projectId: project.id } });
    expect(created.eventId).toMatch(/^\d+-\d+$/);
    expect((await next(aliSocket, 'notification:new')).data).toMatchObject({ kind: 'task-assigned', targetId: task.id });
    await pause(150);
    expect(saraSocket.events.filter((envelope) => envelope.type === 'task:created' || envelope.type === 'notification:new')).toEqual([]);
  });

  it('takes a refreshed token in-band, and drops a socket a minute after its token expires', async () => {
    const connected = await join(ali);
    const refreshed = await t.http().post('/api/v1/auth/refresh').set('Cookie', ali.cookies).set('X-CSRF-Token', ali.csrf).set('Origin', 'https://app.taskin.test');
    expectStatus(refreshed, 200);
    const renewed = await ok(connected.socket, 'auth:refresh', { token: refreshed.body.accessToken });
    expect(Date.parse(renewed.expiresAt)).toBeGreaterThan(Date.now() + 10 * 60_000);
    // Someone else's token is refused.
    expect(await call(connected.socket, 'auth:refresh', { token: sara.accessToken })).toMatchObject({ ok: false, code: 'AUTH_INVALID' });
    // 16 minutes later (a 15-minute token plus the minute of grace), the next event drops the socket.
    t.app.get(Clock).pin(new Date(Date.parse(renewed.expiresAt) + 61_000));
    expect(await call(connected.socket, 'message:read', { conversationId: randomUUID(), seq: 1 })).toMatchObject({ ok: false, code: 'AUTH_EXPIRED' });
    await connected.closed;
    expect(connected.events.map((envelope) => envelope.type)).toContain('auth:expired');
  });

  it('disconnects the sockets of a session that is signed out', async () => {
    const other = await addMember(t, owner, workspace.id, 'member');
    const connected = await join(other);
    expectStatus(await t.http().post('/api/v1/auth/logout').set(bearer(other)).set('Cookie', other.cookies).set('X-CSRF-Token', other.csrf).set('Origin', 'https://app.taskin.test'), 204);
    await t.flushNotifications();
    await connected.closed;
    expect(connected.events.map((envelope) => envelope.type)).toContain('session:revoked');
  });

  it('holds each socket to its rate limit and its frame size', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'سیل', memberIds: [sara.userId] });
    const connected = await join(ali);
    const acks = await Promise.all(
      Array.from({ length: 30 }, (_, index) => call(connected.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: `${index}` })),
    );
    const limited = acks.filter((ack) => !ack.ok);
    expect(acks.filter((ack) => ack.ok).length).toBeGreaterThanOrEqual(20);
    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0]).toMatchObject({ ok: false, code: 'RATE_LIMITED', retryAfterMs: expect.any(Number) });
    // Over 64 KB in one frame: the connection closes.
    connected.socket.emit('message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: 'x'.repeat(70_000) } as never, () => undefined);
    await connected.closed;
  });

  it('recovers missed messages by seq and missed events by id after a reconnect', async () => {
    const group = await createConversation(t, ali, workspace.id, { kind: 'group', title: 'بازگشت', memberIds: [sara.userId] });
    const project = await createProject(t, owner, workspace.id);
    const aliSocket = await join(ali);
    let saraSocket = await join(sara);
    await ok(aliSocket.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: 'یک' });
    await next(saraSocket, 'message:new');
    await createTask(t, owner, workspace.id, { projectId: project.id, title: 'اول' });
    await t.flushNotifications();
    const lastEventId = (await next(saraSocket, 'task:created')).eventId;
    saraSocket.socket.close();

    // While Sara is away: two messages and a task.
    await ok(aliSocket.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: 'دو' });
    await ok(aliSocket.socket, 'message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: 'سه' });
    const missed = await createTask(t, owner, workspace.id, { projectId: project.id, title: 'دوم' });
    await t.flushNotifications();

    saraSocket = await connect(t.baseUrl, sara.accessToken);
    open.push(saraSocket);
    const resumed = await ok(saraSocket.socket, 'sync:resume', { workspaceId: workspace.id, conversations: { [group.id]: 1 }, lastEventId });
    const recovered = resumed.conversations[group.id];
    expect(recovered && 'messages' in recovered ? recovered.messages.map((message) => message.text) : recovered).toEqual(['دو', 'سه']);
    expect(resumed.replayed).toBeGreaterThanOrEqual(1);
    expect(saraSocket.events.find((envelope) => envelope.type === 'task:created')?.data).toMatchObject({ taskId: missed.id });
    // Once the stream has been trimmed past that id, resuming asks for a full resync instead.
    await t.redis.xtrim(`${t.env.REDIS_PREFIX}:rt:events:${workspace.id}`, 'MAXLEN', 0);
    await ok(saraSocket.socket, 'sync:resume', { workspaceId: workspace.id, conversations: {}, lastEventId });
    await eventually(() => saraSocket.events.some((envelope) => envelope.type === 'resync:required'), 2_000, 'resync:required');
  });

  it('lists members with whether they are connected now', async () => {
    const connected = await join(sara);
    const members = (await t.http().get(`${wsPath(workspace.id)}/members`).set(bearer(owner))).body as { userId: string; online: boolean }[];
    expect(members.find((entry) => entry.userId === sara.userId)?.online).toBe(true);
    expect(members.find((entry) => entry.userId === owner.userId)?.online).toBe(false);
    connected.socket.close();
  });
});

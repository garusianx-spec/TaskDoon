// Smoke test of the scaled stack (infra/compose.scale.yml): a message sent through one WebSocket
// node reaches a client on the other, nginx routes both REST and WebSocket traffic, and a room
// change made over REST (REST node → outbox → worker relay → bus) reaches the WebSocket nodes.
//
//   docker compose -f infra/docker-compose.yml -f infra/compose.scale.yml --profile scale up -d --build --wait
//   node apps/api/scripts/scale-smoke.mjs
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import argon2 from 'argon2';
import { importJWK, SignJWT } from 'jose';
import pg from 'pg';
import { io } from 'socket.io-client';

const EDGE = process.env.SCALE_EDGE_URL ?? 'http://localhost:8080';
const NODES = (process.env.SCALE_WS_NODES ?? 'http://localhost:4101,http://localhost:4102').split(',');
const DATABASE = process.env.SCALE_DATABASE_URL ?? 'postgres://taskin_migrator:taskin_migrator@localhost:5432/taskin';

const env = readFileSync(new URL('../../../infra/scale/dev.env', import.meta.url), 'utf8');
const [jwk] = JSON.parse(/^JWT_PRIVATE_JWKS=(.*)$/m.exec(env)?.[1] ?? '[]');
const key = await importJWK(jwk, 'EdDSA');

const step = (text) => console.log(`• ${text}`);
const fail = (text) => {
  console.error(`✗ ${text}`);
  process.exit(1);
};

async function token(userId) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: randomUUID(), auth_time: now, amr: ['otp'], sv: 1 })
    .setProtectedHeader({ alg: 'EdDSA', kid: jwk.kid, typ: 'at+jwt' })
    .setIssuer('taskin-api')
    .setAudience('taskin-web')
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(key);
}

async function rest(path, bearer, init = {}) {
  const response = await fetch(`${EDGE}/api/v1${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}`, 'idempotency-key': randomUUID(), ...(init.headers ?? {}) },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) fail(`${init.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

function connect(url, bearer) {
  const socket = io(url, { path: '/rt', transports: ['websocket'], auth: { token: bearer }, reconnection: false, forceNew: true });
  const events = [];
  socket.onAny((type, envelope) => events.push({ type, envelope }));
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve({ socket, events }));
    socket.once('connect_error', (error) => reject(new Error(`${url}: ${error.message}`)));
  });
}

async function waitFor(client, type, test = () => true, ms = 5_000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const found = client.events.find((entry) => entry.type === type && test(entry.envelope));
    if (found) return found.envelope;
    if (Date.now() > deadline) fail(`no ${type} within ${ms} ms`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const db = new pg.Client({ connectionString: DATABASE });
await db.connect();
const suffix = String(Math.floor(Math.random() * 9_000_000)).padStart(7, '0');
// Workspace owners need an admin password (RFC §5.2); its value does not matter here.
const passwordHash = await argon2.hash(randomBytes(16).toString('hex'));
const { rows } = await db.query(
  `insert into users (phone, phone_verified_at, full_name, password_hash) values ($1, now(), 'مالک آزمون', $3), ($2, now(), 'عضو آزمون', null) returning id`,
  [`+98937${suffix}`, `+98938${suffix}`, passwordHash],
);
const [owner, member] = rows.map((row) => row.id);
const ownerToken = await token(owner);
const memberToken = await token(member);

step('REST through nginx: create a workspace and a group');
const workspace = await rest('/workspaces', ownerToken, { method: 'POST', body: JSON.stringify({ name: `مقیاس ${suffix}` }) });
await db.query(`insert into workspace_members (workspace_id, user_id, role_id) select $1, $2, id from roles where workspace_id = $1 and key = 'member'`, [workspace.id, member]);
const group = await rest(`/workspaces/${workspace.id}/conversations`, ownerToken, { method: 'POST', body: JSON.stringify({ kind: 'group', title: 'دو گره', memberIds: [member] }) });

step(`WebSocket: member on ${NODES[0]}, owner on ${NODES[1]}, member again through nginx`);
const onA = await connect(NODES[0], memberToken);
const onB = await connect(NODES[1], ownerToken);
const viaEdge = await connect(EDGE, memberToken);
for (const client of [onA, onB, viaEdge]) {
  const ack = await client.socket.timeout(5_000).emitWithAck('workspace:subscribe', { workspaceId: workspace.id });
  if (!ack.ok) fail(`subscribe: ${JSON.stringify(ack)}`);
}

step('a message sent through node B reaches node A and the edge client');
const sent = await onB.socket.timeout(5_000).emitWithAck('message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: 'سلام از گره دوم' });
if (!sent.ok || sent.seq !== 1) fail(`send: ${JSON.stringify(sent)}`);
await waitFor(onA, 'message:new', (envelope) => envelope.data.id === sent.id);
await waitFor(viaEdge, 'message:new', (envelope) => envelope.data.id === sent.id);

step('a REST removal travels through the worker relay to the WebSocket nodes');
await rest(`/workspaces/${workspace.id}/conversations/${group.id}/members/${member}`, ownerToken, { method: 'DELETE' });
await waitFor(onA, 'conversation:member_removed', (envelope) => envelope.data.userId === member, 10_000);
await new Promise((resolve) => setTimeout(resolve, 300));
const after = await onB.socket.timeout(5_000).emitWithAck('message:send', { conversationId: group.id, clientMsgId: randomUUID(), kind: 'text', text: 'دیگر نمی‌رسد' });
if (!after.ok) fail(`send: ${JSON.stringify(after)}`);
await new Promise((resolve) => setTimeout(resolve, 1_000));
if (onA.events.some((entry) => entry.type === 'message:new' && entry.envelope.data.id === after.id)) fail('the removed member still received messages');

for (const client of [onA, onB, viaEdge]) client.socket.close();
await db.end();
console.log('✓ scaled stack: cross-node delivery, edge routing and relay-driven room changes all work');

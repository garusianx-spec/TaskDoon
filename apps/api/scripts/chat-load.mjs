// Chat load run against the scaled stack (infra/compose.scale.yml, RFC §9 M3): N sockets split
// over the WebSocket nodes, a steady message rate into groups, and task REST traffic through nginx
// at the same time. Reports, as p50/p95/p99:
//   ack      message:send → the persisted ack at the sender
//   fan-out  message:send → message:new at each other member of the group
//   REST     a mix of board, task list, task detail and task creation through nginx, first
//            without chat load (baseline) and then during it
// plus delivery accounting (every acknowledged message must reach every connected member).
//
//   THROTTLE_IP_PER_MINUTE=1000000 docker compose -f infra/docker-compose.yml -f infra/compose.scale.yml \
//     --profile scale up -d --build --wait
//   node apps/api/scripts/chat-load.mjs --sockets 20000 --rate 500 --duration 60
//
// Every process runs on one host and reads the same clock, so a recipient measures fan-out from
// the send time carried in the message text. One process drives a few thousand sockets
// comfortably, so the sockets are spread over --workers child processes. On Docker's default
// bridge, pass the containers' own addresses (--nodes, --edge) to skip the userland port proxy.
import { execFile, fork } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import argon2 from 'argon2';
import { importJWK, SignJWT } from 'jose';
import pg from 'pg';
import { io } from 'socket.io-client';

const { values: options } = parseArgs({
  options: {
    sockets: { type: 'string', default: '20000' },
    rate: { type: 'string', default: '500' },
    duration: { type: 'string', default: '60' },
    warmup: { type: 'string', default: '10' },
    workers: { type: 'string', default: '4' },
    nodes: { type: 'string', default: 'http://localhost:4101,http://localhost:4102' },
    edge: { type: 'string', default: 'http://localhost:8080' },
    database: { type: 'string', default: 'postgres://taskin_migrator:taskin_migrator@localhost:5432/taskin' },
    'workspace-size': { type: 'string', default: '100' },
    'group-size': { type: 'string', default: '10' },
    'connect-rate': { type: 'string', default: '400' },
    'read-ratio': { type: 'string', default: '0.1' },
    'rest-rate': { type: 'string', default: '25' },
    'rest-workspaces': { type: 'string', default: '10' },
    out: { type: 'string' },
  },
});

const settings = {
  sockets: Number(options.sockets),
  rate: Number(options.rate),
  duration: Number(options.duration),
  warmup: Number(options.warmup),
  workers: Number(options.workers),
  nodes: options.nodes.split(','),
  edge: options.edge,
  workspaceSize: Number(options['workspace-size']),
  groupSize: Number(options['group-size']),
  connectRate: Number(options['connect-rate']),
  readRatio: Number(options['read-ratio']),
  restRate: Number(options['rest-rate']),
  restWorkspaces: Number(options['rest-workspaces']),
};

/* ------------------------------------------------------------------ shared */

const env = readFileSync(new URL('../../../infra/scale/dev.env', import.meta.url), 'utf8');
const [jwk] = JSON.parse(/^JWT_PRIVATE_JWKS=(.*)$/m.exec(env)?.[1] ?? '[]');
const key = await importJWK(jwk, 'EdDSA');

async function token(userId) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: randomUUID(), auth_time: now, amr: ['otp'], sv: 1 })
    .setProtectedHeader({ alg: 'EdDSA', kid: jwk.kid, typ: 'at+jwt' })
    .setIssuer('taskin-api')
    .setAudience('taskin-web')
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
}

/** Milliseconds on a clock every process on this host shares. */
const now = () => performance.timeOrigin + performance.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Latency histograms: 1 ms buckets; the last one collects everything slower. They merge by addition.
const BUCKETS = 30_001;
const histogram = () => new Array(BUCKETS).fill(0);
const record = (h, ms) => {
  h[Math.min(BUCKETS - 1, Math.max(0, Math.round(ms)))] += 1;
};
const merge = (into, from) => {
  for (let i = 0; i < BUCKETS; i += 1) into[i] += from[i];
  return into;
};
function summary(h) {
  const count = h.reduce((sum, n) => sum + n, 0);
  const at = (q) => {
    const rank = Math.ceil(q * count);
    let seen = 0;
    for (let i = 0; i < BUCKETS; i += 1) {
      seen += h[i];
      if (seen >= rank) return i;
    }
    return BUCKETS - 1;
  };
  let max = 0;
  for (let i = BUCKETS - 1; i >= 0; i -= 1) if (h[i] > 0) { max = i; break; }
  return count === 0 ? { count } : { count, p50: at(0.5), p95: at(0.95), p99: at(0.99), max };
}

const tally = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

/* ------------------------------------------------------------------ worker */

async function worker() {
  const clients = [];
  let phase = 'idle';
  let sending = null;
  const ack = histogram();
  const fanout = histogram();
  const connectTime = histogram();
  const handshakeTime = histogram();
  const counts = { sent: 0, acked: 0, rejected: new Map(), timedOut: 0, delivered: 0, reads: 0, dropped: new Map(), events: new Map() };
  const ackedByConversation = new Map();
  // A busy load generator inflates what it measures: report its own event-loop delay.
  const loopDelay = monitorEventLoopDelay({ resolution: 10 });
  let cpuAtMeasure;
  let cpuDuringMeasure;

  function attach(client) {
    const { socket } = client;
    socket.on('message:new', (envelope) => {
      const text = envelope.data.text ?? '';
      if (!text.startsWith('load m ')) return;
      record(fanout, now() - Number(text.slice(7)));
      counts.delivered += 1;
      if (Math.random() < settings.readRatio) {
        socket.emit('message:read', { conversationId: envelope.data.conversationId, seq: envelope.data.seq });
        counts.reads += 1;
      }
    });
    socket.onAny((type) => {
      if (phase === 'measure') tally(counts.events, type);
    });
    socket.on('disconnect', (reason) => {
      client.connected = false;
      if (phase !== 'closing') tally(counts.dropped, reason);
    });
  }

  function connectOne(assignment) {
    return new Promise((resolve) => {
      const started = now();
      const socket = io(assignment.node, { path: '/rt', transports: ['websocket'], auth: { token: assignment.token }, reconnection: false, forceNew: true, timeout: 30_000 });
      const client = { socket, conversationId: assignment.conversationId, connected: false };
      socket.once('connect_error', (error) => {
        socket.close();
        resolve({ error: error.data?.code ?? error.message });
      });
      socket.once('connect', () => {
        record(handshakeTime, now() - started);
        socket.timeout(30_000).emit('workspace:subscribe', { workspaceId: assignment.workspaceId }, (error, response) => {
          if (error || !response.ok) {
            socket.close();
            resolve({ error: error ? 'subscribe timeout' : response.code });
            return;
          }
          record(connectTime, now() - started);
          client.connected = true;
          attach(client);
          clients.push(client);
          resolve({ client });
        });
      });
    });
  }

  function sendOne() {
    const client = clients[Math.floor(Math.random() * clients.length)];
    if (!client?.connected) return;
    const measuring = phase === 'measure';
    const started = now();
    counts.sent += measuring ? 1 : 0;
    const body = { conversationId: client.conversationId, clientMsgId: randomUUID(), kind: 'text', text: `load ${measuring ? 'm' : 'w'} ${started}` };
    client.socket.timeout(10_000).emit('message:send', body, (error, response) => {
      if (!measuring) return;
      if (error) counts.timedOut += 1;
      else if (!response.ok) tally(counts.rejected, response.code);
      else {
        record(ack, now() - started);
        counts.acked += 1;
        tally(ackedByConversation, client.conversationId);
      }
    });
  }

  process.on('message', async (message) => {
    if (message.type === 'connect') {
      const perSecond = settings.connectRate / settings.workers;
      const errors = new Map();
      const pending = [];
      const tokens = await Promise.all(message.assignments.map((assignment) => token(assignment.userId)));
      const started = now();
      for (const [index, assignment] of message.assignments.entries()) {
        const due = started + (index / perSecond) * 1000;
        if (due > now()) await sleep(due - now());
        pending.push(connectOne({ ...assignment, token: tokens[index] }).then((result) => result.error && tally(errors, result.error)));
      }
      await Promise.all(pending);
      const connectedByConversation = new Map();
      for (const client of clients) tally(connectedByConversation, client.conversationId);
      process.send({ type: 'connected', connected: clients.length, errors: [...errors], connectTime, handshakeTime, connectedByConversation: [...connectedByConversation] });
    } else if (message.type === 'phase') {
      phase = message.phase;
      if (phase === 'measure') {
        loopDelay.enable();
        cpuAtMeasure = process.cpuUsage();
      }
      if (phase === 'drain') {
        loopDelay.disable();
        cpuDuringMeasure = process.cpuUsage(cpuAtMeasure);
      }
      if (phase === 'warmup' && !sending) {
        // Paced by the clock, not by ticks: a late timer sends the messages it owes.
        const perMs = settings.rate / settings.workers / 1000;
        let due = 0;
        let last = now();
        sending = setInterval(() => {
          const at = now();
          due += (at - last) * perMs;
          last = at;
          while (due >= 1) {
            due -= 1;
            sendOne();
          }
        }, 20);
      }
      if (phase === 'drain') {
        clearInterval(sending);
        sending = null;
      }
    } else if (message.type === 'report') {
      process.send({
        type: 'report',
        ack,
        fanout,
        counts: { ...counts, rejected: [...counts.rejected], dropped: [...counts.dropped], events: [...counts.events] },
        ackedByConversation: [...ackedByConversation],
        stillConnected: clients.filter((client) => client.connected).length,
        cpuSeconds: cpuDuringMeasure ? (cpuDuringMeasure.user + cpuDuringMeasure.system) / 1e6 : null,
        // The histogram counts the 10 ms sampling interval itself; report only the delay beyond it.
        loopDelayMs: Object.fromEntries(
          [['p50', loopDelay.percentile(50)], ['p99', loopDelay.percentile(99)], ['max', loopDelay.max]].map(([name, ns]) => [name, Math.max(0, ns / 1e6 - 10)]),
        ),
      });
    } else if (message.type === 'close') {
      phase = 'closing';
      for (const client of clients) client.socket.close();
      process.exit(0);
    }
  });
  process.send({ type: 'ready' });
}

/* ------------------------------------------------------------- coordinator */

async function rest(path, bearer, init = {}) {
  const response = await fetch(`${settings.edge}/api/v1${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}`, 'idempotency-key': randomUUID(), ...(init.headers ?? {}) },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function pool(items, concurrency, run) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index], index);
      }
    }),
  );
  return results;
}

/** Workspaces of `workspaceSize` members, each member in exactly one group of `groupSize`. */
async function seed(db) {
  const workspaceCount = Math.ceil(settings.sockets / settings.workspaceSize);
  // Phones are +989 · a 4-digit run prefix no earlier run used · a 5-digit index.
  if (settings.sockets > 99_999) throw new Error('at most 99999 sockets');
  let run;
  do run = String(1000 + Math.floor(Math.random() * 9000));
  while ((await db.query(`select 1 from users where phone like $1 limit 1`, [`+989${run}%`])).rowCount > 0);
  const userIds = Array.from({ length: settings.sockets }, () => randomUUID());
  const passwordHash = await argon2.hash(randomBytes(16).toString('hex'));
  for (let offset = 0; offset < userIds.length; offset += 5_000) {
    const slice = userIds.slice(offset, offset + 5_000);
    await db.query(
      `insert into users (id, phone, phone_verified_at, full_name, password_hash)
       select id, '+989' || $2 || lpad((ord + $3 - 1)::text, 5, '0'), now(), 'کاربر بار ' || (ord + $3), case when (ord + $3 - 1) % $4 = 0 then $5 end
       from unnest($1::uuid[]) with ordinality as u(id, ord)`,
      [slice, run, offset, settings.workspaceSize, passwordHash],
    );
  }

  const owners = Array.from({ length: workspaceCount }, (_, w) => userIds[w * settings.workspaceSize]);
  const ownerTokens = await Promise.all(owners.map((owner) => token(owner)));
  const workspaces = await pool(ownerTokens, 16, (bearer, w) => rest('/workspaces', bearer, { method: 'POST', body: JSON.stringify({ name: `بار ${run}-${w}` }) }));
  const workspaceIds = workspaces.map((workspace) => workspace.id);

  const memberWorkspace = [];
  const memberUser = [];
  const conversationRows = { id: [], workspace: [], createdBy: [], title: [] };
  const memberRows = { workspace: [], conversation: [], user: [], role: [] };
  const assignments = [];
  for (let index = 0; index < userIds.length; index += 1) {
    const w = Math.floor(index / settings.workspaceSize);
    const inWorkspace = index % settings.workspaceSize;
    if (inWorkspace !== 0) {
      memberWorkspace.push(workspaceIds[w]);
      memberUser.push(userIds[index]);
    }
    if (inWorkspace % settings.groupSize === 0) {
      conversationRows.id.push(randomUUID());
      conversationRows.workspace.push(workspaceIds[w]);
      conversationRows.createdBy.push(userIds[index]);
      conversationRows.title.push(`گروه ${inWorkspace / settings.groupSize + 1}`);
    }
    const conversationId = conversationRows.id.at(-1);
    memberRows.workspace.push(workspaceIds[w]);
    memberRows.conversation.push(conversationId);
    memberRows.user.push(userIds[index]);
    memberRows.role.push(inWorkspace % settings.groupSize === 0 ? 'owner' : 'member');
    assignments.push({ userId: userIds[index], workspaceId: workspaceIds[w], conversationId, node: settings.nodes[index % settings.nodes.length] });
  }
  await db.query(
    `insert into workspace_members (workspace_id, user_id, role_id)
     select m.workspace_id, m.user_id, r.id from unnest($1::uuid[], $2::uuid[]) as m(workspace_id, user_id)
     join roles r on r.workspace_id = m.workspace_id and r.key = 'member'`,
    [memberWorkspace, memberUser],
  );
  await db.query(
    `insert into conversations (id, workspace_id, kind, title, created_by)
     select id, workspace_id, 'group', title, created_by from unnest($1::uuid[], $2::uuid[], $3::text[], $4::uuid[]) as c(id, workspace_id, title, created_by)`,
    [conversationRows.id, conversationRows.workspace, conversationRows.title, conversationRows.createdBy],
  );
  await db.query(
    `insert into conversation_members (workspace_id, conversation_id, user_id, role)
     select workspace_id, conversation_id, user_id, role::conversation_role
     from unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[]) as m(workspace_id, conversation_id, user_id, role)`,
    [memberRows.workspace, memberRows.conversation, memberRows.user, memberRows.role],
  );

  // Task fixtures for the REST traffic: one project with 30 cards in each of the first workspaces.
  const restTargets = await pool(workspaceIds.slice(0, settings.restWorkspaces), 4, async (workspaceId, w) => {
    const bearer = ownerTokens[w];
    const project = await rest(`/workspaces/${workspaceId}/projects`, bearer, { method: 'POST', body: JSON.stringify({ key: 'LOAD', name: 'پروژه بار' }) });
    const tasks = await pool(Array.from({ length: 30 }, (_, i) => i), 4, (i) =>
      rest(`/workspaces/${workspaceId}/tasks`, bearer, { method: 'POST', body: JSON.stringify({ projectId: project.id, title: `کارت ${i + 1}`, priority: 'medium' }) }),
    );
    return { workspaceId, projectId: project.id, taskIds: tasks.map((task) => task.id), bearer };
  });
  return { workspaceCount, conversationCount: conversationRows.id.length, assignments, restTargets };
}

/** Open-loop REST traffic: requests start on schedule whether or not earlier ones finished. */
async function restTraffic(targets, seconds) {
  const latency = histogram();
  const failures = new Map();
  const byKind = new Map();
  const inFlight = [];
  const started = now();
  const total = Math.round(settings.restRate * seconds);
  for (let i = 0; i < total; i += 1) {
    const due = started + (i / settings.restRate) * 1000;
    if (due > now()) await sleep(due - now());
    const target = targets[i % targets.length];
    const roll = Math.random();
    const [kind, path, init] =
      roll < 0.35
        ? ['board', `/workspaces/${target.workspaceId}/board?projectId=${target.projectId}`, {}]
        : roll < 0.65
          ? ['list', `/workspaces/${target.workspaceId}/tasks?projectId=${target.projectId}&limit=50`, {}]
          : roll < 0.85
            ? ['detail', `/workspaces/${target.workspaceId}/tasks/${target.taskIds[i % target.taskIds.length]}`, {}]
            : ['create', `/workspaces/${target.workspaceId}/tasks`, { method: 'POST', body: JSON.stringify({ projectId: target.projectId, title: `کارت بار ${i}` }) }];
    const sent = now();
    inFlight.push(
      rest(path, target.bearer, init).then(
        () => {
          const ms = now() - sent;
          record(latency, ms);
          if (!byKind.has(kind)) byKind.set(kind, histogram());
          record(byKind.get(kind), ms);
        },
        (error) => tally(failures, String(error.message).split(':').slice(0, 2).join(':')),
      ),
    );
  }
  await Promise.all(inFlight);
  return { latency, failures, byKind };
}

/** Busy share of every CPU on the host (Linux), for the report: the generator shares the box. */
function hostCpu() {
  try {
    const [, ...fields] = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).map(Number);
    const idle = fields[3] + fields[4];
    return { idle, total: fields.reduce((sum, n) => sum + n, 0) };
  } catch {
    return null;
  }
}

function dockerStats() {
  return new Promise((resolve) => {
    execFile('docker', ['stats', '--no-stream', '--format', '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'], (error, stdout) => resolve(error ? `(docker stats unavailable: ${error.message})` : stdout.trim()));
  });
}

async function coordinator() {
  const log = (text) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${text}`);
  log(`settings ${JSON.stringify(settings)}`);
  const db = new pg.Client({ connectionString: options.database });
  await db.connect();
  const seeded = await seed(db);
  await db.end();
  log(`seeded ${seeded.assignments.length} users in ${seeded.workspaceCount} workspaces, ${seeded.conversationCount} groups, ${seeded.restTargets.length} projects for REST`);

  const children = Array.from({ length: settings.workers }, () => fork(new URL(import.meta.url).pathname, process.argv.slice(2), { env: { ...process.env, CHAT_LOAD_WORKER: '1' } }));
  const inbox = children.map((child) => {
    const queue = [];
    const waiters = [];
    child.on('message', (message) => (waiters.length > 0 ? waiters.shift()(message) : queue.push(message)));
    return () => (queue.length > 0 ? Promise.resolve(queue.shift()) : new Promise((resolve) => waiters.push(resolve)));
  });
  const collect = (type) =>
    Promise.all(
      inbox.map(async (receive) => {
        for (;;) {
          const message = await receive();
          if (message.type === type) return message;
        }
      }),
    );
  await collect('ready');

  log(`connecting ${seeded.assignments.length} sockets at ${settings.connectRate}/s over ${settings.nodes.join(', ')}`);
  const connectStarted = now();
  children.forEach((child, w) => child.send({ type: 'connect', assignments: seeded.assignments.filter((_, index) => index % settings.workers === w) }));
  const connected = await collect('connected');
  const connectedByConversation = new Map();
  const connectErrors = new Map();
  for (const report of connected) {
    for (const [conversationId, n] of report.connectedByConversation) connectedByConversation.set(conversationId, (connectedByConversation.get(conversationId) ?? 0) + n);
    for (const [code, n] of report.errors) connectErrors.set(code, (connectErrors.get(code) ?? 0) + n);
  }
  const connectedTotal = connected.reduce((sum, report) => sum + report.connected, 0);
  const connectTime = connected.reduce((into, report) => merge(into, report.connectTime), histogram());
  const handshakeTime = connected.reduce((into, report) => merge(into, report.handshakeTime), histogram());
  log(`connected ${connectedTotal}/${seeded.assignments.length} in ${((now() - connectStarted) / 1000).toFixed(1)} s; handshake ${JSON.stringify(summary(handshakeTime))}; handshake+subscribe ${JSON.stringify(summary(connectTime))}${connectErrors.size ? `; errors ${JSON.stringify([...connectErrors])}` : ''}`);
  const idleStats = await dockerStats();

  log(`REST baseline, no chat traffic: ${settings.restRate} req/s for 15 s`);
  const baseline = await restTraffic(seeded.restTargets, 15);
  log(`REST baseline ${JSON.stringify(summary(baseline.latency))}`);

  log(`warm-up: ${settings.rate} msg/s for ${settings.warmup} s`);
  children.forEach((child) => child.send({ type: 'phase', phase: 'warmup' }));
  await sleep(settings.warmup * 1000);
  log(`measuring: ${settings.rate} msg/s and ${settings.restRate} REST req/s for ${settings.duration} s`);
  children.forEach((child) => child.send({ type: 'phase', phase: 'measure' }));
  const cpuBefore = hostCpu();
  const statsLater = sleep((settings.duration * 1000) / 2).then(() => dockerStats());
  const during = await restTraffic(seeded.restTargets, settings.duration);
  const loadStats = await statsLater;
  const cpuAfter = hostCpu();
  children.forEach((child) => child.send({ type: 'phase', phase: 'drain' }));
  await sleep(5_000);
  children.forEach((child) => child.send({ type: 'report' }));
  const reports = await collect('report');
  children.forEach((child) => child.send({ type: 'close' }));

  const ack = reports.reduce((into, report) => merge(into, report.ack), histogram());
  const fanout = reports.reduce((into, report) => merge(into, report.fanout), histogram());
  const sum = (field) => reports.reduce((total, report) => total + report.counts[field], 0);
  const mergeTally = (field) => {
    const into = new Map();
    for (const report of reports) for (const [key, n] of report.counts[field]) into.set(key, (into.get(key) ?? 0) + n);
    return Object.fromEntries(into);
  };
  let expected = 0;
  for (const report of reports) for (const [conversationId, n] of report.ackedByConversation) expected += n * ((connectedByConversation.get(conversationId) ?? 1) - 1);
  const result = {
    settings,
    sockets: { target: seeded.assignments.length, connected: connectedTotal, perNode: Math.round(connectedTotal / settings.nodes.length), stillConnected: reports.reduce((total, report) => total + report.stillConnected, 0), connectErrors: Object.fromEntries(connectErrors), handshakeMs: summary(handshakeTime), handshakeAndSubscribeMs: summary(connectTime) },
    messages: { sent: sum('sent'), acked: sum('acked'), perSecond: +(sum('acked') / settings.duration).toFixed(1), rejected: mergeTally('rejected'), timedOut: sum('timedOut'), ackMs: summary(ack) },
    fanout: { expected, delivered: sum('delivered'), ratio: expected ? +(sum('delivered') / expected).toFixed(6) : null, perSecond: +(sum('delivered') / settings.duration).toFixed(1), fanoutMs: summary(fanout), readsSent: sum('reads') },
    eventsReceived: mergeTally('events'),
    generatorLoopDelayMs: reports.map((report) => Object.fromEntries(Object.entries(report.loopDelayMs).map(([k, v]) => [k, +v.toFixed(1)]))),
    drops: mergeTally('dropped'),
    rest: {
      rate: settings.restRate,
      baselineMs: summary(baseline.latency),
      duringChatMs: summary(during.latency),
      duringByKind: Object.fromEntries([...during.byKind].map(([kind, h]) => [kind, summary(h)])),
      failures: Object.fromEntries(during.failures),
    },
    docker: { idle: idleStats, underLoad: loadStats },
    host: {
      cpus: (await import('node:os')).availableParallelism(),
      busyShare: cpuBefore && cpuAfter ? +(1 - (cpuAfter.idle - cpuBefore.idle) / (cpuAfter.total - cpuBefore.total)).toFixed(3) : null,
      generatorCpuCores: +(reports.reduce((total, report) => total + (report.cpuSeconds ?? 0), 0) / settings.duration).toFixed(2),
    },
  };
  console.log(JSON.stringify(result, null, 2));
  if (options.out) writeFileSync(options.out, JSON.stringify(result, null, 2));
  const verdict = [
    ['ack p95 < 150 ms', result.messages.ackMs.p95 < 150],
    ['fan-out p95 < 250 ms', result.fanout.fanoutMs.p95 < 250],
    ['REST p95 < 200 ms during chat load', result.rest.duringChatMs.p95 < 200],
    ['every acknowledged message delivered', result.fanout.delivered >= result.fanout.expected],
    [`${settings.rate} msg/s sustained`, result.messages.perSecond >= settings.rate * 0.98],
  ];
  for (const [what, ok] of verdict) console.log(`${ok ? '✓' : '✗'} ${what}`);
  process.exit(verdict.every(([, ok]) => ok) ? 0 : 1);
}

if (process.env.CHAT_LOAD_WORKER) await worker();
else await coordinator();

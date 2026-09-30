import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Redis } from 'ioredis';
import pg from 'pg';
import supertest from 'supertest';
import { inject } from 'vitest';
import type { AuthSession, CreateInvitationsResult, OtpChallenge, OtpVerifyResult, WorkspaceView } from '@taskin/contracts';
import { createApp } from '../../src/bootstrap.js';
import { type Env, envSchema } from '../../src/config/env.js';
import { MailService } from '../../src/platform/mail/mail.js';
import { OutboxRelay } from '../../src/platform/outbox/outbox-relay.js';
import { type NotificationJobData, type NotificationJobs, Queues, type WorkJobData, type WorkJobs } from '../../src/platform/queue/queues.js';
import { type ConsoleSmsProvider, SmsService } from '../../src/platform/sms/sms.js';
import { QueueWorkers } from '../../src/worker/workers.js';
import { adminUrl, dbUrl, REDIS_URL, S3 } from './infra.js';

export interface LogLine {
  readonly level: number;
  readonly msg?: string;
  readonly [key: string]: unknown;
}

export interface Session {
  readonly userId: string;
  readonly phone: string;
  readonly accessToken: string;
  readonly sessionId: string;
  /** `Cookie` header carrying the refresh and CSRF cookies. */
  cookies: string;
  csrf: string;
}

export interface TestApp {
  readonly app: NestExpressApplication;
  readonly env: Env;
  /** `http://127.0.0.1:<port>`: REST under /api/v1, the WebSocket gateway on /rt. */
  readonly baseUrl: string;
  /** The raw settings the app was built from, for peers that share its database and Redis. */
  readonly settings: Readonly<Record<string, string>>;
  readonly database: string;
  /** Bypasses row-level security (taskin_migrator): assertions and test setup only. */
  readonly admin: pg.Pool;
  /** Subject to row-level security (taskin_app), for the isolation tests. */
  readonly appPool: pg.Pool;
  readonly redis: Redis;
  readonly logs: LogLine[];
  /** The same lines as written, for checks JSON.parse would hide (duplicate keys). */
  readonly rawLogs: string[];
  readonly sms: ConsoleSmsProvider;
  readonly mail: NonNullable<MailService['memory']>;
  http(): supertest.Agent;
  /**
   * Publishes the outbox and runs the jobs it produced (SMS, email, fan-out, scans), as the worker
   * would, oldest first. Delayed jobs (reminders) run only with `{ delayed: true }`.
   */
  flushNotifications(options?: { delayed?: boolean }): Promise<number>;
  close(): Promise<void>;
}

const OTP_PEPPER = 'integration-test-pepper-integration-test';

/** A random, valid Iranian mobile number in E.164 (the 0912 range). */
export function randomPhone(): string {
  return `+98912${String(randomBytes(4).readUInt32BE() % 10_000_000).padStart(7, '0')}`;
}

/** `+98912…` as a person would type it. */
export const localForm = (e164: string) => `0${e164.slice(3)}`;

/**
 * Boots the full app (`APP_ROLE=all`, relay and workers off so tests drive them) against a fresh
 * clone of the migrated template database and a private Redis prefix.
 */
export async function createTestApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  const database = `taskin_test_${randomBytes(5).toString('hex')}`;
  const creator = new pg.Client({ connectionString: adminUrl() });
  await creator.connect();
  await creator.query(`create database ${database} template ${inject('templateDb')} owner taskin_migrator`);
  await creator.query(`revoke all on database ${database} from public`);
  await creator.query(`grant connect, temporary on database ${database} to taskin_app`);
  await creator.end();

  const prefix = `t${randomBytes(4).toString('hex')}`;
  // One signing key per test app, shared with its peers (other nodes must verify its tokens).
  const { privateKey } = generateKeyPairSync('ed25519');
  const jwks = JSON.stringify([{ ...privateKey.export({ format: 'jwk' }), kid: `test-${prefix}` }]);
  const settings: Record<string, string> = {
    NODE_ENV: 'test',
    APP_ROLE: 'all',
    LOG_LEVEL: 'info',
    DATABASE_URL: dbUrl(database, 'app'),
    DATABASE_MIGRATOR_URL: dbUrl(database, 'migrator'),
    DATABASE_POOL_MAX: '5',
    REDIS_CORE_URL: REDIS_URL,
    REDIS_RT_URL: REDIS_URL,
    REDIS_PREFIX: prefix,
    PUBLIC_WEB_ORIGIN: 'https://app.taskin.test',
    S3_ENDPOINT: S3.endpoint,
    S3_BUCKET: S3.bucket,
    S3_ACCESS_KEY: S3.accessKey,
    S3_SECRET_KEY: S3.secretKey,
    OTP_PEPPER,
    APP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    SMS_PROVIDERS: 'console',
    SMTP_URL: 'memory://',
    OUTBOX_RELAY_ENABLED: 'false',
    QUEUE_WORKERS_ENABLED: 'false',
    TRUST_PROXY: '1',
    JWT_PRIVATE_JWKS: jwks,
    ...overrides,
  };
  const env = envSchema.parse(settings);

  const logs: LogLine[] = [];
  const rawLogs: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue;
        rawLogs.push(line);
        logs.push(JSON.parse(line) as LogLine);
      }
      done();
    },
  });

  const app = await createApp(env, { logDestination: destination });
  // Listen once on a real port: supertest otherwise opens and closes a listener per request on
  // the shared server, which breaks requests that interleave.
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  const baseUrl = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '';
  const admin = new pg.Pool({ connectionString: dbUrl(database, 'migrator'), max: 3 });
  const appPool = new pg.Pool({ connectionString: dbUrl(database, 'app'), max: 3 });
  const redis = new Redis(REDIS_URL);
  const sms = app.get(SmsService).console;
  const mail = app.get(MailService).memory;
  if (!sms || !mail) throw new Error('tests need the console SMS driver and the memory mail transport');

  return {
    app,
    env,
    baseUrl,
    settings,
    database,
    admin,
    appPool,
    redis,
    logs,
    rawLogs,
    sms,
    mail,
    http: () => supertest.agent(baseUrl).set('X-Forwarded-For', '203.0.113.10'),
    async flushNotifications(options = {}) {
      const published = await app.get(OutboxRelay).drainOnce();
      const queues = app.get(Queues);
      const workers = app.get(QueueWorkers);
      for (const job of await queues.notifications.getJobs(['waiting', 'prioritized', 'delayed'], 0, -1, true)) {
        await workers.runNotification(job.name as keyof NotificationJobs, job.data as NotificationJobData);
        await job.remove();
      }
      const states = options.delayed ? (['waiting', 'prioritized', 'delayed'] as const) : (['waiting', 'prioritized'] as const);
      for (const job of await queues.work.getJobs([...states], 0, -1, true)) {
        await workers.runWork(job.name as keyof WorkJobs, job.data as WorkJobData);
        await job.remove();
      }
      return published;
    },
    async close() {
      await app.close();
      await Promise.allSettled([admin.end(), appPool.end()]);
      const keys = await redis.keys(`${prefix}:*`);
      if (keys.length > 0) await redis.del(...keys);
      await redis.quit();
      const dropper = new pg.Client({ connectionString: adminUrl() });
      await dropper.connect();
      await dropper.query(`drop database if exists ${database} with (force)`);
      await dropper.end();
    },
  };
}

export interface Peer {
  readonly app: NestExpressApplication;
  readonly baseUrl: string;
  close(): Promise<void>;
}

/**
 * Another node of the same deployment: same database, same Redis prefix, same signing key, its
 * own process role (a second WebSocket node, a REST node without sockets …).
 */
export async function createPeer(t: TestApp, overrides: Record<string, string>): Promise<Peer> {
  const env = envSchema.parse({ ...t.settings, ...overrides });
  const app = await createApp(env, { logDestination: new Writable({ write: (_chunk, _encoding, done) => done() }) });
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  const baseUrl = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '';
  let closed = false;
  return {
    app,
    baseUrl,
    async close() {
      if (closed) return;
      closed = true;
      await app.close();
    },
  };
}

/* ------------------------------------------------------------------ flows */

function cookieHeader(setCookie: string[] | string | undefined): { cookies: string; csrf: string } {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const pairs = list.map((cookie) => cookie.split(';')[0] ?? '').filter((pair) => pair.includes('=') && !pair.endsWith('='));
  const csrf = pairs.find((pair) => pair.includes('taskin_csrf='))?.split('=')[1] ?? '';
  return { cookies: pairs.join('; '), csrf };
}

/** A documentation-range IPv4 address (RFC 5737), different for every simulated client. */
export function randomIp(): string {
  const bytes = randomBytes(2);
  return `198.18.${bytes[0]}.${bytes[1]}`;
}

/**
 * Requests a code the way a fresh client would: its own IP, and past the per-number resend
 * cooldown (the limits themselves are exercised by the auth suite).
 */
export async function requestOtp(t: TestApp, phone: string): Promise<OtpChallenge> {
  await t.redis.del(`${t.env.REDIS_PREFIX}:otp:send:phone:${phone}:cooldown`, `${t.env.REDIS_PREFIX}:otp:send:phone:${phone}:hour`);
  const response = await t.http().set('X-Forwarded-For', randomIp()).post('/api/v1/auth/otp/request').send({ phone: localForm(phone) });
  if (response.status !== 200) throw new Error(`otp/request ${response.status}: ${JSON.stringify(response.body)}`);
  return response.body as OtpChallenge;
}

export function lastCode(t: TestApp, phone: string): string {
  const code = t.sms.lastTo(phone)?.tokens.code;
  if (!code) throw new Error(`no OTP was sent to ${phone}`);
  return code;
}

/** Signs in with an SMS code, creating the account (named `fullName`) on first use. */
export async function signIn(t: TestApp, phone = randomPhone(), fullName = 'کاربر آزمایشی'): Promise<Session> {
  const challenge = await requestOtp(t, phone);
  const client = t.http().set('X-Forwarded-For', randomIp());
  const verify = await client.post('/api/v1/auth/otp/verify').send({ challengeId: challenge.challengeId, code: lastCode(t, phone) });
  if (verify.status !== 200) throw new Error(`otp/verify ${verify.status}: ${JSON.stringify(verify.body)}`);
  const result = verify.body as OtpVerifyResult;
  let session: AuthSession;
  let setCookie = verify.headers['set-cookie'];
  if (result.status === 'signed_in') {
    session = result.session;
  } else {
    const signup = await client.post('/api/v1/auth/signup').send({ signupToken: result.signupToken, fullName });
    if (signup.status !== 201) throw new Error(`signup ${signup.status}: ${JSON.stringify(signup.body)}`);
    session = signup.body as AuthSession;
    setCookie = signup.headers['set-cookie'];
  }
  return { userId: session.user.id, phone, accessToken: session.accessToken, sessionId: session.sessionId, ...cookieHeader(setCookie) };
}

export function refreshCookies(session: Session, setCookie: string[] | string | undefined): void {
  const next = cookieHeader(setCookie);
  if (next.cookies) {
    session.cookies = next.cookies;
    session.csrf = next.csrf;
  }
}

export const bearer = (session: Session) => ({ Authorization: `Bearer ${session.accessToken}` });

export const STRONG_PASSWORD = 'Rahnama-1405!';

/** Sets the admin password (allowed right after an OTP sign-in) and steps up; returns the stepped-up session. */
export async function withAdminPassword(t: TestApp, session: Session, password = STRONG_PASSWORD): Promise<Session> {
  const set = await t.http().post('/api/v1/auth/password').set(bearer(session)).send({ newPassword: password });
  if (set.status !== 204) throw new Error(`password ${set.status}: ${JSON.stringify(set.body)}`);
  return stepUp(t, session, password);
}

export async function stepUp(t: TestApp, session: Session, password = STRONG_PASSWORD): Promise<Session> {
  const response = await t.http().post('/api/v1/auth/step-up').set(bearer(session)).send({ password });
  if (response.status !== 200) throw new Error(`step-up ${response.status}: ${JSON.stringify(response.body)}`);
  return { ...session, accessToken: (response.body as AuthSession).accessToken };
}

let keySeq = 0;
export const idempotencyKey = () => `test-${Date.now().toString(36)}-${(keySeq += 1)}-${randomBytes(3).toString('hex')}`;

/** A signed-in owner (with admin password, stepped up) and their new workspace. */
export async function ownerWithWorkspace(t: TestApp, name = 'هلدینگ راهنما'): Promise<{ owner: Session; workspace: WorkspaceView }> {
  const owner = await withAdminPassword(t, await signIn(t, randomPhone(), 'مالک فضای کاری'));
  const response = await t.http().post('/api/v1/workspaces').set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ name });
  if (response.status !== 201) throw new Error(`create workspace ${response.status}: ${JSON.stringify(response.body)}`);
  return { owner, workspace: response.body as WorkspaceView };
}

/** Invites `phone` by SMS as `role` and accepts with a fresh session for that number. */
export async function addMember(
  t: TestApp,
  owner: Session,
  workspaceId: string,
  role: 'admin' | 'manager' | 'member' | 'guest',
  options: { phone?: string; withPassword?: boolean } = {},
): Promise<Session> {
  const phone = options.phone ?? randomPhone();
  let member = await signIn(t, phone, `عضو ${role}`);
  if (options.withPassword || role === 'admin') member = await withAdminPassword(t, member);
  // Admins can only be invited by the owner; invite as member and promote when needed.
  const inviteRole = role === 'admin' ? 'member' : role;
  const invite = await t
    .http()
    .post(`/api/v1/workspaces/${workspaceId}/invitations`)
    .set(bearer(owner))
    .set('Idempotency-Key', idempotencyKey())
    .send({ recipients: [{ address: localForm(phone) }], role: inviteRole });
  if (invite.status !== 201) throw new Error(`invite ${invite.status}: ${JSON.stringify(invite.body)}`);
  await t.flushNotifications();
  const link = t.sms.lastTo(phone)?.tokens.link;
  const token = link ? new URL(link).searchParams.get('token') : null;
  if (!token) throw new Error('no invitation link was sent');
  const accept = await t.http().post('/api/v1/invitations/accept').set(bearer(member)).send({ token });
  if (accept.status !== 200) throw new Error(`accept ${accept.status}: ${JSON.stringify(accept.body)}`);
  if (role === 'admin') {
    const promote = await t.http().patch(`/api/v1/workspaces/${workspaceId}/members/${member.userId}`).set(bearer(owner)).send({ role: 'admin' });
    if (promote.status !== 200) throw new Error(`promote ${promote.status}: ${JSON.stringify(promote.body)}`);
  }
  return member;
}

/** Reads `X-Sql-Count` and checks it against a budget. */
export function sqlCount(response: { headers: Record<string, string> }): number {
  return Number(response.headers['x-sql-count'] ?? Number.NaN);
}

/** Invites `addresses` (as typed) into the workspace; returns the API result. */
export async function invite(
  t: TestApp,
  actor: Session,
  workspaceId: string,
  addresses: readonly string[],
  role: 'admin' | 'manager' | 'member' | 'guest' = 'member',
): Promise<CreateInvitationsResult> {
  const response = await t
    .http()
    .post(`/api/v1/workspaces/${workspaceId}/invitations`)
    .set(bearer(actor))
    .set('Idempotency-Key', idempotencyKey())
    .send({ recipients: addresses.map((address) => ({ address })), role });
  if (response.status !== 201) throw new Error(`invite ${response.status}: ${JSON.stringify(response.body)}`);
  return response.body as CreateInvitationsResult;
}

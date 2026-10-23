// Local verification fixture only. All accounts/data are synthetic and isolated by database/prefix.
import pg from 'pg';
import { Redis } from 'ioredis';
import { createServer } from 'node:http';
import { createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import next from 'next';
import { runMigrations } from '../apps/api/dist/platform/db/migrate.js';
import { createApp } from '../apps/api/dist/bootstrap.js';
import { envSchema } from '../apps/api/dist/config/env.js';
import { SmsService } from '../apps/api/dist/platform/sms/sms.js';
import { check, eventually, finish, launch, watchConsole } from '../apps/web/e2e/lib/harness.mjs';
import { verifyProjectCreation } from '../apps/web/e2e/live/project-creation.mjs';

const run = randomBytes(5).toString('hex');
const database = `taskdoon_phase2_live_${run}`;
const prefix = `phase2_${run}`;
const origin = 'http://localhost:3200';
const apiOrigin = 'http://127.0.0.1:4001';
const dbUrl = role => `postgres://${role}:${role}@127.0.0.1:5432/${database}`;
const admin = new pg.Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:5432/postgres' });
const log = createWriteStream(new URL('phase2-live-api.log', import.meta.url));
let created = false, app, web, httpServer, browser;
const tsconfigPath = new URL('../apps/web/tsconfig.json', import.meta.url);
const originalTsconfig = await readFile(tsconfigPath, 'utf8');
const originalNextEnv = await readFile(new URL('../apps/web/next-env.d.ts', import.meta.url), 'utf8');
await admin.connect();
try {
  await admin.query(`create database ${database} owner taskin_migrator`); created = true;
  await admin.query(`revoke all on database ${database} from public`);
  await admin.query(`grant connect, temporary on database ${database} to taskin_app`);
  await admin.query(`grant connect on database ${database} to taskin_platform_admin`);
  await runMigrations(dbUrl('taskin_migrator'));
  const { privateKey } = generateKeyPairSync('ed25519');
  app = await createApp(envSchema.parse({
    NODE_ENV: 'test', APP_ROLE: 'all', LOG_LEVEL: 'info', PORT: '4001',
    DATABASE_URL: dbUrl('taskin_app'), DATABASE_DIRECT_URL: dbUrl('taskin_app'),
    DATABASE_MIGRATOR_URL: dbUrl('taskin_migrator'), DATABASE_PLATFORM_ADMIN_URL: dbUrl('taskin_platform_admin'),
    REDIS_CORE_URL: 'redis://127.0.0.1:6379', REDIS_RT_URL: 'redis://127.0.0.1:6380', REDIS_PREFIX: prefix,
    PUBLIC_WEB_ORIGIN: origin, COOKIE_SECURE: 'false', TRUST_PROXY: '1',
    OTP_PEPPER: randomBytes(32).toString('hex'), APP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    JWT_PRIVATE_JWKS: JSON.stringify([{ ...privateKey.export({ format: 'jwk' }), kid: `phase2-${run}` }]),
    SMS_PROVIDERS: 'console', SMTP_URL: 'memory://', OUTBOX_RELAY_ENABLED: 'true', QUEUE_WORKERS_ENABLED: 'true',
    S3_ENDPOINT: 'http://127.0.0.1:8333', S3_BUCKET: 'taskin-files', S3_ACCESS_KEY: 'taskin', S3_SECRET_KEY: 'taskin-dev-secret',
  }), { logDestination: log });
  await app.listen(4001, '127.0.0.1');
  const sms = app.get(SmsService).console;
  const call = async (path, body, token, key) => {
    const response = await fetch(`${apiOrigin}/api/v1${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(key ? { 'idempotency-key': key } : {}) },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
    return { data: response.status === 204 ? null : await response.json(), cookies: response.headers.getSetCookie() };
  };
  const signUp = async name => {
    const phone = `+98912${String(randomBytes(4).readUInt32BE() % 10000000).padStart(7, '0')}`;
    const challenge = await call('/auth/otp/request', { phone });
    const verified = await call('/auth/otp/verify', { challengeId: challenge.data.challengeId, code: sms.lastTo(phone).tokens.code });
    const signed = await call('/auth/signup', { signupToken: verified.data.signupToken, fullName: name });
    return { ...signed, phone, token: signed.data.accessToken };
  };
  const owner = await signUp('مالک آزمون پروژه');
  const guestName = 'عضو آزمون پروژه';
  const guest = await signUp(guestName);
  const password = 'Project-Phase2-Test-2026!';
  await call('/auth/password', { newPassword: password }, owner.token);
  owner.token = (await call('/auth/step-up', { password }, owner.token)).data.accessToken;
  const workspace = (await call('/workspaces', { name: `پروژه مرحله دوم ${run}` }, owner.token, randomUUID())).data;
  await call(`/workspaces/${workspace.id}/invitations`, { recipients: [{ address: guest.phone }], role: 'member' }, owner.token, randomUUID());
  if (!await eventually(() => Boolean(sms.lastTo(guest.phone)?.tokens.link), 15000)) throw new Error('Invitation was not delivered by the local test worker.');
  await call('/invitations/accept', { token: new URL(sms.lastTo(guest.phone).tokens.link).searchParams.get('token') }, guest.token);

  process.env.NODE_ENV = 'development';
  process.env.NEXT_PUBLIC_DATA_SOURCE = 'api';
  process.env.TASKIN_API_ORIGIN = apiOrigin;
  process.chdir(fileURLToPath(new URL('../apps/web/', import.meta.url)));
  web = next({ dev: true, dir: fileURLToPath(new URL('../apps/web/', import.meta.url)), hostname: 'localhost', port: 3200 });
  await web.prepare();
  httpServer = createServer(web.getRequestHandler());
  httpServer.on('upgrade', web.getUpgradeHandler());
  await new Promise(resolve => httpServer.listen(3200, '127.0.0.1', resolve));
  browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies(owner.cookies.map(header => {
    const [pair, ...attributes] = header.split(';');
    const split = pair.indexOf('=');
    const path = attributes.find(value => value.trim().toLowerCase().startsWith('path='))?.trim().slice(5) ?? '/';
    return { name: pair.slice(0, split), value: pair.slice(split + 1), domain: 'localhost', path,
      httpOnly: attributes.some(value => value.trim().toLowerCase() === 'httponly'), secure: false, sameSite: 'Strict' };
  }));
  const page = await context.newPage(); watchConsole(page);
  await page.goto(origin + '/tasks', { waitUntil: 'networkidle' });
  await verifyProjectCreation(page, { projectName: 'پروژه آزمون واقعی', guestName, runId: run });
  const verification = new pg.Client({ connectionString: dbUrl('taskin_migrator') });
  await verification.connect();
  try {
    const stored = await verification.query(`select count(distinct pd.department_id)::int as departments, count(distinct pm.user_id)::int as members
      from projects p join project_departments pd on pd.project_id = p.id join project_members pm on pm.project_id = p.id
      where p.name = $1`, ['پروژه آزمون واقعی']);
    check(stored.rows[0].departments === 3 && stored.rows[0].members === 2, 'direct database inspection confirms three departments and two project members');
  } finally { await verification.end(); }
} catch (error) {
  process.exitCode = 1;
  check(false, `live project verification stopped: ${error.message}`);
} finally {
  if (browser) await finish(browser);
  if (httpServer) { httpServer.closeAllConnections(); await new Promise(resolve => httpServer.close(resolve)); }
  if (web) await web.close();
  if (app) await app.close();
  for (const url of ['redis://127.0.0.1:6379', 'redis://127.0.0.1:6380']) {
    const redis = new Redis(url);
    let cursor = '0';
    do { const scanned = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 200); cursor = scanned[0]; if (scanned[1].length) await redis.unlink(...scanned[1]); } while (cursor !== '0');
    await redis.quit();
  }
  if (created) await admin.query(`drop database ${database} with (force)`);
  await admin.end(); log.end();
  // Next may add its temporary dist types; restore only that known generated include.
  const current = await readFile(tsconfigPath, 'utf8');
  if (current !== originalTsconfig && current.includes('phase2-live-next')) await writeFile(tsconfigPath, originalTsconfig);
  const envPath = new URL('../apps/web/next-env.d.ts', import.meta.url);
  if ((await readFile(envPath, 'utf8')).includes('phase2-live-next')) await writeFile(envPath, originalNextEnv);
}
process.exit(process.exitCode ?? 0);

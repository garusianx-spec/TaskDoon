/**
 * Local Phase 4 verification only. Starts an already built API against an already
 * provisioned phase4_live_* database. It never creates or migrates a database.
 * Supply DATABASE_URL, DATABASE_MIGRATOR_URL and DATABASE_PLATFORM_ADMIN_URL.
 * The launcher stays running so the calling terminal can track its lifecycle.
 */
import { spawn } from 'node:child_process';
import { createPrivateKey } from 'node:crypto';
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repo = resolve(process.argv[2] ?? 'C:/Users/garus/OneDrive/Desktop/taskin');
const log = resolve(process.argv[3] ?? join(scriptDir, 'phase4-live-api.log'));
const errorLog = `${log}.stderr`;
const statePath = resolve(process.argv[4] ?? `${log}.state.json`);
const apiDir = join(repo, 'apps', 'api');
const port = 4000;
let child;
let stdoutFd;
let stderrFd;
let database;
let prefix;
let stopped = false;

function requireFile(path) {
  if (!existsSync(path)) throw new Error(`Missing built API file: ${path}`);
}
function validateDatabase(name, role) {
  if (!process.env[name]) throw new Error(`${name} must target the isolated live database.`);
  let url;
  try { url = new URL(process.env[name]); } catch { throw new Error(`${name} is not a valid URL.`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error(`${name} must be a PostgreSQL URL.`);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error(`${name} must use a local host.`);
  if (decodeURIComponent(url.username) !== role) throw new Error(`${name} must use ${role}.`);
  const db = decodeURIComponent(url.pathname.slice(1));
  if (!/^phase4_live_[a-z0-9_]+$/.test(db)) throw new Error(`${name} must use a phase4_live_* database.`);
  if (database && db !== database) throw new Error('All database URLs must target the same isolated live database.');
  database = db;
  return url.toString();
}
function validateLocalService(name, value) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} is not a valid URL.`); }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error(`${name} must use a local host.`);
  return url.toString();
}
async function assertFreePort() {
  const server = createServer();
  await new Promise((resolvePort, rejectPort) => {
    server.once('error', () => rejectPort(new Error(`Port ${port} is occupied; refusing to start another API.`)));
    server.listen(port, '0.0.0.0', () => server.close(resolvePort));
  });
}
function saveState(ready, exitCode = null) {
  writeFileSync(statePath, `${JSON.stringify({
    launcherPid: process.pid, apiPid: child?.pid ?? null, database, redisPrefix: prefix,
    port, ready, exitCode, apiLog: log, errorLog,
  }, null, 2)}\n`);
}
function stopOwnedProcess() {
  if (stopped) return;
  stopped = true;
  if (child?.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
}
process.once('SIGINT', stopOwnedProcess);
process.once('SIGTERM', stopOwnedProcess);

try {
  for (const file of ['main.js', 'instrument.js', 'config/env.js', 'cli/platform-admin.js']) requireFile(join(apiDir, 'dist', file));
  const appUrl = validateDatabase('DATABASE_URL', 'taskin_app');
  const migratorUrl = validateDatabase('DATABASE_MIGRATOR_URL', 'taskin_migrator');
  const adminUrl = validateDatabase('DATABASE_PLATFORM_ADMIN_URL', 'taskin_platform_admin');
  prefix = process.env.REDIS_PREFIX ?? database;
  if (!/^[a-z0-9][a-z0-9:_-]{0,40}$/.test(prefix) || !prefix.startsWith('phase4_live_')) throw new Error('REDIS_PREFIX must be a unique phase4_live_* value of at most 41 characters.');
  // Deliberately public test material. Never use this helper for a production database.
  const seed = Buffer.alloc(32, 0x4f);
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  const settings = {
    ...process.env,
    NODE_ENV: 'test', APP_ROLE: 'all', PORT: String(port),
    LOG_LEVEL: 'info', LOG_PRETTY: 'false', TRUST_PROXY: '1',
    DATABASE_URL: appUrl, DATABASE_DIRECT_URL: appUrl,
    DATABASE_MIGRATOR_URL: migratorUrl, DATABASE_PLATFORM_ADMIN_URL: adminUrl,
    DATABASE_POOL_MAX: '10',
    REDIS_CORE_URL: validateLocalService('REDIS_CORE_URL', process.env.REDIS_CORE_URL ?? 'redis://127.0.0.1:16379'),
    REDIS_RT_URL: validateLocalService('REDIS_RT_URL', process.env.REDIS_RT_URL ?? 'redis://127.0.0.1:16380'),
    REDIS_PREFIX: prefix, RT_ADAPTER: 'redis',
    PUBLIC_WEB_ORIGIN: 'http://localhost:3000', CORS_ORIGINS: 'http://localhost:3000,http://localhost:3100', COOKIE_SECURE: 'false',
    S3_ENDPOINT: validateLocalService('S3_ENDPOINT', process.env.S3_ENDPOINT ?? 'http://127.0.0.1:8333'),
    S3_PUBLIC_ENDPOINT: validateLocalService('S3_PUBLIC_ENDPOINT', process.env.S3_PUBLIC_ENDPOINT ?? 'http://localhost:8333'),
    S3_BUCKET: process.env.S3_BUCKET ?? 'taskin-files', S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? 'taskin',
    S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? 'taskin-dev-secret', S3_FORCE_PATH_STYLE: 'true',
    OTP_PEPPER: 'integration-test-pepper-integration-test', APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    JWT_PRIVATE_JWKS: JSON.stringify([{ ...privateKey.export({ format: 'jwk' }), kid: 'phase4-local-live-only' }]),
    SMS_PROVIDERS: 'console', SMTP_URL: 'memory://',
    OUTBOX_RELAY_ENABLED: 'true', QUEUE_WORKERS_ENABLED: 'true',
  };
  for (const key of Object.keys(settings)) if (key.startsWith('OTEL_EXPORTER_')) delete settings[key];
  const { loadEnv } = await import(pathToFileURL(join(apiDir, 'dist', 'config', 'env.js')).href);
  loadEnv(settings);
  await assertFreePort();
  mkdirSync(dirname(log), { recursive: true });
  mkdirSync(dirname(statePath), { recursive: true });
  stdoutFd = openSync(log, 'a');
  stderrFd = openSync(errorLog, 'a');
  child = spawn(process.execPath, ['--enable-source-maps', '--import', './dist/instrument.js', 'dist/main.js'], {
    cwd: apiDir, env: settings, stdio: ['ignore', stdoutFd, stderrFd], windowsHide: true,
  });
  child.once('error', () => { console.error('API process failed to spawn; inspect the local stderr log.'); process.exitCode = 1; });
  child.once('exit', (code, signal) => {
    saveState(false, code ?? (signal ? 1 : 0));
    if (stdoutFd !== undefined) closeSync(stdoutFd);
    if (stderrFd !== undefined) closeSync(stderrFd);
    console.log(JSON.stringify({ apiStopped: true, apiPid: child.pid, exitCode: code, signal }));
    if (!stopped && code !== 0) process.exitCode = 1;
  });
  saveState(false);
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline && child.exitCode === null && child.signalCode === null) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health/ready`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Wait until the API and backing-service probes are ready. */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  if (!ready) throw new Error('API readiness failed within 60 seconds; inspect the local logs.');
  saveState(true);
  console.log(JSON.stringify({ apiReady: true, apiPid: child.pid, port, statePath }));
} catch (error) {
  stopOwnedProcess();
  // Do not print URL credentials, environment objects, JSON logs, or OTPs.
  const message = error instanceof Error ? error.message.replace(/(?:postgres(?:ql)?|redis|https?):\/\/\S+/gi, '[service URL]') : 'API launcher failed.';
  console.error(message);
  process.exitCode = 1;
}

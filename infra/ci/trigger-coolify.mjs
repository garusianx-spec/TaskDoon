import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const INVALID_CONFIGURATION = 'Invalid Coolify deployment configuration.';
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** Secrets are validated before constructing curl's in-memory configuration. */
export function validateConfiguration(env) {
  const url = env.COOLIFY_WEBHOOK_URL;
  const token = env.COOLIFY_API_TOKEN;
  if (
    typeof url !== 'string' ||
    typeof token !== 'string' ||
    !url.trim() ||
    !token.trim() ||
    url !== url.trim() ||
    CONTROL_CHARACTERS.test(url) ||
    CONTROL_CHARACTERS.test(token)
  ) {
    throw new Error(INVALID_CONFIGURATION);
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(INVALID_CONFIGURATION);
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    /^https:\/\/[^/?#\\]*@/i.test(url) ||
    parsed.hash ||
    url.includes('#')
  ) {
    throw new Error(INVALID_CONFIGURATION);
  }
  return { url: parsed.href, token };
}

function quoteConfig(value) {
  return '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
}

/**
 * Coolify offers no documented idempotency key. A transient retry can enqueue
 * another deployment after an ambiguous response; acceptance is not health.
 */
export function triggerCoolify({ env = process.env, spawn = spawnSync } = {}) {
  let credentials;
  try {
    credentials = validateConfiguration(env);
  } catch {
    return { ok: false, reason: 'configuration' };
  }

  const config =
    'url = ' + quoteConfig(credentials.url) + '\n' +
    'header = ' + quoteConfig('Authorization: Bearer ' + credentials.token) + '\n';
  const childEnv = { ...process.env };
  delete childEnv.COOLIFY_WEBHOOK_URL;
  delete childEnv.COOLIFY_API_TOKEN;

  let result;
  try {
    result = spawn('curl', [
      '--disable', // Must be first: ignore any inherited .curlrc.
      '--config', '-',
      '--silent',
      '--fail',
      '--globoff',
      '--request', 'POST',
      '--proto', '=https',
      '--proto-redir', '=https',
      '--tlsv1.2',
      '--no-location',
      '--no-netrc',
      '--connect-timeout', '10',
      '--max-time', '30',
      '--retry', '3',
      '--retry-connrefused',
      '--retry-max-time', '120',
      '--output', '/dev/null',
      '--write-out', '%{http_code}',
    ], {
      input: config,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      env: childEnv,
      shell: false,
      // The final transfer can overrun curl's retry timer by at most 30s.
      timeout: 155_000,
      killSignal: 'SIGKILL',
      maxBuffer: 1024,
    });
  } catch {
    return { ok: false, reason: 'transport' };
  }

  if (!result || result.error || result.signal || result.status !== 0) {
    return { ok: false, reason: 'transport' };
  }
  const code = typeof result.stdout === 'string' ? result.stdout.trim() : '';
  if (!/^2\d{2}$/.test(code)) {
    return { ok: false, reason: 'http' };
  }
  return { ok: true, httpStatus: Number(code) };
}

/** The CLI prints allowlisted fields only, never curl diagnostics or payloads. */
export function main({ env = process.env, spawn = spawnSync, log = console.log } = {}) {
  const result = triggerCoolify({ env, spawn });
  if (!result.ok) {
    log(JSON.stringify({ event: 'coolify.deployment.failed', reason: result.reason }));
    return 1;
  }
  log(JSON.stringify({
    event: 'coolify.deployment.accepted',
    httpStatus: result.httpStatus,
    message: 'Webhook accepted; verify deployment health in Coolify.',
  }));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}

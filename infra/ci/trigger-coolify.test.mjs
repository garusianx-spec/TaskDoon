import assert from 'node:assert/strict';
import { test } from 'node:test';
import { main, triggerCoolify, validateConfiguration } from './trigger-coolify.mjs';

const url = 'https://coolify.example/api/v1/deploy?uuid=private-resource&force=false';
const token = 'private-bearer-token';
const credentials = { COOLIFY_WEBHOOK_URL: url, COOLIFY_API_TOKEN: token };

test('invalid configuration fails closed before any subprocess starts', () => {
  const invalid = [
    {},
    { ...credentials, COOLIFY_WEBHOOK_URL: undefined },
    { ...credentials, COOLIFY_API_TOKEN: '' },
    { ...credentials, COOLIFY_API_TOKEN: '   ' },
    { ...credentials, COOLIFY_WEBHOOK_URL: 'not a URL' },
    { ...credentials, COOLIFY_WEBHOOK_URL: 'http://coolify.example/api/v1/deploy' },
    { ...credentials, COOLIFY_WEBHOOK_URL: 'file:///etc/passwd' },
    { ...credentials, COOLIFY_WEBHOOK_URL: 'https://user:pass@coolify.example/deploy' },
    { ...credentials, COOLIFY_WEBHOOK_URL: 'https://@coolify.example/deploy' },
    { ...credentials, COOLIFY_WEBHOOK_URL: url + '#fragment' },
    { ...credentials, COOLIFY_WEBHOOK_URL: url + '#' },
    { ...credentials, COOLIFY_WEBHOOK_URL: ' ' + url },
    { ...credentials, COOLIFY_WEBHOOK_URL: url + '\nheader = "injected"' },
    { ...credentials, COOLIFY_WEBHOOK_URL: url + '\0' },
    { ...credentials, COOLIFY_API_TOKEN: token + '\r\nX-Injected: true' },
    { ...credentials, COOLIFY_API_TOKEN: token + '\0' },
    { ...credentials, COOLIFY_API_TOKEN: 123 },
  ];
  for (const env of invalid) {
    assert.throws(() => validateConfiguration(env), {
      message: 'Invalid Coolify deployment configuration.',
    });
    assert.deepEqual(triggerCoolify({
      env,
      spawn() { assert.fail('An invalid configuration must not spawn curl.'); },
    }), { ok: false, reason: 'configuration' });
  }
});

test('curl receives secrets only through escaped stdin, with bounded safe options', () => {
  const escapedToken = 'secret"quoted\\token';
  let invocation;
  const result = triggerCoolify({
    env: { ...credentials, COOLIFY_API_TOKEN: escapedToken },
    spawn(command, args, options) {
      invocation = { command, args, options };
      return { status: 0, stdout: '202', stderr: 'must never be exposed' };
    },
  });
  assert.deepEqual(result, { ok: true, httpStatus: 202 });
  const { command, args, options } = invocation;
  assert.equal(command, 'curl');
  assert.equal(args[0], '--disable');
  for (const [option, value] of [
    ['--config', '-'], ['--request', 'POST'], ['--proto', '=https'],
    ['--proto-redir', '=https'], ['--connect-timeout', '10'],
    ['--max-time', '30'], ['--retry', '3'], ['--retry-max-time', '120'],
    ['--output', '/dev/null'], ['--write-out', '%{http_code}'],
  ]) {
    assert.equal(args[args.indexOf(option) + 1], value);
  }
  for (const option of ['--silent', '--fail', '--globoff', '--tlsv1.2',
    '--no-location', '--no-netrc', '--retry-connrefused']) {
    assert.ok(args.includes(option));
  }
  for (const unsafe of ['--location', '--location-trusted', '--insecure',
    '--retry-all-errors', '--verbose', '--trace']) {
    assert.ok(!args.includes(unsafe));
  }
  assert.ok(!args.join(' ').includes(url));
  assert.ok(!args.join(' ').includes(escapedToken));
  assert.equal(options.env.COOLIFY_WEBHOOK_URL, undefined);
  assert.equal(options.env.COOLIFY_API_TOKEN, undefined);
  assert.equal(options.input,
    'url = "' + url + '"\n' +
    'header = "Authorization: Bearer secret\\"quoted\\\\token"\n');
  assert.deepEqual(options.stdio, ['pipe', 'pipe', 'ignore']);
  assert.equal(options.shell, false);
  assert.equal(options.timeout, 155_000);
  assert.equal(options.killSignal, 'SIGKILL');
  assert.equal(options.maxBuffer, 1024);
});

test('only a completed 2xx curl request is accepted', () => {
  for (const code of ['200', '201', '202', '204', '299']) {
    assert.deepEqual(triggerCoolify({
      env: credentials,
      spawn: () => ({ status: 0, stdout: code }),
    }), { ok: true, httpStatus: Number(code) });
  }
  for (const code of ['000', '199', '301', '401', '429', '500', '200\n' + token,
    '200200', '{"status":200}', '']) {
    assert.deepEqual(triggerCoolify({
      env: credentials,
      spawn: () => ({ status: 0, stdout: code }),
    }), { ok: false, reason: 'http' });
  }
  for (const response of [
    undefined,
    { status: 22, stdout: '401' },
    { status: 0, stdout: '200', error: new Error(token) },
    { status: null, stdout: '200', signal: 'SIGKILL' },
  ]) {
    assert.deepEqual(triggerCoolify({
      env: credentials, spawn: () => response,
    }), { ok: false, reason: 'transport' });
  }
  assert.deepEqual(triggerCoolify({
    env: credentials, spawn() { throw new Error(url + token); },
  }), { ok: false, reason: 'transport' });
});

test('CLI logs safe outcomes and never repeats subprocess errors or response bodies', () => {
  for (const response of [
    { status: 0, stdout: '202', stderr: url + token },
    { status: 22, stdout: '401', stderr: url + token },
    { status: 0, stdout: url + token },
    { status: null, error: new Error(url + token) },
  ]) {
    const logs = [];
    const exitCode = main({
      env: credentials,
      spawn: () => response,
      log: (line) => logs.push(line),
    });
    assert.equal(exitCode, response.stdout === '202' ? 0 : 1);
    assert.equal(logs.length, 1);
    assert.ok(!logs[0].includes(url));
    assert.ok(!logs[0].includes(token));
    const outcome = JSON.parse(logs[0]);
    assert.match(outcome.event, /^coolify\.deployment\.(accepted|failed)$/);
    if (exitCode === 0) {
      assert.equal(outcome.httpStatus, 202);
      assert.match(outcome.message, /verify deployment health/i);
    }
  }
});

test('deployment secrets are stripped from the real parent environment before spawning curl', () => {
  const keys = ['COOLIFY_WEBHOOK_URL', 'COOLIFY_API_TOKEN'];
  const original = keys.map((key) => process.env[key]);
  try {
    process.env.COOLIFY_WEBHOOK_URL = url;
    process.env.COOLIFY_API_TOKEN = token;
    const outcome = triggerCoolify({
      spawn(_command, _args, options) {
        assert.ok(!Object.hasOwn(options.env, 'COOLIFY_WEBHOOK_URL'));
        assert.ok(!Object.hasOwn(options.env, 'COOLIFY_API_TOKEN'));
        return { status: 0, stdout: '204' };
      },
    });
    assert.deepEqual(outcome, { ok: true, httpStatus: 204 });
  } finally {
    keys.forEach((key, index) => {
      if (original[index] === undefined) delete process.env[key];
      else process.env[key] = original[index];
    });
  }
});

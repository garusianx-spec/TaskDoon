import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

// Run the browser-independent source itself, without adding a test framework to the web app.
const source = readFileSync(new URL('../../src/lib/broadcasts.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext } }).outputText;
const { broadcastJitter, broadcastTimerDelay, broadcastDismissalKey, isBroadcastDismissed, dismissBroadcast } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const now = '2026-10-07T12:00:00.000Z';
const later = (ms) => new Date(Date.parse(now) + ms).toISOString();

test('visibility timer uses server-relative time with the complete delay clamped to 5s–1h', () => {
  assert.equal(broadcastTimerDelay(later(20_000), now, 0), 20_000);
  assert.equal(broadcastTimerDelay(later(-20_000), now, 0), 5_000);
  assert.equal(broadcastTimerDelay(later(1_000), now, 5_000), 6_000);
  assert.equal(broadcastTimerDelay(later(3_599_000), now, 5_000), 3_600_000);
  assert.equal(broadcastTimerDelay(later(7_200_000), now, 0), 3_600_000);
  assert.equal(broadcastTimerDelay(null, now, 5_000), 3_600_000);
  assert.equal(broadcastTimerDelay('invalid', now, 0), 3_600_000);
  assert.equal(broadcastTimerDelay(later(20_000), 'invalid', 0), 3_600_000);
});

test('refresh jitter stays within 0–5 seconds', () => {
  assert.equal(broadcastJitter(0), 0);
  assert.equal(broadcastJitter(0.5), 2_500);
  assert.equal(broadcastJitter(1), 5_000);
  assert.equal(broadcastJitter(-1), 0);
  assert.equal(broadcastJitter(2), 5_000);
  assert.equal(broadcastJitter(NaN), 0);
});

test('info/warning dismissals persist locally; critical dismissals remain in the session', () => {
  const stores = { local: new Map(), session: new Map() };
  const access = (kind) => ({ getItem: (key) => stores[kind].get(key) ?? null, setItem: (key, value) => stores[kind].set(key, value) });
  for (const level of ['info', 'warning', 'critical']) {
    const item = { id: level, level, updatedAt: now };
    assert.equal(isBroadcastDismissed(item, access), false);
    dismissBroadcast(item, access);
    assert.equal(isBroadcastDismissed(item, access), true);
    assert.equal(stores[level === 'critical' ? 'session' : 'local'].get(`${level}:${now}`), '1');
    assert.equal(stores[level === 'critical' ? 'local' : 'session'].has(`${level}:${now}`), false);
    assert.equal(isBroadcastDismissed({ ...item, updatedAt: later(1_000) }, access), false);
  }
  assert.equal(broadcastDismissalKey({ id: 'notice', updatedAt: now }), `notice:${now}`);
});

test('browser storage refusal does not throw or hide an undismissed notice', () => {
  const refused = () => { throw new Error('storage refused'); };
  const item = { id: 'notice', level: 'critical', updatedAt: now };
  assert.equal(isBroadcastDismissed(item, refused), false);
  assert.doesNotThrow(() => dismissBroadcast(item, refused));
});

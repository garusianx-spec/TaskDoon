import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
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

/** Exercise the actual client request boundary against the strict broadcast query contract. */
async function broadcastRequests() {
  const httpSource = readFileSync(new URL('../../src/api/http.ts', import.meta.url), 'utf8');
  const compiledHttp = ts.transpileModule(httpSource, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext } }).outputText;
  const httpUrl = 'data:text/javascript;base64,' + Buffer.from(compiledHttp).toString('base64');
  const apiSource = readFileSync(new URL('../../src/admin/api.ts', import.meta.url), 'utf8');
  const compiledApi = ts.transpileModule(apiSource, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext } }).outputText;
  const seam = /import \{ http, query \} from ['"]@\/api\/http['"];?/;
  assert.match(compiledApi, seam);
  const stubbed = compiledApi.replace(seam, 'import { query } from ' + JSON.stringify(httpUrl) + '; const http = { get: async (url) => url };');
  return (await import('data:text/javascript;base64,' + Buffer.from(stubbed).toString('base64'))).adminApi;
}

test('broadcast list sends current/all status and never sends includeArchived to the strict DTO', async () => {
  const api = await broadcastRequests();
  for (const [filters, status] of [[undefined, 'current'], [{ includeArchived: false }, 'current'], [{ includeArchived: true }, 'all']]) {
    const url = new URL(await api.broadcasts(filters), 'https://client.test');
    assert.equal(url.pathname, '/admin/broadcasts');
    assert.equal(url.searchParams.get('status'), status);
    assert.equal(url.searchParams.get('limit'), '50');
    assert.equal(url.searchParams.has('includeArchived'), false);
    assert.deepEqual([...url.searchParams.keys()].sort(), ['limit', 'status']);
  }
});

test('broadcast pagination preserves the cursor as one encoded query value', async () => {
  const api = await broadcastRequests();
  const cursor = 'cursor+/=?&status=all';
  const url = new URL(await api.broadcasts({ cursor }), 'https://client.test');
  assert.equal(url.searchParams.get('cursor'), cursor);
  assert.equal(url.searchParams.get('status'), 'current');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['cursor', 'limit', 'status']);
});

/** Render the actual page with deferred API replies and the loader's retained previous data.
 * Effects are deliberately held: filter/reload clicks must invalidate cursors before loading flips.
 */
function broadcastPageHarness() {
  const slots = [];
  let index = 0;
  let loader;
  let adminGeneration = 0;
  const requests = [];
  const responses = [];
  const load = { data: null, error: null, loading: false, reload: () => undefined };
  const element = (type, props) => ({ type, props });
  const modules = {
    react: {
      useState(initial) {
        const slot = index++;
        if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
        return [slots[slot], (next) => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; }];
      },
      useRef(initial) {
        const slot = index++;
        if (!(slot in slots)) slots[slot] = { current: initial };
        return slots[slot];
      },
      useEffect: () => undefined,
    },
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    '@taskin/jalali': { toPersianDigits: String },
    '@/admin/api': { adminApi: { broadcasts: async (filters) => {
      requests.push({ ...filters });
      assert.ok(responses.length > 0, 'every request needs a controlled reply');
      return responses.shift();
    } } },
    '@/admin/AdminSession': { useAdmin: () => ({ call: (operation) => operation(), generation: adminGeneration }) },
    '@/admin/format': { dateTimeLabel: String },
    '@/admin/use-admin-load': { useAdminLoad: (_key, nextLoader) => { loader = nextLoader; return load; } },
    '@/api/messages': { problemMessage: String },
    '@/components/admin/AdminUi': { Loaded: 'Loaded', Panel: 'Panel', TableFrame: 'TableFrame', TD: '', TH: '' },
    '@/components/admin/BroadcastDialog': { BroadcastDialog: 'BroadcastDialog' },
    '@/components/layout/BroadcastStrip': { BROADCAST_LEVEL_LABELS: { info: 'info', warning: 'warning', critical: 'critical' } },
    '@/components/ui': { Badge: 'Badge', Button: 'Button', Input: 'Input', Modal: 'Modal' },
    '@/components/icons': { AddIcon: 'AddIcon', RefreshIcon: 'RefreshIcon', SearchIcon: 'SearchIcon' },
  };
  const pageSource = readFileSync(new URL('../../src/app/(admin)/admin/broadcasts/page.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(pageSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const context = { exports: {}, require: (name) => {
    assert.ok(name in modules, `unexpected module: ${name}`);
    return modules[name];
  } };
  runInNewContext(compiled, context);
  const nodes = (node) => {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== 'object') return [];
    const children = node.type === 'Loaded' ? (load.data ? node.props.children(load.data) : null) : node.props.children;
    return [node, ...nodes(children)];
  };
  const render = () => { index = 0; return nodes(context.exports.default()); };
  return {
    load, requests, responses, render,
    async firstPage(reply) { responses.push(reply); load.data = await loader(); load.loading = false; },
    stepUp() { adminGeneration += 1; },
    pagination: (tree) => tree.find((node) => node.type === 'Button' && /نمایش بیشتر|همه اطلاعیه‌ها|در حال بازخوانی/.test(node.props.children)),
    filter: (tree) => tree.find((node) => node.type === 'input' && node.props.type === 'checkbox'),
    refresh: (tree) => tree.find((node) => node.type === 'Button' && node.props.children === 'بازخوانی'),
    rowMessages: (tree) => tree.filter((node) => node.type === 'p' && typeof node.props.children === 'string').map((node) => node.props.children),
  };
}

const listReply = (message, nextCursor) => ({ items: [{ id: message, message, level: 'info', isActive: true, startsAt: now, expiresAt: null, createdAt: now, createdByName: 'admin', archivedAt: null, updatedAt: now }], nextCursor });
const settlePage = () => new Promise((resolve) => setImmediate(resolve));

test('broadcast pagination rejects retained cursors before filter and refresh loading effects', async () => {
  const page = broadcastPageHarness();
  page.render();
  await page.firstPage(listReply('current-first', 'current-cursor'));
  let tree = page.render();
  const staleClick = page.pagination(tree).props.onClick;
  page.filter(tree).props.onChange({ target: { checked: true } });
  staleClick(); // A callback captured before the filter click must already be invalid.
  tree = page.render(); // The loader still retains old data and has not set loading yet.
  assert.equal(page.pagination(tree).props.disabled, true);
  page.pagination(tree).props.onClick();
  assert.equal(page.requests.length, 1);
  page.load.loading = true;
  tree = page.render();
  assert.equal(page.pagination(tree).props.disabled, true);
  await page.firstPage(listReply('all-first', 'all-cursor'));
  tree = page.render();
  assert.equal(page.pagination(tree).props.disabled, false);
  const beforeRefresh = page.pagination(tree).props.onClick;
  page.refresh(tree).props.onClick();
  beforeRefresh();
  tree = page.render();
  assert.equal(page.pagination(tree).props.disabled, true);
  page.pagination(tree).props.onClick();
  assert.equal(page.requests.length, 2);
  await page.firstPage(listReply('refreshed-first', 'fresh-cursor'));
  tree = page.render();
  page.responses.push(listReply('fresh-second', null));
  page.pagination(tree).props.onClick();
  await settlePage();
  assert.equal(page.requests.at(-1).cursor, 'fresh-cursor');
  assert.equal(page.requests.at(-1).includeArchived, true);
  assert.ok(page.rowMessages(page.render()).includes('fresh-second'));
});

test('broadcast pagination drops superseded replies and appends only to its original first page', async () => {
  const page = broadcastPageHarness();
  page.render();
  await page.firstPage(listReply('first', 'cursor-one'));
  let tree = page.render();
  let resolveOld;
  page.responses.push(new Promise((resolve) => { resolveOld = resolve; }));
  page.pagination(tree).props.onClick();
  page.refresh(tree).props.onClick();
  page.render();
  await page.firstPage(listReply('replacement', 'replacement-cursor'));
  resolveOld(listReply('superseded-second', null));
  await settlePage();
  tree = page.render();
  assert.ok(!page.rowMessages(tree).includes('superseded-second'));
  page.responses.push(listReply('replacement-second', 'replacement-next'));
  page.pagination(tree).props.onClick();
  await settlePage();
  assert.ok(page.rowMessages(page.render()).includes('replacement-second'));
  page.stepUp();
  tree = page.render(); // Admin generation changes before the loader's effect starts.
  assert.equal(page.pagination(tree).props.disabled, true);
  page.pagination(tree).props.onClick();
  assert.equal(page.requests.length, 4);
  await page.firstPage(listReply('after-step-up', 'after-step-up-cursor'));
  tree = page.render();
  assert.ok(!page.rowMessages(tree).includes('replacement-second'));
  page.responses.push(listReply('after-step-up-second', null));
  page.pagination(tree).props.onClick();
  await settlePage();
  assert.equal(page.requests.at(-1).cursor, 'after-step-up-cursor');
  assert.ok(page.rowMessages(page.render()).includes('after-step-up-second'));
});

#!/usr/bin/env node
/**
 * Runs the Playwright suites in `e2e/suites` one after another against a production build.
 *
 *   NEXT_PUBLIC_DATA_SOURCE=demo npm run build && npm run test:e2e   # starts `next start` on E2E_PORT (default 3100)
 *   BASE_URL=http://localhost:3000 npm run test:e2e  # against a server that is already running
 *   npm run test:e2e -- kanban theme               # only the named suites
 *
 * Chromium comes from `CHROMIUM_PATH` when set, otherwise from `npx playwright-core install chromium`.
 * Exits non-zero if any suite fails, crashes or logs console problems.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eDir = dirname(fileURLToPath(import.meta.url));
const appDir = join(e2eDir, '..');
const suitesDir = join(e2eDir, 'suites');
const port = Number(process.env.E2E_PORT ?? 3100);

const available = readdirSync(suitesDir)
  .filter((file) => file.endsWith('.mjs'))
  .map((file) => file.slice(0, -'.mjs'.length))
  .sort();
const requested = process.argv.slice(2);
const unknown = requested.filter((name) => !available.includes(name));
if (unknown.length > 0) {
  console.error(`Unknown suite(s): ${unknown.join(', ')}. Available: ${available.join(', ')}`);
  process.exit(2);
}
const suites = requested.length > 0 ? requested : available;

let server = null;
const stopServer = () => {
  if (server?.exitCode === null) process.kill(-server.pid, 'SIGTERM');
};
process.on('SIGINT', () => {
  stopServer();
  process.exit(130);
});

let baseUrl = process.env.BASE_URL;
if (!baseUrl) {
  if (!existsSync(join(appDir, '.next', 'BUILD_ID'))) {
    console.error('No production build in apps/web/.next. Run `npm run build` first, or set BASE_URL.');
    process.exit(2);
  }
  baseUrl = `http://localhost:${port}`;
  const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
  server = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd: appDir,
    detached: true, // own process group, so the whole server tree stops with it
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await waitForServer(baseUrl);
}

// These suites drive the demo fixtures; a live build shows the sign-in screen instead.
const source = /<html[^>]*\sdata-source="([a-z]+)"/.exec(await (await fetch(`${baseUrl}/feed`)).text())?.[1];
if (source !== 'demo') {
  stopServer();
  console.error(
    `The app at ${baseUrl} was built for the «${source ?? 'unknown'}» data source. These suites need the demo data: build with NEXT_PUBLIC_DATA_SOURCE=demo npm run build. The live app has its own suite: npm run test:e2e:live.`,
  );
  process.exit(2);
}

const results = [];
for (const suite of suites) {
  console.log(`\n━━ ${suite}`);
  results.push(await runSuite(suite));
}
stopServer();

console.log('\nSuite                           Passed  Failed  Exit  Time');
for (const { suite, passed, failed, code, seconds } of results) {
  console.log(
    `${suite.padEnd(32)}${String(passed).padStart(6)}${String(failed).padStart(8)}${String(code).padStart(6)}  ${seconds.toFixed(1)}s`,
  );
}
const totalPassed = results.reduce((sum, result) => sum + result.passed, 0);
const totalFailed = results.reduce((sum, result) => sum + result.failed, 0);
const broken = results.filter((result) => result.code !== 0).map((result) => result.suite);
console.log(`\n${totalPassed} checks passed, ${totalFailed} failed across ${results.length} suites.`);
if (broken.length > 0) {
  console.log(`Failing suites: ${broken.join(', ')}`);
  process.exit(1);
}

async function waitForServer(url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      console.error(`next start exited with code ${server.exitCode} (is port ${port} free?)`);
      process.exit(2);
    }
    try {
      const response = await fetch(`${url}/feed`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  stopServer();
  console.error(`Server at ${url} did not become ready within 60 s.`);
  process.exit(2);
}

function runSuite(suite) {
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(suitesDir, `${suite}.mjs`)], {
      cwd: appDir,
      env: { ...process.env, BASE_URL: baseUrl },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let passed = 0;
    let failed = 0;
    let pending = '';
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      const lines = (pending + chunk.toString()).split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('PASS')) passed += 1;
        else if (line.startsWith('FAIL')) failed += 1;
      }
    });
    child.on('close', (code) => {
      resolve({ suite, passed, failed, code: code ?? 1, seconds: (performance.now() - started) / 1000 });
    });
  });
}

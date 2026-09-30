/**
 * Shared plumbing for the Playwright suites. Each suite is a plain Node script that drives a
 * running production build (`BASE_URL`) and prints one PASS/FAIL line per check. It exits
 * non-zero when any check fails or a watched page logs a console error, warning or uncaught
 * exception, so a noisy page fails as loudly as a broken assertion.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright-core';

export { devices };

export const base = process.env.BASE_URL ?? 'http://localhost:3100';

/** Screenshots land here (git-ignored); suites write into it with `${out}/name.png`. */
export const out = fileURLToPath(new URL('../out', import.meta.url));
mkdirSync(out, { recursive: true });

let passed = 0;
let failed = 0;
const consoleProblems = [];

export function check(condition, message) {
  if (condition) passed += 1;
  else failed += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${message}`);
}

/**
 * Resolves true as soon as `probe()` returns something truthy, or false once `timeout` ms pass.
 *
 * Playwright actions wait for their target, but a bare read right after one (`count()`,
 * `textContent()`, `getAttribute()`, `evaluate()`) is a snapshot that can land before React has
 * committed the result on a slow runner. Checks on state that an action changes poll through
 * this instead. A probe that throws (say, an element detached mid-read) counts as "not yet".
 * Checks that something *stays* unchanged keep their snapshot: polling would pass them early.
 */
export async function eventually(probe, timeout = 5000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      if (await probe()) return true;
    } catch {
      // Not settled yet; try again.
    }
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** The waiting counterpart of `locator.isVisible()`: true once the element shows, false on timeout. */
export function visible(locator, timeout = 5000) {
  return locator.waitFor({ state: 'visible', timeout }).then(
    () => true,
    () => false,
  );
}

/**
 * Chromium from `CHROMIUM_PATH` when set (a preinstalled browser), else Playwright's own install.
 * It runs under a UTF-8 locale: on Linux, Chromium names a download after its (Persian)
 * `filename*` only when the locale can spell it, and CI containers often have none.
 */
export function launch(options = {}) {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    ...options,
    env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', ...options.env },
  });
}

export function watchConsole(page) {
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleProblems.push(`[${message.type()}] ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => consoleProblems.push(`[pageerror] ${error.message}`));
}

export async function finish(browser) {
  await browser.close();
  for (const problem of consoleProblems) console.log(`CONSOLE ${problem}`);
  console.log(`\n${passed} passed, ${failed} failed, ${consoleProblems.length} console problems`);
  process.exitCode = failed > 0 || consoleProblems.length > 0 ? 1 : 0;
}

/**
 * Refresh public product previews from the repository's synthetic demo, never a customer
 * workspace. Start an isolated NEXT_PUBLIC_DATA_SOURCE=demo build, then set BASE_URL.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL ?? 'http://localhost:3101';
const output = fileURLToPath(new URL('../public/marketing/', import.meta.url));
const response = await fetch(`${base}/feed`);
if (!response.ok || !/<html[^>]*\sdata-source="demo"/.test(await response.text())) {
  throw new Error('Marketing screenshots require an isolated synthetic demo build.');
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
    locale: 'fa-IR',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    localStorage.setItem('taskin.theme', JSON.stringify({ mode: 'light', accent: 'indigo' }));
  });
  const page = await context.newPage();

  async function capture(name, route, tab) {
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (tab) await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.screenshot({ path: `${output}${name}.png`, animations: 'disabled' });
    console.log(`Captured /marketing/${name}.png from ${route}${tab ? ` (${tab})` : ''}`);
  }

  await capture('kanban', '/tasks');
  await capture('tasks', '/tasks', 'فهرست');
  await capture('calendar', '/calendar');
  await capture('chat', '/chats');
  await capture('notes', '/notes');
  await capture('feed', '/feed');
} finally {
  await browser.close();
}

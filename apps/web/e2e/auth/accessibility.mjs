/** Automated WCAG checks complement, rather than replace, keyboard and visual review. */
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { check, finish, launch, out } from '../lib/harness.mjs';

const base = process.env.BASE_URL ?? 'http://localhost:3002';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('Local accessibility QA only.');
const directory = process.env.VISUAL_REVIEW_DIR ?? out;
mkdirSync(directory, { recursive: true });
const browser = await launch();
const context = await browser.newContext({ locale: 'fa-IR' });
await context.addInitScript(() => localStorage.setItem('taskin.theme', JSON.stringify({ mode: 'dark', accent: 'teal' })));
const page = await context.newPage();
const reports = [];
async function audit(label) {
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const violations = result.violations.map(item => ({ id: item.id, impact: item.impact, description: item.description, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
  reports.push({ label, viewport: page.viewportSize(), violations, needsManualReview: result.incomplete.map(item => item.id) });
  check(violations.length === 0, `${label}: axe WCAG A/AA (${page.viewportSize().width}px), ${violations.length} violations`);
  for (const violation of violations) console.log(JSON.stringify(violation));
}
try {
  for (const path of ['/', '/features', '/features/task-management', '/pricing', '/about', '/contact', '/faq', '/blog', '/help', '/demo-request', '/feed', '/reset-password']) {
    const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    if (response?.status() !== 200) throw new Error(`${path} returned ${response?.status()}; cannot audit the intended page.`);
    if (path === '/feed') await page.getByRole('textbox', { name: 'شماره موبایل' }).waitFor();
    if (path === '/reset-password') await page.getByRole('textbox', { name: 'کد بازنشانی', exact: true }).waitFor();
    for (const width of [1440, 390]) { await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); await audit(path); }
  }
  await page.goto(`${base}/feed`); await page.getByRole('button', { name: 'ورود با رمز عبور', exact: true }).click();
  for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); await audit('password-login'); }
  await page.getByRole('button', { name: 'فراموشی رمز عبور' }).click();
  await audit('forgot-password');
  // The code screen is a UI-only fixture here: it sends no SMS and makes no integration claim.
  await page.getByRole('button', { name: 'بازگشت به ورود با رمز' }).click(); await page.getByRole('button', { name: 'ورود با کد پیامکی' }).click();
  await page.route('**/api/v1/auth/otp/request', route => route.fulfill({ json: { challengeId: '00000000-0000-4000-8000-000000000001', codeLength: 8, expiresInSeconds: 120, resendInSeconds: 45 } }));
  await page.getByRole('textbox', { name: 'شماره موبایل' }).fill('09121234567'); await page.getByRole('button', { name: 'دریافت کد ورود' }).click(); await page.getByRole('textbox', { name: 'کد ورود' }).waitFor();
  for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); await audit('otp-ui-fixture'); }
} catch (error) { check(false, `accessibility audit stopped: ${error.message}`); }
finally {
  writeFileSync(`${directory}/accessibility.json`, JSON.stringify({ tool: '@axe-core/playwright 4.14.0', scope: 'public pages and listed auth states; OTP uses an isolated UI fixture', reports }, null, 2));
  await finish(browser);
}

import { base, check, eventually, finish, launch, out, watchConsole } from '../lib/harness.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
watchConsole(page);
const rail = page.getByRole('navigation', { name: 'ناوبری اصلی' });
await page.goto(base + '/tasks', { waitUntil: 'networkidle' });
check(await page.evaluate(() => document.documentElement.dataset.accent) === 'indigo', 'default accent is indigo');
await rail.getByRole('button', { name: 'پوسته و رنگ سازمان' }).click();
const picker = page.getByRole('dialog', { name: 'انتخاب پوسته' });
check(await eventually(async () => (await picker.getByRole('radio').count()) === 9), 'picker offers 3 modes + 6 palettes');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/th0_picker.png` });
const expected = { indigo: 'rgb(53, 56, 205)', teal: 'rgb(14, 118, 110)', violet: 'rgb(105, 65, 198)', rose: 'rgb(158, 22, 95)', amber: 'rgb(181, 71, 8)', ocean: 'rgb(14, 112, 144)' };
const names = { indigo: 'سازمانی پیش‌فرض', teal: 'تمرکز عمیق', violet: 'استارتاپ مدرن', rose: 'رز شرابی', amber: 'گرمای سازمانی', ocean: 'اقیانوس عمیق' };
for (const [id, name] of Object.entries(names)) {
  await picker.getByRole('radio', { name: new RegExp(name) }).click();
  // Polls through the button's 150ms colour transition.
  const fill = () => page.evaluate(() => ({ accent: document.documentElement.dataset.accent, solid: getComputedStyle(document.querySelector('button.bg-brand-solid')).backgroundColor }));
  check(await eventually(async () => { const got = await fill(); return got.accent === id && got.solid === expected[id]; }), `${id}: primary fill ${(await fill()).solid}`);
}
const stored = () => page.evaluate(() => localStorage.getItem('taskin.theme') ?? '');
check(await eventually(async () => (await stored()).includes('"ocean"')), `persisted ${await stored()}`);
await picker.getByRole('radio', { name: 'تیره' }).click();
check(await eventually(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark'), 'dark mode applied');
const canvas = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check(await eventually(async () => (await canvas()) === 'rgb(12, 17, 29)'), `OLED canvas #0C111D (${await canvas()})`);
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/th1_dark_ocean_picker.png` });
await page.keyboard.press('Escape');
// Reload: no flash — bootstrap applies stored accent before hydration
await page.reload({ waitUntil: 'domcontentloaded' });
check(await page.evaluate(() => document.documentElement.dataset.accent) === 'ocean', 'stored accent applied pre-hydration');
await page.waitForLoadState('networkidle');
for (const route of ['/tasks', '/calendar', '/notes']) {
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/th_dark_ocean${route.replace('/', '_')}.png` });
}
// rose dark gantt + notifications
await page.evaluate(() => localStorage.setItem('taskin.theme', JSON.stringify({ mode: 'dark', accent: 'rose' })));
await page.goto(base + '/tasks', { waitUntil: 'networkidle' });
await page.getByRole('tab', { name: 'گانت' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/th_dark_rose_gantt.png` });
await rail.getByRole('button', { name: /^اعلان‌ها/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/th_dark_rose_notifications.png` });
await finish(browser);

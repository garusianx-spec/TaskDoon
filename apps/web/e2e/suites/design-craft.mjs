import { base, check, eventually, finish, launch, out, watchConsole } from '../lib/harness.mjs';

// Cosmetic changes only, in an isolated browser context against the local demo fixture.
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local fixture required');
const browser = await launch();
try {
  for (const width of [375, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
      colorScheme: 'light',
    });
    const page = await context.newPage();
    watchConsole(page);
    await page.goto(base + '/feed');
    if ((await page.locator('html').getAttribute('data-source')) !== 'demo') throw new Error('Demo required');
    for (const mode of ['dark', 'light', 'system']) {
      await page.goto(base + '/');
      const toggle = page.getByRole('button', { name: 'تنظیم نمایش', exact: true });
      await toggle.click();
      const picker = page.getByRole('dialog', { name: 'انتخاب پوسته' });
      check(await picker.isVisible(), `${width}: marketing theme picker visible`);
      await picker
        .getByRole('radio', { name: { dark: 'تیره', light: 'روشن', system: 'سیستم' }[mode], exact: true })
        .click();
      await page.keyboard.press('Escape');
      check(
        await toggle.evaluate((el) => el === document.activeElement),
        `${width}: Escape restores theme trigger focus`,
      );
      for (const route of ['/', '/feed']) {
        await page.goto(base + route, { waitUntil: 'networkidle' });
        check(
          await eventually(
            async () =>
              (await page.locator('html').getAttribute('data-theme')) ===
              (mode === 'dark' ? 'dark' : 'light'),
          ),
          `${width} ${route}: ${mode} preference survives navigation`,
        );
        const metrics = await page.evaluate(() => {
          const root = document.documentElement;
          const surface = document.querySelector('.public-surface') ?? document.body;
          const styles = getComputedStyle(surface);
          const trigger = [...document.querySelectorAll('button')].find(
            (el) => el.getAttribute('aria-label') === 'تنظیم نمایش' && el.getBoundingClientRect().width > 0,
          );
          return {
            overflow: root.scrollWidth > root.clientWidth,
            canvas: styles.getPropertyValue('--bg-canvas').trim(),
            surface: styles.getPropertyValue('--bg-surface').trim(),
            target: trigger?.getBoundingClientRect().toJSON(),
          };
        });
        check(!metrics.overflow, `${width} ${route}: no page horizontal overflow`);
        check(
          mode !== 'dark' || (metrics.canvas === '0 0 0' && metrics.surface === '12 17 29'),
          `${width} ${route}: inherited OLED tokens`,
        );
        check(
          metrics.target?.width >= 44 && metrics.target?.height >= 44,
          `${width} ${route}: theme touch target at least 44px`,
        );
        await page.screenshot({
          path: `${out}/craft-${width}-${mode}-${route === '/' ? 'home' : 'feed'}.png`,
          fullPage: true,
        });
        await page.screenshot({
          path: `${out}/craft-${width}-${mode}-${route === '/' ? 'home' : 'feed'}-viewport.png`,
        });
      }
    }
    await context.close();
  }
} catch (error) {
  check(false, error.stack ?? error.message);
} finally {
  await finish(browser);
}

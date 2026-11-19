import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { base, check, eventually, finish, launch, out, watchConsole } from '../lib/harness.mjs';
if (
  process.env.BLOG_PRESENTATION_FIXTURE !== '1' ||
  !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)
)
  throw Error('Requires isolated blog fixture');
const modeFile = fileURLToPath(new URL('../../../../.local/blog-mode.txt', import.meta.url));
const published = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../.local/marketing-published.json', import.meta.url)),
    'utf8',
  ),
).find((document) => document.kind === 'article');
const b = await launch(),
  p = await (await b.newContext()).newPage();
watchConsole(p);
try {
  for (const width of [400, 1180])
    for (const mode of ['single', 'multi']) {
      writeFileSync(modeFile, mode);
      await p.setViewportSize({ width, height: 900 });
      await p.goto(base + '/blog');
      await p.evaluate(() => document.fonts.ready);
      const cards = p.locator('.marketing-blog-card');
      check(
        (await cards.count()) === (mode === 'single' ? 1 : 3),
        width + ' ' + mode + ': correct article count',
      );
      check((await p.title()).match(/تسک‌دون/g)?.length === 1, 'index brand occurs once');
      check(
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'no horizontal overflow',
      );
      for (const card of await cards.all()) {
        check((await card.locator('a').count()) === 1, 'one image/title destination per card');
        if (width === 400) {
          const h = await card.locator('h3').boundingBox(),
            img = await card.locator('img').boundingBox();
          check(h.y < img.y, 'narrow title precedes cover');
        }
      }
      const link = cards.first().locator('a');
      await link.focus();
      await p.keyboard.press('Tab');
      await p.keyboard.press('Shift+Tab');
      check(
        await link.evaluate(
          (el) => el === document.activeElement && parseFloat(getComputedStyle(el).outlineWidth) >= 2,
        ),
        'visible keyboard focus on single card link',
      );
      await p.screenshot({ path: out + '/blog-' + width + '-' + mode + '.png', animations: 'disabled' });
      const href = await link.getAttribute('href');
      if (mode === 'single') await cards.first().locator('img').click();
      else await cards.first().locator('h3').click();
      await p.waitForURL('**' + href);
      await p.evaluate(() => document.fonts.ready);
      check((await p.request.get(base + href)).status() === 200, 'original article URL resolves');
      check(
        (await p.locator('.marketing-article-detail .marketing-prose h3').count()) === 5,
        'five published numbered subheadings exposed',
      );
      check(
        (await p.locator('.marketing-article-detail .marketing-prose ul li').count()) === 5,
        'final checklist is a semantic list',
      );
      const bodyText = await p
        .locator(
          '.marketing-article-detail .marketing-section-rich-text > .marketing-container > .marketing-prose',
        )
        .evaluateAll((elements) => elements.map((element) => element.textContent).join(''));
      const original = published.sections
        .filter((section) => section.visible && section.type === 'rich-text')
        .map((section) => section.body ?? '')
        .join('');
      check(
        bodyText.replace(/[\s•]/g, '') === original.replace(/[\s•]/g, ''),
        'published body wording preserved',
      );
      check(
        (await p.locator('.marketing-publication-meta time').getAttribute('datetime')) ===
          published.publishedAt,
        'original publication date preserved',
      );
      check(
        (await p.locator('link[rel="canonical"]').getAttribute('href')).endsWith(href),
        'article canonical URL preserved',
      );
      const first = await p.locator('.marketing-article-detail .marketing-prose p').first().boundingBox();
      console.log('BODY ' + width + ' ' + first.y);
      await p
        .locator('#marketing-main > article')
        .evaluate((el) => el.classList.remove('marketing-article-detail'));
      const unscoped = await p.locator('#marketing-main .marketing-prose p').first().boundingBox();
      await p
        .locator('#marketing-main > article')
        .evaluate((el) => el.classList.add('marketing-article-detail'));
      check(first.y < unscoped.y, 'scoped article spacing moves body earlier than existing generic spacing');
      check(first.y < 900, 'article body begins within first viewport');
      const skip = p.locator('a[href="#marketing-main"]');
      await skip.focus();
      await skip.press('Enter');
      check(
        await eventually(
          async () => await p.locator('#marketing-main').evaluate((el) => el === document.activeElement),
        ),
        'skip link focuses main',
      );
      const main = await p.locator('#marketing-main').boundingBox(),
        header = await p.locator('.marketing-header').boundingBox();
      check(main.y >= header.y + header.height - 1, 'skip target clears sticky header');
      await p.screenshot({ path: out + '/article-' + width + '-' + mode + '.png', animations: 'disabled' });
      await p.getByRole('link', { name: 'بازگشت به بلاگ', exact: true }).click();
      await p.waitForURL('**/blog');
      check(await cards.first().isVisible(), 'return link reaches index');
    }
  writeFileSync(modeFile, 'single');
  await p.goto(base + '/');
  const home = p.locator('.home-articles .marketing-blog-card');
  check(
    (await home.count()) === 1 && (await home.locator('a').count()) === 1,
    'homepage shares the single-destination blog card',
  );
  writeFileSync(modeFile, 'media');
  await p.goto(base + '/blog/meeting-decisions-to-actionable-tasks');
  const image = p.locator('.marketing-article-detail img').first();
  await image.waitFor();
  check(
    await image.evaluate(
      (el) => el.complete && el.naturalWidth > 0 && getComputedStyle(el).objectFit === 'contain',
    ),
    'supported article cover is decoded and contained',
  );
} catch (e) {
  check(false, e.stack ?? e.message);
} finally {
  await finish(b);
}

import { base, check, finish, launch, out } from '../lib/harness.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto(base + '/tasks', { waitUntil: 'networkidle' });
await page.getByRole('tab', { name: 'گانت' }).click();
await page.waitForTimeout(300);
const scroller = page.locator('div.overflow-auto').filter({ has: page.locator('ul') }).first();
await page.screenshot({ path: `${out}/g0.png` });
// In RTL, scrolling toward later days is negative scrollLeft. The timeline opens on today and
// holds twelve weeks, so a week on (not its far end) is where the running tasks cross the column.
const info = await scroller.evaluate((el) => {
  el.scrollLeft -= 7 * el.querySelector('[data-day-index]').getBoundingClientRect().width;
  el.scrollTop = 120;
  return { sw: el.scrollWidth, cw: el.clientWidth, sl: el.scrollLeft };
});
console.log('scroll', JSON.stringify(info));
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/g1_scrolled.png` });
// Probe: every point over a sticky name cell must hit the name cell, never a bar.
const result = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('li > div.sticky')];
  let probes = 0, leaks = [];
  for (const cell of cells) {
    const r = cell.getBoundingClientRect();
    for (const fx of [0.1, 0.5, 0.9]) {
      const x = r.left + r.width * fx, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit) continue;
      probes++;
      if (!cell.contains(hit)) {
        const header = document.querySelector('div.sticky.top-0');
        if (header && header.contains(hit)) continue; // row scrolled under the header: correct
        leaks.push(hit.outerHTML.slice(0, 90));
      }
    }
  }
  const header = document.querySelector('div.sticky.top-0');
  const cs = (el) => { const s = getComputedStyle(el); return `${s.position}/z${s.zIndex}/${s.backgroundColor}`; };
  const bar = document.querySelector('li > button');
  const line = document.querySelector('li > div[aria-hidden="true"]');
  return { probes, leaks, header: cs(header), name: cs(cells[0]), bar: cs(bar), line: cs(line) };
});
console.log(JSON.stringify(result, null, 1));
check(result.leaks.length === 0 && result.probes > 10, `no bar paints over the task column (${result.probes} probes)`);
// Bars must actually be under the column somewhere after scroll: find a bar whose rect overlaps a name cell
const overlap = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('li > div.sticky')];
  return [...document.querySelectorAll('li > button')].some((bar) => {
    const b = bar.getBoundingClientRect();
    return cells.some((c) => { const r = c.getBoundingClientRect(); return b.right > r.left && b.left < r.right && b.top < r.bottom && b.bottom > r.top; });
  });
});
check(overlap, 'at least one bar geometrically slides beneath the sticky column');
await finish(browser);

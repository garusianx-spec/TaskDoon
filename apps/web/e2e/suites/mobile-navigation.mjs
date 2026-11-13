import {
  base,
  check,
  devices,
  eventually,
  finish,
  launch,
  out,
  visible,
  watchConsole,
} from '../lib/harness.mjs';

const browser = await launch();
const meAcrossProjects = ['CRM-102', 'CRM-103', 'CRM-104', 'SEC-301', 'CRM-110'];
const workspaceNav = (page) => page.getByRole('navigation', { name: 'ناوبری پایین' });
const currentTab = (page) => workspaceNav(page).locator('[aria-current="page"]');
const projectUrl = '/projects/p-core-web';
const main = (page) => page.getByRole('main');
const open = async (page, name, path) => {
  await workspaceNav(page).getByRole('link', { name, exact: true }).click();
  await page.waitForURL(`**${path}`);
};
const capture = async (page, name, width) => {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/phase3-${name}-${width}.png`, animations: 'disabled' });
};

try {
  for (const [width, height] of [
    [360, 800],
    [390, 844],
  ]) {
    const context = await browser.newContext({
      ...devices['iPhone 13'],
      viewport: { width, height },
      screen: { width, height },
      colorScheme: 'light',
      ...(process.env.E2E_TIME_ZONE ? { timezoneId: process.env.E2E_TIME_ZONE } : {}),
    });
    const page = await context.newPage();
    watchConsole(page);
    const at = (message) => `${width}×${height}: ${message}`;
    await page.goto(`${base}/feed`, { waitUntil: 'networkidle' });
    const tabs = await workspaceNav(page)
      .getByRole('link')
      .evaluateAll((links) =>
        links.map((link) => ({
          name: link.getAttribute('aria-label'),
          left: link.getBoundingClientRect().left,
        })),
      );
    check(
      tabs.map(({ name }) => name).join('|') === 'امروز|کارهای من|پروژه‌ها|گفت‌وگوها|بیشتر' &&
        tabs.every(({ left }, index) => index === 0 || left < tabs[index - 1].left),
      at('five tabs are in the requested visual RTL order'),
    );
    check((await currentTab(page).getAttribute('href')) === '/feed', at('Today is current'));
    const action = main(page).getByRole('region', { name: 'وظایف نیازمند اقدام' });
    const progress = main(page).getByRole('region', { name: 'پیشرفت کلی' });
    check(
      ((await action.boundingBox())?.y ?? Infinity) < ((await progress.boundingBox())?.y ?? 0) &&
        (await action.getByText(/CRM-|SEC-/).count()) > 0,
      at('actionable tasks precede progress and display short IDs'),
    );
    check(
      (await action.getByRole('region', { name: 'دارای تأخیر' }).count()) === 1 &&
        (await action.getByRole('region', { name: 'سررسید امروز' }).count()) === 1 &&
        (await action.getByRole('region', { name: 'سررسیدهای پیش رو' }).count()) === 1 &&
        (await main(page).getByRole('region', { name: 'رویداد بعدی' }).locator('p').count()) === 2,
      at('Today separates deadline periods and shows the next event'),
    );
    await capture(page, 'today', width);
    await main(page).getByRole('link', { name: 'مشاهدهٔ تقویم', exact: true }).click();
    await page.waitForURL('**/calendar');
    check((await currentTab(page).getAttribute('href')) === '/more', at('Today opens Calendar under More'));
    await page.goBack();
    await page.waitForURL('**/feed');

    await open(page, 'پروژه‌ها', '/projects');
    const starred = main(page).getByRole('region', { name: 'پروژه‌های ستاره‌دار' });
    await starred.getByRole('link', { name: 'نسخه وب', exact: true }).click();
    await page.waitForURL(`**${projectUrl}`);
    const board = main(page).getByRole('application', { name: 'بورد کانبان وظایف' });
    check(
      (await visible(main(page).getByRole('heading', { name: 'نسخه وب', exact: true }))) &&
        (await visible(board)) &&
        (await currentTab(page).getAttribute('href')) === '/projects',
      at('a starred project opens its named board and keeps Projects current'),
    );
    await capture(page, 'project', width);
    const quick = page.getByRole('button', { name: 'ایجاد سریع', exact: true });
    await quick.click();
    await page.getByRole('menuitem', { name: /^وظیفه جدید/ }).click();
    const composer = page.getByRole('dialog', { name: 'تعریف وظیفه جدید' });
    check(
      (await visible(composer)) &&
        (await composer.getByRole('combobox', { name: 'پروژه', exact: true }).count()) === 0 &&
        (await visible(
          composer.getByRole('button', { name: 'انتخاب مهلت انجام' }).filter({ hasText: 'بدون مهلت' }),
        )),
      at('quick creation inside a project is scoped and starts with an empty deadline'),
    );
    await composer.getByRole('button', { name: 'انصراف', exact: true }).click();
    await composer.waitFor({ state: 'hidden' });
    const filters = main(page).getByRole('button', { name: 'فیلترها', exact: true });
    await filters.click();
    await main(page).getByRole('combobox', { name: 'نمای وظایف' }).click();
    await page.getByRole('option', { name: 'دارای تأخیر', exact: true }).click();
    await filters.click();
    check(
      (await visible(main(page).getByText('فیلترهای فعال'))) &&
        (await visible(main(page).getByRole('link', { name: 'پروژه‌ها', exact: true }))),
      at('the active project filter stays visible and project navigation is outside it'),
    );
    await main(page).getByRole('tab', { name: 'فهرست', exact: true }).click();
    check(
      (await main(page).getByRole('tab', { name: 'فهرست', exact: true }).getAttribute('aria-selected')) ===
        'true' && (await board.count()) === 0,
      at('the project can switch to its list view on mobile'),
    );
    await main(page).getByRole('tab', { name: 'بورد', exact: true }).click();

    await open(page, 'کارهای من', '/tasks/mine');
    const codes = await main(page)
      .getByText(/^(CRM|SEC|MKT|FIN)-\d+$/)
      .allTextContents();
    check(
      codes.sort().join('|') === [...meAcrossProjects].sort().join('|') &&
        (await visible(main(page).getByText('۵ وظیفهٔ ارجاع‌شده به من در نتایج', { exact: true }))),
      at('personal results and count include only my work across projects'),
    );
    await capture(page, 'my-tasks', width);
    await quick.click();
    await page.getByRole('menuitem', { name: /^وظیفه جدید/ }).click();
    check(
      await visible(composer.getByRole('combobox', { name: 'پروژه', exact: true })),
      at('personal quick creation can choose a project'),
    );
    await composer.getByRole('button', { name: 'انصراف', exact: true }).click();
    await composer.waitFor({ state: 'hidden' });
    const task = main(page).getByRole('button', { name: /^.*CRM-102.*رفع ناسازگاری/ });
    await task.click();
    const details = page.getByRole('dialog', { name: 'جزئیات وظیفه' });
    const metadata = details.locator('summary').filter({ hasText: 'جزئیات بیشتر' });
    check(
      (await visible(details.getByRole('button', { name: 'انتخاب مهلت انجام' }))) &&
        !(await details.getByRole('button', { name: 'انتخاب تاریخ شروع' }).isVisible()) &&
        (await visible(details.getByRole('button', { name: 'ذخیره تغییرات', exact: true }))),
      at('deadline and Save are available while secondary task fields are collapsed'),
    );
    await metadata.focus();
    await page.keyboard.press('Enter');
    check(
      await visible(details.getByRole('button', { name: 'انتخاب تاریخ شروع' })),
      at('keyboard opens secondary task fields'),
    );
    await details.getByRole('button', { name: 'انصراف', exact: true }).click();
    check(
      await eventually(() => task.evaluate((element) => element === document.activeElement)),
      at('closing details restores focus to the task'),
    );
    await page.goBack();
    await page.waitForURL(`**${projectUrl}`);
    check(await visible(board), at('browser Back returns to the project board'));
    await page.goBack();
    await page.waitForURL('**/projects');
    check(await visible(starred), at('browser Back then returns to Projects'));

    await open(page, 'بیشتر', '/more');
    const more = main(page).getByRole('navigation', { name: 'تنظیمات بیشتر' });
    const moreRows = more.getByRole('link');
    const navTop = (await workspaceNav(page).boundingBox())?.y ?? 0;
    const rows = await moreRows.evaluateAll((links) =>
      links.map((link) => {
        const { height, bottom } = link.getBoundingClientRect();
        return { label: link.textContent, height, bottom };
      }),
    );
    check(
      rows.map(({ label }) => label).join('|') === 'تقویم|یادداشت‌ها|اعضا|حساب من|تنظیمات فضای کاری' &&
        rows.every(({ height, bottom }) => height >= 44 && bottom <= navTop),
      at('all five full-row touch targets fit above the bottom bar'),
    );
    await capture(page, 'more', width);
    const calendar = more.getByRole('link', { name: 'تقویم', exact: true });
    await calendar.focus();
    check(
      await calendar.evaluate((element) => element === document.activeElement),
      at('More rows accept keyboard focus'),
    );
    await page.keyboard.press('Enter');
    await page.waitForURL('**/calendar');
    check(
      await visible(main(page).getByRole('heading', { name: 'تقویم' })),
      at('the More calendar link works by keyboard'),
    );
    await open(page, 'بیشتر', '/more');
    await more.getByRole('link', { name: 'یادداشت‌ها', exact: true }).click();
    await page.waitForURL('**/notes');
    check(
      await visible(main(page).getByRole('heading', { name: 'همه یادداشت‌ها' })),
      at('More opens the existing notebook'),
    );
    await open(page, 'بیشتر', '/more');
    await more.getByRole('link', { name: 'اعضا', exact: true }).click();
    await page.waitForURL('**/directory');
    check(
      await visible(main(page).getByRole('region', { name: 'دعوت‌های در انتظار پذیرش' })),
      at('More opens Members and its pending invitations'),
    );
    await main(page).getByRole('button', { name: 'دعوت همکار', exact: true }).click();
    const invite = page.getByRole('dialog', { name: 'دعوت همکار' });
    check(
      await visible(invite.getByLabel('ایمیل یا شماره موبایل همکاران')),
      at('Members opens the existing invite form'),
    );
    await page.keyboard.press('Escape');
    await invite.waitFor({ state: 'hidden' });

    await open(page, 'بیشتر', '/more');
    await more.getByRole('link', { name: 'حساب من', exact: true }).click();
    await main(page).getByRole('link', { name: 'ظاهر شخصی', exact: true }).click();
    await page.waitForURL('**/more/account/appearance');
    await main(page).getByRole('radio', { name: 'تیره', exact: true }).click();
    check(
      (await eventually(async () => (await page.locator('html').getAttribute('data-theme')) === 'dark')) &&
        (await currentTab(page).getAttribute('href')) === '/more',
      at('personal appearance applies dark mode and keeps More current'),
    );
    await open(page, 'بیشتر', '/more');
    await capture(page, 'more-dark', width);
    await more.getByRole('link', { name: 'تنظیمات فضای کاری', exact: true }).click();
    await page.waitForURL('**/more/workspace');
    check(
      (await visible(main(page).getByRole('radiogroup', { name: 'پالت برند سازمان' }))) &&
        (await visible(main(page).getByRole('region', { name: 'طرح و مالک فضای کاری' }))),
      at('workspace settings show the palette, plan and owner'),
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
      ),
      at('workspace settings have no page-level horizontal overflow'),
    );
    if (width === 360) {
      await open(page, 'بیشتر', '/more');
      await page.getByRole('button', { name: /^تعویض فضای کاری/ }).click();
      await page.getByRole('menuitem', { name: 'ایجاد فضای کاری جدید' }).click();
      const workspace = page.getByRole('dialog', { name: 'ایجاد فضای کاری جدید' });
      const name = 'فضای کاری برنامه‌ریزی و همکاری تیم طراحی';
      await workspace.getByRole('textbox', { name: 'نام فضای کاری' }).fill(name);
      await workspace.getByRole('button', { name: 'ایجاد و ورود' }).click();
      await page.waitForURL('**/feed');
      check(
        (await visible(page.getByRole('button', { name: `تعویض فضای کاری: ${name}` }))) &&
          (await visible(main(page).getByRole('link', { name: 'مشاهدهٔ تقویم' }))) &&
          (await visible(main(page).getByText('رویداد آینده‌ای در تقویم فعلی نیست.'))),
        at('the long workspace name stays accessible and an empty calendar still has an entry'),
      );
      await page.setViewportSize({ width, height: 480 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '125%';
      });
      await open(page, 'بیشتر', '/more');
      const lastRow = more.getByRole('link', { name: 'تنظیمات فضای کاری' });
      await lastRow.scrollIntoViewIfNeeded();
      check(
        ((await lastRow.boundingBox())?.y ?? Infinity) +
          ((await lastRow.boundingBox())?.height ?? Infinity) <=
          ((await workspaceNav(page).boundingBox())?.y ?? 0) + 1 &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
          )),
        '360×480 with enlarged text: More scrolls and the last row clears the bottom bar',
      );
    }
    await context.close();
  }

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watchConsole(desktop);
  await desktop.goto(`${base}/tasks`, { waitUntil: 'networkidle' });
  const rail = desktop.getByRole('navigation', { name: 'ناوبری اصلی' });
  check(
    (await rail.getByRole('link').count()) >= 7 &&
      (await visible(desktop.getByRole('navigation', { name: 'درخت پروژه‌ها' }))) &&
      !(await workspaceNav(desktop).isVisible()),
    'desktop keeps the rail and project tree on the existing /tasks route',
  );
  await desktop.close();
} catch (error) {
  check(false, `mobile navigation stopped: ${error.message}`);
} finally {
  await finish(browser);
}

/** Full live marketing/CMS contract. Requires API_LOG, local migrator CLI and running live web/API. */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { check, eventually, finish, launch, out, visible, watchConsole } from '../lib/harness.mjs';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const log = process.env.API_LOG;
if (!log) throw new Error('API_LOG must point to the console SMS log.');
const marker = `site-${Date.now()}`;
const phone = `0912${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
const password = `Site-Editor-${Date.now()}!`;
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fa-IR' });
await context.addInitScript(() => {
  window.__siteLabMetrics = { lcpMs: null, cls: 0 };
  if (typeof PerformanceObserver !== 'function') return;
  try { new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__siteLabMetrics.lcpMs = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* Unsupported browser metric is reported as unavailable. */ }
  try { new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__siteLabMetrics.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true }); } catch { /* Unsupported browser metric is reported as unavailable. */ }
});
const page = await context.newPage();
// Keep desktop and mobile loads independent: a cached desktop srcset candidate can make
// Chromium preload a different mobile candidate that the resized document never consumes.
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
watchConsole(page);
let token;
page.on('response', async (response) => {
  if (!response.url().includes('/api/v1/auth/') || !response.ok()) return;
  try { const body = await response.json(); token = body.accessToken ?? body.session?.accessToken ?? token; } catch { /* no-content responses */ }
});
async function api(method, path, body) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method, headers: await requestHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${result?.code ?? ''}`);
  return result;
}
async function reportLab(viewport) {
  const metrics = await page.evaluate(() => ({ ...window.__siteLabMetrics, ttfbMs: performance.getEntriesByType('navigation')[0]?.responseStart ?? null }));
  console.log(`LAB ${JSON.stringify({ url: page.url(), viewport, deviceScaleFactor: 1, cpu: 'unthrottled', network: 'local unthrottled', browserCache: 'disabled', lcpMs: metrics.lcpMs === null ? null : Math.round(metrics.lcpMs), cls: Number(metrics.cls.toFixed(4)), ttfbMs: metrics.ttfbMs === null ? null : Math.round(metrics.ttfbMs), inp: 'pending real-user measurement', measuredAt: new Date().toISOString() })}`);
}
async function captureFullPage(path) {
  await page.evaluate(async () => {
    // Trigger normal lazy-loading before a full-page artifact; eager-loading is not forced
    // into the application itself merely to make a screenshot look complete.
    for (const image of document.images) {
      image.scrollIntoView({ block: 'center', behavior: 'instant' });
      try { await image.decode(); } catch { /* The watched console/network review still reveals missing images. */ }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  check(await page.evaluate(() => [...document.images].every(image => image.complete && image.naturalWidth > 0)), 'product images decode successfully before the full-page capture');
  await page.screenshot({ path, fullPage: true });
}
let home;
let temporary;
let uiSubmissionId;
let didGrant = false;
const workspaceRequests = [];
page.on('request', request => { if (/\/api\/v1\/(?:me(?:[/?]|$)|auth\/refresh|workspaces)/.test(request.url())) workspaceRequests.push(request.url()); });
async function requestHeaders() {
  const cookies = await context.cookies(base);
  const csrf = cookies.find(cookie => ['taskin_csrf', '__Host-taskin_csrf'].includes(cookie.name));
  return { 'content-type': 'application/json', origin: base,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(cookies.length ? { cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ') } : {}),
    ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf.value) } : {}) };
}
async function publicSubmit(body) { return fetch(`${base}/api/v1/public/site/submissions`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(body) }); }
async function saveDocument(document, draft = document.draft, slug = document.slug) { return api('PUT', `/admin/site/documents/${document.id}`, { kind: document.kind, slug, draft, version: document.version }); }
async function persistedDocument(id) { return api('GET', `/admin/site/documents/${id}`); }
const uiContact = { kind: 'contact', fullName: `درخواست مرورگر ${marker}`, email: 'site-browser@example.com', phone, subject: `browser-${marker}`, message: `پیام معتبر ثبت‌شده از رابط عمومی ${marker}`, consent: true, website: '' };
try {
  const initial = await fetch(base);
  const html = await initial.text();
  check(initial.status === 200 && html.includes('همه کارهای'), 'public homepage is server-rendered without authentication');
  check(/<title>[^<]+<\/title>/.test(html) && html.includes('rel="canonical"'), 'metadata and canonical are in server HTML');
  check(html.includes('application/ld+json'), 'structured data is present in server HTML');
  check(!html.includes('ناوبری پایین') && !html.includes('ستون زمینه'), 'marketing server HTML excludes workspace shell controls');
  check((await fetch(`${base}/missing-${marker}`)).status === 404, 'missing public page returns 404');
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  check(sitemap.includes('/features') && !sitemap.includes('/admin') && !sitemap.includes('/feed'), 'sitemap includes public content and excludes private application routes');
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  check(robots.includes('/admin'), 'robots publishes private route crawl controls');
  await page.goto(base, { waitUntil: 'networkidle' });
  check(workspaceRequests.length === 0, 'anonymous marketing route does not initialize workspace authentication or data providers');
  const structuredData = await page.locator('script[type="application/ld+json"]').allTextContents();
  check(structuredData.length > 0 && structuredData.every(value => { try { return typeof JSON.parse(value) === 'object'; } catch { return false; } }), 'all server-rendered JSON-LD blocks parse as JSON');
  check(await visible(page.getByRole('heading', { level: 1 })), 'homepage is readable in Chromium');
  await reportLab('1440x1000 desktop');
  await captureFullPage(`${out}/site-home-desktop.png`);
  const productTabs = page.getByRole('tablist', { name: 'بخش‌های محصول' });
  const previewTabs = productTabs.getByRole('tab');
  await previewTabs.first().focus();
  await page.keyboard.press('End');
  check(await previewTabs.last().getAttribute('aria-selected') === 'true', 'product preview tabs support keyboard End navigation');
  await page.keyboard.press('Home');
  check(await previewTabs.first().getAttribute('aria-selected') === 'true', 'product preview tabs support keyboard Home navigation');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile homepage has no horizontal overflow');
  await reportLab('390x844 mobile viewport');
  await captureFullPage(`${out}/site-home-mobile.png`);
  await page.evaluate(() => localStorage.setItem('taskin.theme', JSON.stringify({ mode: 'dark', accent: 'teal' })));
  await page.reload({ waitUntil: 'networkidle' });
  check(await page.evaluate(() => document.documentElement.dataset.theme === 'dark' && document.documentElement.dataset.accent === 'teal'), 'marketing preserves the existing dark mode and alternate accent architecture');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'dark mobile homepage has no horizontal overflow');
  await captureFullPage(`${out}/site-home-mobile-dark.png`);
  await page.evaluate(() => localStorage.setItem('taskin.theme', JSON.stringify({ mode: 'light', accent: 'indigo' })));
  await page.reload({ waitUntil: 'networkidle' });
  const mobileToggle = page.getByRole('button', { name: 'باز کردن فهرست' });
  await mobileToggle.click();
  check(await visible(page.getByRole('navigation', { name: 'ناوبری موبایل' })) && await page.getByRole('button', { name: 'بستن فهرست' }).getAttribute('aria-expanded') === 'true', 'mobile navigation opens with an accessible expanded state');
  await page.getByRole('navigation', { name: 'ناوبری موبایل' }).getByRole('link', { name: 'امکانات', exact: true }).click();
  check(await eventually(() => new URL(page.url()).pathname === '/features'), 'mobile menu follows a real features link');
  check(await page.getByRole('navigation', { name: 'ناوبری موبایل' }).count() === 0, 'mobile menu closes after navigation');
  await page.goto(`${base}/faq`);
  const allQuestions = await page.locator('.marketing-faq-item').count();
  const faqSearch = page.getByRole('searchbox', { name: 'جست‌وجو در پرسش‌ها' });
  await faqSearch.fill('کانبان');
  check(await eventually(async () => { const count = await page.locator('.marketing-faq-item').count(); return count > 0 && count < allQuestions; }), 'Persian FAQ search filters published questions');
  await faqSearch.fill(`پرسش پیدا نشد ${marker}`);
  check(await visible(page.getByRole('status').filter({ hasText: 'پرسشی با این عبارت پیدا نشد' })), 'FAQ search has an accessible empty result');
  await faqSearch.fill('');
  const question = page.locator('.marketing-faq-item').first();
  await question.locator('summary').click();
  check(await question.evaluate(node => node.open), 'FAQ disclosure expands with a native accessible control');
  for (const path of ['/features', '/pricing', '/about', '/collaborate', '/careers', '/demo-request', '/security']) {
    const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    check(response?.status() === 200 && await page.getByRole('heading', { level: 1 }).count() === 1, `${path} is public and has one primary heading`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} fits the mobile viewport`);
  }
  for (const path of ['/blog', '/help', '/terms', '/privacy']) {
    check((await fetch(`${base}${path}`)).status === 404, `${path} stays unpublished until editorial or legal approval`);
  }
  await page.goto(`${base}/contact`);
  const publicForm = page.getByRole('form', { name: 'ارسال پیام' });
  await publicForm.getByRole('button', { name: 'ارسال پیام', exact: true }).click();
  check(await publicForm.locator(':invalid').count() > 0, 'contact form enforces required fields in the browser');
  await publicForm.getByRole('textbox', { name: 'نام و نام خانوادگی' }).fill(uiContact.fullName);
  await publicForm.getByRole('textbox', { name: 'ایمیل', exact: true }).fill('invalid-email');
  check(await publicForm.getByRole('textbox', { name: 'ایمیل', exact: true }).evaluate(node => !node.checkValidity()), 'contact email has native client validation');
  await publicForm.getByRole('textbox', { name: 'ایمیل', exact: true }).fill(uiContact.email);
  await publicForm.getByRole('textbox', { name: 'شماره تماس' }).fill(phone);
  await publicForm.getByRole('textbox', { name: 'موضوع', exact: true }).fill(uiContact.subject);
  await publicForm.getByRole('textbox', { name: 'پیام شما' }).fill(uiContact.message);
  await publicForm.getByRole('checkbox').check();
  const submitted = page.waitForResponse(response => response.url().endsWith('/api/v1/public/site/submissions') && response.request().method() === 'POST');
  await publicForm.getByRole('button', { name: 'ارسال پیام', exact: true }).click();
  check((await submitted).ok(), 'browser contact form reaches and is accepted by the real backend');
  check(await visible(page.getByRole('status').filter({ hasText: 'درخواست شما ثبت شد' })), 'contact form confirms successful persistence to the visitor');
  check((await publicSubmit({ ...uiContact, email: 'invalid-email' })).status === 400, 'server rejects an invalid email independently of client validation');
  check((await publicSubmit({ ...uiContact, consent: false })).status === 400, 'server enforces submission consent');
  check((await publicSubmit({ ...uiContact, website: 'https://spam.example' })).status === 400, 'server rejects filled spam honeypots');
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Create an actual operator through the unchanged OTP flow, then use the repository CLI.
  await page.goto(`${base}/feed`);
  await page.getByRole('textbox', { name: 'شماره موبایل' }).fill(phone);
  const offset = statSync(log).size;
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click();
  let code;
  await eventually(() => { code = [...readFileSync(log).subarray(offset).toString().matchAll(/"text":"کد ورود شما به تسک‌دون: (\d{6})"/g)].at(-1)?.[1]; return code; }, 20000);
  if (!code) throw new Error('No OTP arrived in the console log.');
  await page.getByRole('textbox', { name: 'کد ورود' }).fill(code);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await page.getByRole('textbox', { name: 'نام و نام خانوادگی' }).fill(`ویرایشگر آزمون ${marker}`);
  await page.getByRole('button', { name: 'ساخت حساب و ورود' }).click();
  await page.getByRole('heading', { name: /خوش آمدید/ }).waitFor({ timeout: 20000 });
  check(await eventually(() => !!token), 'the unchanged OTP sign-up returns a live session');
  const nonAdmin = await fetch(`${base}/api/v1/admin/site/documents`, { headers: await requestHeaders() });
  check(nonAdmin.status === 404, 'an authenticated ordinary user cannot access the platform CMS');
  if (process.env.GRANT_PLATFORM_ADMIN) execFileSync('/bin/sh', ['-c', `${process.env.GRANT_PLATFORM_ADMIN} "$1"`, 'grant-site-operator', phone], { stdio: 'pipe' });
  else execFileSync(process.execPath, [fileURLToPath(new URL('../../../api/dist/cli/platform-admin.js', import.meta.url)), 'grant', phone], { stdio: 'pipe' });
  didGrant = true;
  await page.goto(`${base}/admin/site`);
  await page.getByRole('heading', { name: 'رمز عبور مدیر را تعیین کنید' }).waitFor({ timeout: 20000 });
  await page.getByLabel('رمز عبور', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();
  check(await visible(page.getByRole('navigation', { name: 'بخش‌های پنل مدیریت' }), 20000), 'existing platform-admin gate protects the CMS');
  const uiInbox = await api('GET', `/admin/site/submissions?q=${encodeURIComponent(uiContact.subject)}`);
  const uiEntries = Array.isArray(uiInbox) ? uiInbox : uiInbox.items;
  uiSubmissionId = uiEntries.find(entry => entry.subject === uiContact.subject)?.id;
  check(!!uiSubmissionId, 'the browser contact submission survives an independent authorized inbox read');
  if (!uiSubmissionId) throw new Error('Browser contact submission missing from inbox.');
  await api('PATCH', `/admin/site/submissions/${uiSubmissionId}`, { status: 'in-progress', notes: `متن داخلی ${marker}` });
  const persistedSubmission = await api('GET', `/admin/site/submissions/${uiSubmissionId}`);
  check(persistedSubmission.status === 'in-progress' && persistedSubmission.notes === `متن داخلی ${marker}`, 'inbox status and private notes persist after reload');
  check(!(await (await fetch(`${base}/contact`)).text()).includes(`متن داخلی ${marker}`), 'private lead notes never render on public pages');
  const documents = await api('GET', '/admin/site/documents');
  home = documents.find((entry) => entry.kind === 'page' && entry.slug === 'home');
  if (!home) throw new Error('Seeded homepage missing.');
  check(home.published !== null, 'homepage content is persisted and published');
  const unpublished = structuredClone(home.draft);
  unpublished.title = `عنوان خصوصی ${marker}`;
  if (unpublished.sections[0]) unpublished.sections[0].title = unpublished.title;
  unpublished.seo.title = `عنوان جستجو ${marker}`;
  await api('PUT', `/admin/site/documents/${home.id}`, { kind: home.kind, slug: home.slug, draft: unpublished, version: home.version });
  check(!(await (await fetch(base)).text()).includes(unpublished.title), 'saving a draft does not expose it to public visitors');
  const unauthorized = await fetch(`${base}/api/v1/admin/site/documents/${home.id}/preview`);
  check(unauthorized.status === 401, 'unpublished preview requires authentication');
  const preview = await api('GET', `/admin/site/documents/${home.id}/preview`);
  check(preview.draft?.title === unpublished.title, 'authorized preview shows the saved draft');
  const protectedPreviewResponse = await fetch(`${base}/api/v1/admin/site/documents/${home.id}/preview`, { headers: await requestHeaders() });
  check(protectedPreviewResponse.headers.get('cache-control')?.includes('no-store'), 'protected preview responses explicitly disable caching');
  await api('POST', `/admin/site/documents/${home.id}/publish`);
  const publishedHtml = await (await fetch(base)).text();
  check(publishedHtml.includes(unpublished.title) && publishedHtml.includes(unpublished.seo.title), 'publication updates server-rendered title and SEO without rebuilding');
  await page.goto(`${base}/admin/site/pages/${home.id}`);
  check(await eventually(() => page.locator('input').evaluateAll((inputs, value) => inputs.some((input) => input.value === value), unpublished.title), 15000), 'admin editor reloads persisted content');
  await page.screenshot({ path: `${out}/site-editor.png`, fullPage: true });
  // Verify safe URL validation and public/private content boundaries via the real API.
  const bad = await fetch(`${base}/api/v1/admin/site/documents/${home.id}`, { method: 'PUT', headers: await requestHeaders(), body: JSON.stringify({ kind: home.kind, slug: home.slug, draft: { ...unpublished, sections: [{ id: 'bad', type: 'cta', visible: true, cta: { label: 'bad', href: 'javascript:alert(1)' } }] } }) });
  check(bad.status === 400, 'unsafe CMS links are rejected by the server');
  temporary = await api('POST', '/admin/site/documents', { kind: 'page', slug: marker, draft: {
    title: `پیش‌نویس اولیه ${marker}`, description: 'صفحه موقت آزمون انتشار', seo: { title: `عنوان نخست ${marker}`, description: 'توضیحات متا برای آزمون واقعی انتشار' }, data: {},
    sections: [{ id: 'first', type: 'rich-text', title: 'بخش نخست', body: 'محتوای بخش نخست برای بررسی ترتیب.', visible: true }, { id: 'second', type: 'rich-text', title: 'بخش دوم', body: 'محتوای بخش دوم برای بررسی ترتیب.', visible: true }],
  } });
  check((await fetch(`${base}/${marker}`)).status === 404, 'unpublished page is a real 404');
  check(!(await (await fetch(`${base}/sitemap.xml`)).text()).includes(marker), 'draft slug stays out of sitemap');
  await page.goto(`${base}/admin/site/pages/${temporary.id}`);
  await page.getByTestId('site-title').fill(`ویرایش از پنل ${marker}`);
  await page.getByRole('button', { name: 'بخش 1 به پایین', exact: true }).click();
  const uiSaved = page.waitForResponse(response => response.url().endsWith(`/admin/site/documents/${temporary.id}`) && response.request().method() === 'PUT');
  await page.getByTestId('site-save').click();
  check((await uiSaved).ok(), 'admin editor saves title and reordered sections through the real UI');
  let edited = await persistedDocument(temporary.id);
  check(edited.draft.title === `ویرایش از پنل ${marker}` && edited.draft.sections.map(section => section.id).join(',') === 'second,first', 'title and section ordering persist in PostgreSQL');
  await page.reload();
  check(await eventually(async () => await page.getByTestId('site-title').inputValue() === edited.draft.title), 'editor title survives a full browser reload');
  await page.getByTestId('site-preview').click();
  check(await visible(page.getByTestId('site-preview-content').getByRole('heading', { name: edited.draft.title, exact: true })), 'protected editor preview renders the saved draft');
  await page.keyboard.press('Escape');
  const uiPublished = page.waitForResponse(response => response.url().endsWith(`/admin/site/documents/${temporary.id}/publish`) && response.request().method() === 'POST');
  await page.getByTestId('site-publish').click();
  await page.getByTestId('site-confirm').click();
  check((await uiPublished).ok(), 'publication requires and accepts the administrator confirmation UI');
  const temporaryHtml = await (await fetch(`${base}/${marker}`)).text();
  check(temporaryHtml.includes(edited.draft.title) && temporaryHtml.indexOf('بخش دوم') < temporaryHtml.indexOf('بخش نخست'), 'public server HTML displays the CMS title and section order');
  check((await (await fetch(`${base}/sitemap.xml`)).text()).includes(`/${marker}`), 'published indexable content enters the dynamic sitemap');
  const firstRevisions = await api('GET', `/admin/site/documents/${temporary.id}/revisions`);
  const initialRevision = firstRevisions.find(revision => revision.action === 'create');
  check(!!initialRevision && firstRevisions.some(revision => revision.action === 'publish') && firstRevisions.every(revision => revision.actorId && revision.createdAt), 'revision history persists editor identity, times, and publishing events');
  if (!initialRevision) throw new Error('Initial revision missing.');
  edited = await persistedDocument(temporary.id);
  const movedSlug = `${marker}-moved`;
  await saveDocument(edited, edited.draft, movedSlug);
  check((await fetch(`${base}/${marker}`)).status === 200 && (await fetch(`${base}/${movedSlug}`)).status === 404, 'saving a draft slug does not change the published address');
  await page.goto(`${base}/admin/site/seo`, { waitUntil: 'networkidle' });
  const sitemapPanel = page.getByRole('region', { name: 'پیش‌نمایش نقشه سایت و canonical', exact: true });
  await sitemapPanel.locator(`a[href="/${marker}"]`).waitFor();
  check(await sitemapPanel.locator(`a[href="/${marker}"]`).count() === 1 && await sitemapPanel.locator(`a[href="/${movedSlug}"]`).count() === 0, 'admin sitemap preview uses the published slug while a renamed draft is pending');
  await page.getByRole('button', { name: 'بررسی HTML عمومی', exact: true }).click();
  const htmlReport = page.getByRole('status').filter({ hasText: 'canonical صفحه:' });
  check(await visible(htmlReport) && (await htmlReport.textContent()).includes('JSON معتبر'), 'admin SEO tool inspects real server HTML and parses its structured data');
  await api('POST', `/admin/site/documents/${temporary.id}/publish`);
  const redirect = await fetch(`${base}/${marker}`, { redirect: 'manual' });
  check([301, 308].includes(redirect.status) && new URL(redirect.headers.get('location'), base).pathname === `/${movedSlug}`, 'published slug changes create an actual permanent HTTP redirect');
  const restored = await api('POST', `/admin/site/documents/${temporary.id}/restore`, { revisionId: initialRevision.id });
  check(restored.draft.title === temporary.draft.title && restored.slug === marker, 'restoring a revision restores its content and original slug to the draft');
  check((await (await fetch(`${base}/${movedSlug}`)).text()).includes(edited.draft.title), 'revision restore leaves the currently published content unchanged');
  await api('POST', `/admin/site/documents/${temporary.id}/publish`);
  check((await (await fetch(`${base}/${marker}`)).text()).includes(temporary.draft.title), 'publishing a restored revision updates the public document');
  await api('POST', `/admin/site/documents/${temporary.id}/unpublish`);
  check((await fetch(`${base}/${marker}`)).status === 404 && !(await (await fetch(`${base}/sitemap.xml`)).text()).includes(marker), 'unpublishing removes the public page and sitemap entry');
  await page.goto(`${base}/admin/site/seo`, { waitUntil: 'networkidle' });
  const finalSitemapPanel = page.getByRole('region', { name: 'پیش‌نمایش نقشه سایت و canonical', exact: true });
  await finalSitemapPanel.getByRole('link').first().waitFor();
  check(await finalSitemapPanel.locator(`a[href*="${marker}"]`).count() === 0, 'admin sitemap preview excludes unpublished content');
  const submission = await fetch(`${base}/api/v1/public/site/submissions`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ kind: 'contact', fullName: 'درخواست آزمون', email: 'site-test@example.com', phone, subject: marker, message: `پیام درخواست ${marker}`, consent: true, website: '' }) });
  check(submission.ok, 'public contact submission is accepted');
  const inbox = await api('GET', `/admin/site/submissions?q=${encodeURIComponent(marker)}`);
  const entries = Array.isArray(inbox) ? inbox : inbox.items;
  check(entries.some((entry) => (entry.subject ?? entry.payload?.subject) === marker), 'contact request persists in the protected admin inbox');
  const anonymousInbox = await fetch(`${base}/api/v1/admin/site/submissions`);
  check(anonymousInbox.status === 401, 'submission inbox is private');
} catch (error) {
  check(false, error.stack ?? error.message);
} finally {
  if (home && token) {
    try {
      let current = await persistedDocument(home.id);
      if (home.published) {
        current = await saveDocument(current, home.published, home.slug);
        current = await api('POST', `/admin/site/documents/${home.id}/publish`);
      }
      if (!isDeepStrictEqual(home.draft, home.published)) await saveDocument(current, home.draft, home.slug);
      const restoredHome = await persistedDocument(home.id);
      check(isDeepStrictEqual(restoredHome.published, home.published) && isDeepStrictEqual(restoredHome.draft, home.draft), 'homepage published content and any preexisting draft are restored');
    } catch (error) { check(false, `Homepage restore failed: ${error.message}`); }
  }
  if (temporary && token) {
    try { await api('POST', `/admin/site/documents/${temporary.id}/archive`); } catch (error) { check(false, `Temporary page archive failed: ${error.message}`); }
  }
  if (token && didGrant) {
    try {
      const inbox = await api('GET', `/admin/site/submissions?q=${encodeURIComponent(marker)}`);
      for (const entry of inbox.items ?? inbox) await api('PATCH', `/admin/site/submissions/${entry.id}`, { status: 'archived' });
      const redirects = await api('GET', '/admin/site/redirects');
      for (const entry of redirects.filter(entry => entry.fromPath.includes(marker))) await api('DELETE', `/admin/site/redirects/${entry.id}`);
    } catch (error) { check(false, `Temporary inbox/redirect cleanup failed: ${error.message}`); }
    try {
      if (process.env.REVOKE_PLATFORM_ADMIN) execFileSync('/bin/sh', ['-c', `${process.env.REVOKE_PLATFORM_ADMIN} "$1"`, 'revoke-site-operator', phone], { stdio: 'pipe' });
      else if (!process.env.GRANT_PLATFORM_ADMIN) execFileSync(process.execPath, [fileURLToPath(new URL('../../../api/dist/cli/platform-admin.js', import.meta.url)), 'revoke', phone], { stdio: 'pipe' });
    } catch (error) { check(false, `Temporary operator privilege cleanup failed: ${error.message}`); }
  }
}
await finish(browser);

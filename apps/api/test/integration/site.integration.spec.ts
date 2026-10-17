import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PublishedSiteDocument, SiteContent, SiteDocument, SiteDocumentInput, SiteMedia, SiteRevision, SiteSubmission } from '@taskin/contracts';
import { bearer, createTestApp, ownerWithWorkspace, randomIp, randomPhone, type Session, signIn, type TestApp, withAdminPassword } from './harness.js';
import { expectStatus } from './work-helpers.js';

const PUBLIC = '/api/v1/public/site';
const ADMIN = '/api/v1/admin/site';
const ORIGIN = 'https://app.taskin.test';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const slug = () => `cms-${randomUUID()}`;
const draft = (title = 'صفحه آزمایشی مدیریت وب‌سایت'): SiteContent => ({
  title, description: 'توضیح فارسی یک صفحه برای بررسی انتشار مستقل پیش‌نویس.',
  sections: [{ id: 'hero', type: 'hero', title, description: 'محتوایی که تنها پس از انتشار در دسترس عموم قرار می‌گیرد.', cta: { label: 'شروع', href: '/feed' }, visible: true, sortOrder: 0 }],
  seo: { title: `${title} | تسک‌دون`, description: 'توضیحات اختصاصی موتور جست‌وجو', noIndex: false }, data: {},
});
const submission = (extra: Record<string, unknown> = {}) => ({
  kind: 'contact', fullName: 'کاربر فرم عمومی', email: `${randomUUID()}@example.test`,
  subject: 'پرسش درباره محصول', message: 'می‌خواهم درباره مدیریت کارهای تیم با تسک‌دون بیشتر بدانم.', consent: true, ...extra,
});

describe('Platform site CMS: persistence, publication and isolation', () => {
  let t: TestApp;
  let operator: Session;
  let operatorFresh: Session;
  let workspaceOwner: Session;
  let workspaceId: string;

  const csrf = (as = operator) => ({ ...bearer(as), Cookie: as.cookies, 'X-CSRF-Token': as.csrf, Origin: ORIGIN });
  const get = (path: string, as = operator) => t.http().get(`${ADMIN}${path}`).set(bearer(as));
  const post = (path: string, body: object = {}) => t.http().post(`${ADMIN}${path}`).set(csrf()).send(body);
  const put = (path: string, body: object) => t.http().put(`${ADMIN}${path}`).set(csrf()).send(body);
  const patch = (path: string, body: object) => t.http().patch(`${ADMIN}${path}`).set(csrf()).send(body);
  const create = async (input: Partial<SiteDocumentInput> = {}): Promise<SiteDocument> => {
    const response = await post('/documents', { kind: 'page', slug: slug(), draft: draft(), ...input });
    expectStatus(response, 201);
    return response.body as SiteDocument;
  };
  const anonymousSql = async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await t.appPool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.user_id', '', true), set_config('app.workspace_id', '', true)");
      return await work(client);
    } finally {
      await client.query('rollback');
      client.release();
    }
  };

  beforeAll(async () => {
    t = await createTestApp();
    operatorFresh = await signIn(t, randomPhone(), 'مدیر وب‌سایت');
    operator = await withAdminPassword(t, operatorFresh);
    await t.admin.query('update users set is_platform_admin = true where id = $1', [operator.userId]);
    const team = await ownerWithWorkspace(t, 'فضای خصوصی آزمون وب‌سایت');
    workspaceOwner = team.owner;
    workspaceId = team.workspace.id;
  });
  afterAll(async () => { await t?.close(); });

  it('serves seeded Persian content without authentication and keeps legal drafts private', async () => {
    const home = await t.http().get(`${PUBLIC}/pages/home`);
    expectStatus(home, 200);
    expect(home.body).toMatchObject({ kind: 'page', slug: 'home', title: 'همه کارهای تیمت، یک‌جا و منظم' });
    expect((home.body as PublishedSiteDocument).sections.length).toBeGreaterThan(6);
    expect(home.body).not.toHaveProperty('draft');
    expect(home.body).not.toHaveProperty('createdBy');
    for (const legal of ['terms', 'privacy']) expectStatus(await t.http().get(`${PUBLIC}/pages/${legal}`), 404);
    const all = await t.http().get(`${PUBLIC}/documents`);
    expectStatus(all, 200);
    expect((all.body as PublishedSiteDocument[]).some((item) => ['terms', 'privacy'].includes(item.slug))).toBe(false);
    const settings = await t.http().get(`${PUBLIC}/settings`);
    expectStatus(settings, 200);
    expect(settings.body.data).toMatchObject({ siteName: 'تسک‌دون', primaryCta: { href: '/feed' } });
  });

  it('preserves platform authorization, password step-up and CSRF protection', async () => {
    expectStatus(await t.http().get(`${ADMIN}/documents`), 401);
    expectStatus(await get('/documents', workspaceOwner), 404);
    const fresh = await get('/documents', operatorFresh);
    expectStatus(fresh, 401);
    expect(fresh.body.code).toBe('STEP_UP_REQUIRED');
    const body = { kind: 'page', slug: slug(), draft: draft() };
    expectStatus(await t.http().post(`${ADMIN}/documents`).set(bearer(operator)).send(body), 403);
    expectStatus(await t.http().post(`${ADMIN}/documents`).set({ ...csrf(), Origin: 'https://attacker.example' }).send(body), 403);
    expectStatus(await t.http().post(`${ADMIN}/documents`).set({ ...csrf(), 'X-CSRF-Token': 'incorrect' }).send(body), 403);
    expectStatus(await t.http().post(`${ADMIN}/documents`).set(csrf(workspaceOwner)).send(body), 404);
  });

  it('publishes explicitly, keeps new drafts private, redirects changed slugs and restores revisions without publishing', async () => {
    const created = await create();
    const originalSlug = created.slug;
    expectStatus(await t.http().get(`${PUBLIC}/pages/${originalSlug}`), 404);
    expectStatus(await t.http().get(`${ADMIN}/documents/${created.id}/preview`), 401);
    expectStatus(await get(`/documents/${created.id}/preview`, workspaceOwner), 404);
    const preview = await get(`/documents/${created.id}/preview`);
    expectStatus(preview, 200);
    expect(preview.headers['cache-control']).toContain('no-store');
    expect(preview.body.draft.title).toBe(created.draft.title);

    const published = await post(`/documents/${created.id}/publish`);
    expectStatus(published, 200);
    const publicBefore = await t.http().get(`${PUBLIC}/pages/${originalSlug}`);
    expectStatus(publicBefore, 200);
    const publicVersion = publicBefore.body.version as number;
    const edited = draft('عنوان جدید که هنوز منتشر نشده است');
    const updated = await put(`/documents/${created.id}`, { kind: created.kind, slug: originalSlug, draft: edited, version: published.body.version });
    expectStatus(updated, 200);
    const publicAfter = await t.http().get(`${PUBLIC}/pages/${originalSlug}`);
    expect(publicAfter.body.title).toBe(created.draft.title);
    expect(publicAfter.body.version).toBe(publicVersion);
    expect(publicAfter.body.updatedAt).toBe(publicBefore.body.updatedAt);
    const reloaded = await get(`/documents/${created.id}`);
    expect(reloaded.body.draft.title).toBe(edited.title);

    const renamed = slug();
    const saved = await put(`/documents/${created.id}`, { kind: created.kind, slug: renamed, draft: edited, version: updated.body.version });
    expectStatus(saved, 200);
    expectStatus(await t.http().get(`${PUBLIC}/pages/${originalSlug}`), 200);
    expectStatus(await t.http().get(`${PUBLIC}/pages/${renamed}`), 404);
    expectStatus(await post(`/documents/${created.id}/publish`), 200);
    expectStatus(await t.http().get(`${PUBLIC}/pages/${originalSlug}`), 404);
    const publicRenamed = await t.http().get(`${PUBLIC}/pages/${renamed}`);
    expect(publicRenamed.body.title).toBe(edited.title);
    const redirect = await t.http().get(`${PUBLIC}/redirects`).query({ fromPath: `/${originalSlug}` });
    expectStatus(redirect, 200);
    expect(redirect.body).toMatchObject({ fromPath: `/${originalSlug}`, toPath: `/${renamed}` });

    const history = await get(`/documents/${created.id}/revisions`);
    expectStatus(history, 200);
    const initial = (history.body as SiteRevision[]).find((entry) => entry.action === 'create');
    expect(initial).toBeDefined();
    expectStatus(await post(`/documents/${created.id}/restore`, { revisionId: initial!.id }), 200);
    expect((await t.http().get(`${PUBLIC}/pages/${renamed}`)).body.title).toBe(edited.title);
    expectStatus(await t.http().get(`${PUBLIC}/pages/${originalSlug}`), 404);
    expect((await get(`/documents/${created.id}`)).body.draft.title).toBe(created.draft.title);
    expectStatus(await post(`/documents/${created.id}/publish`), 200);
    expect((await t.http().get(`${PUBLIC}/pages/${originalSlug}`)).body.title).toBe(created.draft.title);
    expectStatus(await post(`/documents/${created.id}/archive`), 200);
    expectStatus(await t.http().get(`${PUBLIC}/pages/${originalSlug}`), 404);
  });

  it('rejects stale saves and cross-document revision restoration', async () => {
    const first = await create();
    const second = await create();
    expectStatus(await put(`/documents/${first.id}`, { kind: first.kind, slug: first.slug, draft: draft('ویرایش نخست'), version: first.version }), 200);
    const stale = await put(`/documents/${first.id}`, { kind: first.kind, slug: first.slug, draft: draft('ویرایش قدیمی'), version: first.version });
    expectStatus(stale, 412);
    const revisions = await get(`/documents/${second.id}/revisions`);
    expectStatus(await post(`/documents/${first.id}/restore`, { revisionId: (revisions.body as SiteRevision[])[0]!.id }), 404);
    expect((await get(`/documents/${first.id}`)).body.draft.title).toBe('ویرایش نخست');
  });

  it('requires legal approval and meaningful alternative text before publishing', async () => {
    const legal = await get('/documents').query({ kind: 'page', q: 'privacy' });
    const privacy = (legal.body as SiteDocument[]).find((entry) => entry.slug === 'privacy');
    expect(privacy).toBeDefined();
    expectStatus(await post(`/documents/${privacy!.id}/publish`), 400);
    const content = draft();
    content.sections[0]!.media = { src: '/product.png', alt: '' };
    const page = await create({ draft: content });
    expectStatus(await post(`/documents/${page.id}/publish`), 400);
    expectStatus(await t.http().get(`${PUBLIC}/pages/${page.slug}`), 404);
  });

  it('rejects duplicate section IDs, HTML, unsafe URLs and sensitive public data fields', async () => {
    const cases: SiteContent[] = [];
    const duplicated = draft(); duplicated.sections.push({ ...duplicated.sections[0]! }); cases.push(duplicated);
    cases.push({ ...draft(), title: '<script>alert(1)</script>' });
    const unsafeCta = draft(); unsafeCta.sections[0]!.cta = { label: 'خطرناک', href: 'javascript:alert(1)' }; cases.push(unsafeCta);
    const unsafeData = draft(); unsafeData.data = { header: [{ label: 'پیوند', href: '//attacker.example' }] }; cases.push(unsafeData);
    cases.push({ ...draft(), data: { apiKey: 'must-never-be-public' } });
    for (const content of cases) {
      const response = await post('/documents', { kind: 'page', slug: slug(), draft: content });
      expectStatus(response, 400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    }
  });

  it('keeps pricing linked to real plan IDs and paid prices subject to explicit approval', async () => {
    const plans = await t.http().get(`${PUBLIC}/pricing`);
    expectStatus(plans, 200);
    const data = (plans.body as PublishedSiteDocument[]).map((entry) => entry.data);
    expect(data.map((plan) => plan.planId).sort()).toEqual(['enterprise', 'free', 'team']);
    expect(data.find((plan) => plan.planId === 'free')?.price).toBe(0);
    for (const plan of data.filter((entry) => entry.planId !== 'free')) {
      expect(plan.price).toBeUndefined();
      expect(plan.cta).toMatchObject({ href: '/demo-request' });
    }
    const content = { ...draft(), data: { planId: 'invented', currency: 'IRR', features: [], cta: { label: 'درخواست', href: '/contact' } } };
    expectStatus(await post('/documents', { kind: 'pricing', slug: slug(), draft: content }), 400);
    content.data.planId = 'team';
    expectStatus(await post('/documents', { kind: 'pricing', slug: slug(), draft: { ...content, data: { ...content.data, price: 123456 } } }), 400);
    const runtimePlans = await t.admin.query<{ id: string }>('select id from plans order by id');
    expect(runtimePlans.rows.map((plan) => plan.id)).toEqual(['enterprise', 'free', 'team']);
  });

  it('stores public form submissions and exposes their status and internal notes only to platform admins', async () => {
    const email = `${randomUUID()}@example.test`;
    const body = submission({ email, kind: 'demo', company: 'تیم آزمایشی', teamSize: '۶ تا ۱۰ نفر' });
    const sent = await t.http().post(`${PUBLIC}/submissions`).set('X-Forwarded-For', randomIp()).set('Origin', ORIGIN).send(body);
    expectStatus(sent, 201);
    expect(sent.body).toEqual({ id: expect.any(String), received: true });
    const id = sent.body.id as string;
    const persisted = await t.admin.query<{ payload: typeof body }>('select payload from site_submissions where id = $1', [id]);
    expect(persisted.rows[0]?.payload).toMatchObject(body);
    expectStatus(await t.http().get(`${ADMIN}/submissions/${id}`), 401);
    expectStatus(await get(`/submissions/${id}`, workspaceOwner), 404);
    const inbox = await get('/submissions').query({ kind: 'demo', q: email, page: '1', limit: '1' });
    expectStatus(inbox, 200);
    expect(inbox.body).toMatchObject({ total: 1, page: 1, limit: 1, items: [expect.objectContaining({ id, status: 'new' })] });
    const updated = await patch(`/submissions/${id}`, { status: 'in-progress', notes: 'یادداشت خصوصی مدیر؛ برای هماهنگی بررسی شود.' });
    expectStatus(updated, 200);
    expect(updated.body.status).toBe('in-progress');
    const reloaded = await get(`/submissions/${id}`);
    expect((reloaded.body as SiteSubmission).notes).toBe(updated.body.notes);
    const publicContent = await t.http().get(`${PUBLIC}/documents`);
    expect(JSON.stringify(publicContent.body)).not.toContain(email);
    expect(JSON.stringify(publicContent.body)).not.toContain(updated.body.notes as string);
    expectStatus(await t.http().get(`${PUBLIC}/submissions/${id}`), 404);
  });

  it('validates consent, contact details, spam honeypots and request origins on the server', async () => {
    const cases = [submission({ consent: false }), submission({ email: undefined }), submission({ website: 'https://spam.example' }), submission({ message: '<img src=x onerror=alert(1)>' }), submission({ email: 'invalid' })];
    for (const body of cases) expectStatus(await t.http().post(`${PUBLIC}/submissions`).set('X-Forwarded-For', randomIp()).send(body), 400);
    const foreign = await t.http().post(`${PUBLIC}/submissions`).set('X-Forwarded-For', randomIp()).set('Origin', 'https://attacker.example').send(submission());
    expectStatus(foreign, 403);
  });

  it('limits a public client to five submissions in the rate-limit window', async () => {
    const ip = randomIp();
    for (let index = 0; index < 5; index += 1) expectStatus(await t.http().post(`${PUBLIC}/submissions`).set('X-Forwarded-For', ip).send(submission()), 201);
    const limited = await t.http().post(`${PUBLIC}/submissions`).set('X-Forwarded-For', ip).send(submission());
    expectStatus(limited, 429);
    expect(limited.headers['retry-after']).toBe('900');
  });

  it('accepts job applications only for a published opening', async () => {
    const position = await create({ kind: 'job', draft: { ...draft('موقعیت آزمایشی خصوصی'), data: { employmentType: 'آزمایشی', location: 'آزمون', requirements: ['این موقعیت فقط داده آزمون خودکار است.'] } } });
    const application = submission({ kind: 'application', jobId: position.id });
    expectStatus(await t.http().post(`${PUBLIC}/submissions`).set('X-Forwarded-For', randomIp()).send(application), 400);
    expectStatus(await post(`/documents/${position.id}/publish`), 200);
    expectStatus(await t.http().post(`${PUBLIC}/submissions`).set('X-Forwarded-For', randomIp()).send(application), 201);
    expectStatus(await post(`/documents/${position.id}/archive`), 200);
    expectStatus(await t.http().post(`${PUBLIC}/submissions`).set('X-Forwarded-For', randomIp()).send(application), 400);
  });

  it('enforces RLS for anonymous readers and writers independently of HTTP guards', async () => {
    const page = await create();
    const privateRows = await anonymousSql(async (client) => ({
      drafts: (await client.query('select id from site_documents where id = $1', [page.id])).rows,
      revisions: (await client.query('select id from site_revisions')).rows,
      submissions: (await client.query('select id from site_submissions')).rows,
      audit: (await client.query('select id from site_audit_log')).rows,
      update: (await client.query("update site_documents set slug = 'anonymous-tamper' where id = $1", [page.id])).rowCount,
    }));
    expect(privateRows).toEqual({ drafts: [], revisions: [], submissions: [], audit: [], update: 0 });
    const rawPublished = await anonymousSql((client) => client.query("select draft from site_documents where published_slug = 'home'"));
    expect(rawPublished.rows).toEqual([]);
    const home = await t.http().get(`${PUBLIC}/pages/home`);
    expect(home.body.title).toBe('همه کارهای تیمت، یک‌جا و منظم');
    await expect(anonymousSql((client) => client.query('delete from site_documents where id = $1', [page.id]))).rejects.toMatchObject({ code: '42501' });
  });

  it('uploads real public media, validates bytes and protects published references from archival', async () => {
    const planned = await post('/media', { filename: 'cms-test.png', contentType: 'image/png', size: PNG.length, alt: 'تصویر یک پیکسل برای آزمون کتابخانه رسانه' });
    expectStatus(planned, 201);
    const { media, upload } = planned.body as { media: SiteMedia; upload: { url: string; fields: Record<string, string> } };
    expectStatus(await t.http().get(`${PUBLIC}/media/${media.id}`), 404);
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
    form.append('Content-Type', 'image/png');
    form.append('file', new Blob([PNG], { type: 'image/png' }), 'cms-test.png');
    expect((await fetch(upload.url, { method: 'POST', body: form })).status).toBeLessThan(300);
    expectStatus(await post(`/media/${media.id}/complete`), 200);
    const publicImage = await t.http().get(`${PUBLIC}/media/${media.id}`).redirects(0);
    expectStatus(publicImage, 302);
    const bytes = await fetch(publicImage.headers.location as string);
    expect(bytes.status).toBe(200);
    expect(Buffer.from(await bytes.arrayBuffer()).equals(PNG)).toBe(true);
    const content = draft(); content.sections[0]!.media = { src: media.src, alt: media.alt };
    const page = await create({ draft: content });
    expectStatus(await post(`/documents/${page.id}/publish`), 200);
    expectStatus(await patch(`/media/${media.id}`, { archive: true }), 409);
    const listed = await get('/media').query({ q: 'cms-test' });
    expect((listed.body as SiteMedia[]).some((item) => item.id === media.id)).toBe(true);
    expectStatus(await post(`/documents/${page.id}/unpublish`), 200);
    expectStatus(await patch(`/media/${media.id}`, { archive: true }), 200);
    expectStatus(await t.http().get(`${PUBLIC}/media/${media.id}`), 404);
    // A marketing asset ID must never become a private workspace attachment ID.
    expectStatus(await t.http().get(`/api/v1/workspaces/${workspaceId}/files/${media.id}/link`).set(bearer(workspaceOwner)), 404);
  });

  it('rejects forged media signatures and unsafe media declarations', async () => {
    expectStatus(await post('/media', { filename: '../private.svg', contentType: 'image/svg+xml', size: 20, alt: 'نامعتبر' }), 400);
    const planned = await post('/media', { filename: 'forged.png', contentType: 'image/png', size: PNG.length, alt: 'فایل نامعتبر آزمون' });
    expectStatus(planned, 201);
    const { media, upload } = planned.body as { media: SiteMedia; upload: { url: string; fields: Record<string, string> } };
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
    form.append('Content-Type', 'image/png');
    form.append('file', new Blob([Buffer.alloc(PNG.length, 65)], { type: 'image/png' }), 'forged.png');
    expect((await fetch(upload.url, { method: 'POST', body: form })).status).toBeLessThan(300);
    expectStatus(await post(`/media/${media.id}/complete`), 422);
    expectStatus(await t.http().get(`${PUBLIC}/media/${media.id}`), 404);
  });

  it('prevents redirect loops and a redirect from replacing a published page', async () => {
    const fromPath = `/${slug()}`;
    const toPath = `/${slug()}`;
    const created = await post('/redirects', { fromPath, toPath });
    expectStatus(created, 201);
    expectStatus(await post('/redirects', { fromPath: toPath, toPath: fromPath }), 400);
    expectStatus(await post('/redirects', { fromPath: '/features', toPath }), 409);
    expectStatus(await post('/redirects', { fromPath, toPath: '//attacker.example' }), 400);
    expectStatus(await t.http().delete(`${ADMIN}/redirects/${created.body.id}`).set(csrf()), 204);
    const missing = await t.http().get(`${PUBLIC}/redirects`).query({ fromPath });
    expectStatus(missing, 200);
    expect(missing.text === '' || missing.body === null).toBe(true);
  });

  it('records actor-attributed publishing, preview, submission and media audit events', async () => {
    const activity = await get('/activity');
    expectStatus(activity, 200);
    const rows = activity.body as { action: string; actorId: string }[];
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((entry) => entry.actorId === operator.userId)).toBe(true);
    const actions = new Set(rows.map((entry) => entry.action));
    for (const action of ['site.document.create', 'site.document.save', 'site.document.publish', 'site.document.restore', 'site.document.archive', 'site.document.preview', 'site.submission.update', 'site.media.complete', 'site.media.archive']) expect(actions.has(action)).toBe(true);
  });
});

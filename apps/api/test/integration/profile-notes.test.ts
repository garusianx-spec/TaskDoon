import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MemberView, NoteCategoryView, NoteView, WorkspaceView } from '@taskin/contracts';
import { addMember, bearer, createTestApp, idempotencyKey, ownerWithWorkspace, type Session, type TestApp } from './harness.js';
import { expectStatus, wsPath } from './work-helpers.js';

describe('profile name and categorized note persistence', () => {
  let t: TestApp;
  let owner: Session;
  let member: Session;
  let workspace: WorkspaceView;
  const base = () => wsPath(workspace.id);
  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    member = await addMember(t, owner, workspace.id, 'member');
  });
  afterAll(async () => { await t?.close(); });

  it('lets a regular member edit only their own name and immediately returns it in the directory', async () => {
    const before = await t.http().get('/api/v1/me').set(bearer(owner));
    const response = await t.http().patch('/api/v1/me').set(bearer(member)).send({ fullName: '  نسیم رحیمی  ' });
    expectStatus(response, 200);
    expect(response.body).toMatchObject({ id: member.userId, fullName: 'نسیم رحیمی' });
    expect((await t.http().get('/api/v1/me').set(bearer(member))).body.user.fullName).toBe('نسیم رحیمی');
    const directory = await t.http().get(`${base()}/members`).set(bearer(owner));
    expect((directory.body as MemberView[]).find(user => user.userId === member.userId)?.fullName).toBe('نسیم رحیمی');
    expect((await t.http().get('/api/v1/me').set(bearer(owner))).body.user.fullName).toBe(before.body.user.fullName);
    const audit = await t.admin.query('select resource_id from audit_logs where action = $1 and resource_id = $2', ['user.profile.update', member.userId]);
    expect(audit.rows).toHaveLength(1);
    expectStatus(await t.http().patch('/api/v1/me').set(bearer(member)).send({ fullName: 'نام بیگانه', userId: owner.userId }), 400);
  });

  it('rejects invalid and unauthenticated name writes without changing persisted identity', async () => {
    for (const fullName of ['  ', ' ن ', null, 12, 'ن'.repeat(81)]) {
      expectStatus(await t.http().patch('/api/v1/me').set(bearer(member)).send({ fullName }), 400);
    }
    expectStatus(await t.http().patch('/api/v1/me').send({ fullName: 'نام تازه' }), 401);
    expect((await t.http().get('/api/v1/me').set(bearer(member))).body.user.fullName).toBe('نسیم رحیمی');
  });

  it('persists every built-in category and an explicit uncategorized note with idempotent creation', async () => {
    const categories = (await t.http().get(`${base()}/note-categories`).set(bearer(owner))).body as NoteCategoryView[];
    expect(categories.map(category => category.key)).toEqual(['personal', 'work', 'ideas', 'meetings']);
    for (const categoryId of [...categories.map(category => category.id), null]) {
      const command = idempotencyKey();
      const body = { title: `ثبت دسته ${categoryId ?? 'none'}`, body: 'متن یادداشت ذخیره‌شده', categoryId };
      const create = () => t.http().post(`${base()}/notes`).set(bearer(owner)).set('Idempotency-Key', command).send(body);
      const first = await create();
      expectStatus(first, 201);
      const note = first.body as NoteView;
      expect(note.categoryId).toBe(categoryId);
      expect((await create()).body.id).toBe(note.id);
      const read = await t.http().get(`${base()}/notes/${note.id}`).set(bearer(owner));
      expect(read.body).toMatchObject({ categoryId, title: body.title, body: body.body });
      const row = await t.admin.query('select owner_id, workspace_id, category_id from notes where id = $1', [note.id]);
      expect(row.rows).toEqual([{ owner_id: owner.userId, workspace_id: workspace.id, category_id: categoryId }]);
    }
  });

  it('enforces private categories and workspace boundaries on create, save and reads', async () => {
    const ownCategories = (await t.http().get(`${base()}/note-categories`).set(bearer(owner))).body as NoteCategoryView[];
    const memberCategories = (await t.http().get(`${base()}/note-categories`).set(bearer(member))).body as NoteCategoryView[];
    const other = await ownerWithWorkspace(t);
    const foreignCategories = (await t.http().get(`${wsPath(other.workspace.id)}/note-categories`).set(bearer(other.owner))).body as NoteCategoryView[];
    const created = await t.http().post(`${base()}/notes`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ title: 'یادداشت خصوصی', categoryId: ownCategories[0]!.id });
    expectStatus(created, 201);
    const note = created.body as NoteView;
    for (const categoryId of [memberCategories[0]!.id, foreignCategories[0]!.id]) {
      expectStatus(await t.http().post(`${base()}/notes`).set(bearer(owner)).set('Idempotency-Key', idempotencyKey()).send({ title: 'غیرمجاز', categoryId }), 400);
      expectStatus(await t.http().patch(`${base()}/notes/${note.id}`).set(bearer(owner)).set('If-Match', `"${note.version}"`).send({ categoryId }), 400);
    }
    expectStatus(await t.http().get(`${base()}/notes/${note.id}`).set(bearer(member)), 404);
    expectStatus(await t.http().patch(`${base()}/notes/${note.id}`).set(bearer(member)).set('If-Match', `"${note.version}"`).send({ body: 'غیرمجاز' }), 404);
    expectStatus(await t.http().get(`${wsPath(other.workspace.id)}/notes/${note.id}`).set(bearer(other.owner)), 404);
    const unchanged = await t.http().get(`${base()}/notes/${note.id}`).set(bearer(owner));
    expect(unchanged.body).toMatchObject({ version: note.version, categoryId: ownCategories[0]!.id, body: '' });
  });
});

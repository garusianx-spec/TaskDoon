import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, idempotencyKey, randomPhone, type Session, signIn, type TestApp, withAdminPassword } from './harness.js';

describe('M1 checklist: idempotency keys', () => {
  let t: TestApp;
  let owner: Session;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await withAdminPassword(t, await signIn(t, randomPhone()));
  });
  afterAll(async () => {
    await t?.close();
  });

  const create = (key: string | undefined, name: string) => {
    const request = t.http().post('/api/v1/workspaces').set(bearer(owner));
    return (key ? request.set('Idempotency-Key', key) : request).send({ name });
  };
  const workspacesNamed = async (name: string) =>
    Number((await t.admin.query<{ count: string }>('select count(*) from workspaces where name = $1', [name])).rows[0]?.count);

  it('requires the header on idempotent routes', async () => {
    const response = await create(undefined, 'بدون کلید');
    expect(response.status).toBe(428);
    expect(response.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('replays the stored response for a retry, without doing the work twice', async () => {
    const key = idempotencyKey();
    const first = await create(key, 'تکرارپذیر');
    const retry = await create(key, 'تکرارپذیر');
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body).toEqual(first.body);
    expect(await workspacesNamed('تکرارپذیر')).toBe(1);
  });

  it('refuses the same key for a different request', async () => {
    const key = idempotencyKey();
    expect((await create(key, 'نخست')).status).toBe(201);
    const other = await create(key, 'دیگر');
    expect(other.status).toBe(422);
    expect(other.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await workspacesNamed('دیگر')).toBe(0);
  });

  it('tells a concurrent duplicate to wait while the original is in flight', async () => {
    const key = idempotencyKey();
    const [a, b] = await Promise.all([create(key, 'همزمان'), create(key, 'همزمان')]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    // One does the work; the duplicate either saw the reservation (409) or arrived after
    // completion (a 201 replay).
    expect(statuses[0]).toBe(201);
    expect([201, 409]).toContain(statuses[1]);
    if (statuses[1] === 409) expect([a, b].find((r) => r.status === 409)?.headers['retry-after']).toBe('1');
    expect(await workspacesNamed('همزمان')).toBe(1);
  });

  it('answers 409 for a reservation that is still in progress', async () => {
    const key = idempotencyKey();
    // A reservation held by another in-flight attempt of the same request.
    const body = { params: {}, query: {}, body: { name: 'در جریان' } };
    const { canonicalJson } = await import('../../src/platform/http/idempotency.js');
    const { sha256 } = await import('../../src/platform/crypto/crypto.js');
    await t.admin.query(
      `insert into idempotency_keys (user_id, scope, key, request_hash, state, expires_at)
       values ($1, 'POST /api/v1/workspaces', $2, $3, 'in_progress', now() + interval '1 day')`,
      [owner.userId, key, sha256(canonicalJson(body))],
    );
    const response = await create(key, 'در جریان');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('IDEMPOTENCY_IN_PROGRESS');
  });

  it('releases the key when the request fails, so a corrected retry can use it', async () => {
    const key = idempotencyKey();
    const invalid = await t.http().post('/api/v1/workspaces').set(bearer(owner)).set('Idempotency-Key', key).send({ name: 'x'.repeat(41) });
    expect(invalid.status).toBe(400);
    const plain = await signIn(t, randomPhone());
    const noPassword = await t.http().post('/api/v1/workspaces').set(bearer(plain)).set('Idempotency-Key', key).send({ name: 'بدون رمز' });
    expect(noPassword.body.code).toBe('PASSWORD_REQUIRED');
    const { rows } = await t.admin.query('select 1 from idempotency_keys where key = $1', [key]);
    expect(rows).toHaveLength(0);
  });
});

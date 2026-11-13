import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecretBox } from '../../src/platform/crypto/crypto.js';
import {
  bearer,
  createTestApp,
  idempotencyKey,
  invitationToken,
  localForm,
  ownerWithWorkspace,
  randomPhone,
  signIn,
  type TestApp,
} from './harness.js';

describe('combined invitation creation contract audit', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ PUBLIC_WEB_ORIGIN: 'https://taskdoone.ir' });
  });
  afterAll(async () => {
    await t?.close();
  });

  it('queues the supplied name and a sealed canonical invitation link', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t);
    const phone = randomPhone();
    const key = idempotencyKey();
    const body = { recipients: [{ address: localForm(phone), name: '  همکار نمونه  ' }], role: 'member' };
    const response = await t
      .http()
      .post(`/api/v1/workspaces/${workspace.id}/invitations`)
      .set(bearer(owner))
      .set('Idempotency-Key', key)
      .send(body);
    expect(response.status).toBe(201);
    const result = await t.admin.query(
      `select payload from outbox_events where aggregate_id = $1 and event_type = 'notification.sms'`,
      [response.body.created[0].id],
    );
    const payload = result.rows[0]?.payload as { template: string; tokens: Record<string, string> };
    expect(payload.template).toBe('invite');
    expect(Object.keys(payload.tokens).sort()).toEqual(['link', 'name', 'workspace']);
    expect(payload.tokens.name).toBe('همکار نمونه');
    expect(payload.tokens.workspace).toBe(workspace.name);
    const link = new URL(new SecretBox(t.env.APP_ENCRYPTION_KEY).open(payload.tokens.link!));
    expect(link.origin).toBe('https://taskdoone.ir');
    expect(link.pathname).toMatch(/^\/invite\/[A-Za-z0-9_-]+$/);
    expect(link.search).toBe('');
    expect(link.hash).toBe('');
    const token = invitationToken(link.toString());
    expect(JSON.stringify(payload)).not.toContain(token);
    const replay = await t
      .http()
      .post(`/api/v1/workspaces/${workspace.id}/invitations`)
      .set(bearer(owner))
      .set('Idempotency-Key', key)
      .send(body);
    expect(replay.status).toBe(201);
    expect(replay.body.created[0].id).toBe(response.body.created[0].id);
    await t.flushNotifications();
    const sms = t.sms.lastTo(phone)!;
    expect(sms.tokens).toEqual({ name: 'همکار نمونه', workspace: workspace.name, link: link.toString() });
    expect(sms.text).toContain('همکار نمونه عزیز،');
    const other = await signIn(t, randomPhone());
    const wrong = await t.http().post('/api/v1/invitations/accept').set(bearer(other)).send({ token });
    expect(wrong.body.code).toBe('INVITATION_ADDRESS_MISMATCH');
    const invitee = await signIn(t, phone);
    const accept = () => t.http().post('/api/v1/invitations/accept').set(bearer(invitee)).send({ token });
    expect((await accept()).body).toEqual({ workspaceId: workspace.id, role: 'member' });
    expect((await accept()).body.code).toBe('INVITATION_INVALID');
  });

  it.each([undefined, '   '])(
    'preserves unnamed recipients without substituting a name (%s)',
    async (name) => {
      const { owner, workspace } = await ownerWithWorkspace(t);
      const phone = randomPhone();
      const response = await t
        .http()
        .post(`/api/v1/workspaces/${workspace.id}/invitations`)
        .set(bearer(owner))
        .set('Idempotency-Key', idempotencyKey())
        .send({ recipients: [{ address: localForm(phone), name }], role: 'member' });
      expect(response.status).toBe(201);
      await t.flushNotifications();
      const sms = t.sms.lastTo(phone)!;
      expect(Object.keys(sms.tokens).sort()).toEqual(['link', 'workspace']);
      expect(sms.text).toBe(
        `شما به فضای کاری «${workspace.name}» در تسک‌دون دعوت شده‌اید: ${sms.tokens.link}`,
      );
    },
  );

  it.each(['x'.repeat(121), 'نام\nنام', 123])('rejects malformed recipient names', async (name) => {
    const { owner, workspace } = await ownerWithWorkspace(t);
    const response = await t
      .http()
      .post(`/api/v1/workspaces/${workspace.id}/invitations`)
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .send({ recipients: [{ address: localForm(randomPhone()), name }], role: 'member' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });
});

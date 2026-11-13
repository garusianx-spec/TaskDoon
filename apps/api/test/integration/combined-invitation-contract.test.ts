import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecretBox } from '../../src/platform/crypto/crypto.js';
import {
  bearer,
  createTestApp,
  idempotencyKey,
  localForm,
  ownerWithWorkspace,
  randomPhone,
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

  it('records the actual queue contract without inventing an invitee name or rewriting existing invitation links', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t);
    const response = await t
      .http()
      .post(`/api/v1/workspaces/${workspace.id}/invitations`)
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .send({ recipients: [{ address: localForm(randomPhone()) }], role: 'member' });
    expect(response.status).toBe(201);
    const result = await t.admin.query(
      `select payload from outbox_events where aggregate_id = $1 and event_type = 'notification.sms'`,
      [response.body.created[0].id],
    );
    const payload = result.rows[0]?.payload as { template: string; tokens: Record<string, string> };
    expect(payload.template).toBe('invite');
    expect(Object.keys(payload.tokens).sort()).toEqual(['link', 'workspace']);
    expect(payload.tokens.workspace).toBe(workspace.name);
    const link = new URL(new SecretBox(t.env.APP_ENCRYPTION_KEY).open(payload.tokens.link!));
    expect(link.origin).toBe('https://taskdoone.ir');
    expect(link.pathname).toBe('/invite');
    expect(link.searchParams.has('token')).toBe(true);
    // These are verified release-contract gaps, not a passing assertion of the requested format:
    expect('name' in payload.tokens).toBe(false);
    expect(/^\/invite\/[^/]+$/.test(link.pathname)).toBe(false);
  });
});

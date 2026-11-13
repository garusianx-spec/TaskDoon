import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InvitationView, WorkspaceView } from '@taskin/contracts';
import { AppConfig } from '../../src/config/app-config.js';
import { SmsService } from '../../src/platform/sms/sms.js';
import { InvitationSmsProcessor } from '../../src/platform/sms/invitation-sms-processor.js';
import { OutboxRelay } from '../../src/platform/outbox/outbox-relay.js';
import { Queues, type NotificationJobData } from '../../src/platform/queue/queues.js';
import { QueueWorkers } from '../../src/worker/workers.js';
import {
  bearer,
  createTestApp,
  idempotencyKey,
  invitationToken,
  localForm,
  ownerWithWorkspace,
  randomPhone,
  signIn,
  type Session,
  type TestApp,
} from './harness.js';

describe('invitation-only SMS.ir attempt lifecycle', () => {
  let t: TestApp;
  let owner: Session;
  let workspace: WorkspaceView;
  const refused = new Set<string>();
  const sent: { mobile: string; parameters: { name: string; value: string }[] }[] = [];
  let reportState: number | null = null;
  let reportMatches = true;

  beforeAll(async () => {
    t = await createTestApp();
    ({ owner, workspace } = await ownerWithWorkspace(t));
    const sms = t.app.get(SmsService);
    const original = sms.send.bind(sms);
    const configured = new SmsService(
      new AppConfig({
        ...t.env,
        SMS_PROVIDERS: ['smsir'],
        SMSIR_API_KEY: 'synthetic',
        SMSIR_INVITE_TEMPLATE_ID: 30303,
      }),
    );
    vi.spyOn(sms, 'send').mockImplementation((message) =>
      message.template === 'invite' ? configured.send(message) : original(message),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url === 'https://api.sms.ir/v1/send/verify') {
          const body = JSON.parse(String(options?.body)) as (typeof sent)[number];
          sent.push(body);
          return {
            ok: true,
            json: async () => ({
              status: refused.has(body.mobile) ? 0 : 1,
              data: { messageId: sent.length },
            }),
          };
        }
        const id = Number(url.split('/').at(-1));
        return {
          ok: true,
          json: async () => ({
            status: 1,
            data: {
              messageId: reportMatches ? id : id + 1,
              deliveryState: reportState,
              deliveryDateTime: reportState === 1 ? 1794528000 : null,
            },
          }),
        };
      }),
    );
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await t?.close();
  });

  const base = () => `/api/v1/workspaces/${workspace.id}/invitations`;
  const create = (recipients: string[], departmentId?: string) =>
    t
      .http()
      .post(base())
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .send({
        recipients: recipients.map((address) => ({ address })),
        role: 'member',
        ...(departmentId ? { departmentId } : {}),
      });
  const list = async () => (await t.http().get(base()).set(bearer(owner))).body as InvitationView[];
  const retry = (id: string, actor = owner, key = idempotencyKey()) =>
    t.http().post(`${base()}/${id}/retry-sms`).set(bearer(actor)).set('Idempotency-Key', key);
  const flushSends = async () => {
    await t.app.get(OutboxRelay).drainOnce();
    const jobs = await t.app
      .get(Queues)
      .notifications.getJobs(['waiting', 'delayed', 'prioritized'], 0, -1, true);
    for (const job of jobs)
      if (job.name !== 'sms.report') {
        await t.app.get(QueueWorkers).runNotification(job.name, job.data);
        await job.remove();
      }
  };
  const coolDownElapsed = (id: string) =>
    t.admin.query(
      `update invitations set sms_attempts = jsonb_set(sms_attempts, '{0,queuedAt}', to_jsonb((now() - interval '2 minutes')::text)) where id = $1`,
      [id],
    );

  it('keeps NAME, WORKSPACE and LINK intact through a named invitation retry', async () => {
    const phone = randomPhone();
    const mobile = localForm(phone);
    refused.add(mobile);
    const created = await t
      .http()
      .post(base())
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .send({ recipients: [{ address: mobile, name: 'همکار نمونه' }], role: 'member' });
    expect(created.status).toBe(201);
    const id = created.body.created[0].id as string;
    await flushSends();
    const first = sent.find((entry) => entry.mobile === mobile)!;
    expect(first.parameters).toHaveLength(3);
    expect(Object.fromEntries(first.parameters.map(({ name, value }) => [name, value]))).toEqual({
      NAME: 'همکار نمونه',
      WORKSPACE: workspace.name,
      LINK: expect.stringMatching(/^https:\/\/app\.taskin\.test\/invite\/[A-Za-z0-9_-]+$/),
    });
    await coolDownElapsed(id);
    refused.delete(mobile);
    expect((await retry(id)).status).toBe(200);
    await flushSends();
    const attempts = sent.filter((entry) => entry.mobile === mobile);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.parameters).toEqual(first.parameters);
  });

  it('persists queued status and serialises concurrent creates on the normalized recipient', async () => {
    const phone = randomPhone();
    const results = await Promise.all([create([localForm(phone)]), create([phone])]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results.flatMap((result) => result.body.created)).toHaveLength(1);
    expect(results.flatMap((result) => result.body.rejected).map((entry) => entry.reason)).toEqual([
      'already_invited',
    ]);
    const row = (await list()).find((entry) => entry.address === phone)!;
    expect(row.smsDelivery).toMatchObject({ status: 'queued', attemptCount: 1 });
    const events = await t.admin.query(
      `select count(*)::int as n from outbox_events where aggregate_id = $1 and event_type = 'notification.sms'`,
      [row.id],
    );
    expect(events.rows[0]?.n).toBe(1);
  });

  it('records per-recipient provider acceptance and confirmed rejection in a mixed batch; email stays compatible', async () => {
    const good = localForm(randomPhone());
    const bad = localForm(randomPhone());
    refused.add(bad);
    const result = await create([good, bad, 'phase1@example.test']);
    expect(result.status).toBe(201);
    await flushSends();
    const rows = await list();
    const goodRow = rows.find((entry) => localForm(entry.address) === good)!;
    const badRow = rows.find((entry) => localForm(entry.address) === bad)!;
    expect(goodRow.smsDelivery).toMatchObject({ status: 'sent', retryable: false });
    expect(badRow.smsDelivery).toMatchObject({
      status: 'failed',
      failureCode: 'provider_unavailable',
      retryable: true,
    });
    expect(rows.find((entry) => entry.address === 'phase1@example.test')?.smsDelivery).toBeNull();
    expect(t.mail.some((entry) => entry.to === 'phase1@example.test')).toBe(true);
    expect((await retry(badRow.id)).status).toBe(429);
    await coolDownElapsed(badRow.id);
    const before = sent.length;
    const responses = await Promise.all([retry(badRow.id), retry(badRow.id)]);
    expect(responses.map((entry) => entry.status).sort()).toEqual([200, 409]);
    refused.delete(bad);
    await flushSends();
    expect(sent.length - before).toBe(1);
    const updated = (await list()).find((entry) => entry.id === badRow.id)!;
    expect(updated.smsDelivery).toMatchObject({ status: 'sent', attemptCount: 2 });
    const links = sent
      .filter((entry) => entry.mobile === bad)
      .map((entry) => entry.parameters.find((param) => param.name === 'LINK')?.value);
    expect(links[0] === links[1]).toBe(true);
    expect(
      (await t.admin.query(`select count(*)::int as n from invitations where id = $1`, [badRow.id])).rows[0]
        ?.n,
    ).toBe(1);
  });

  it('does not resend a duplicate worker execution and accepts delivery only from a matching report', async () => {
    const result = await create([localForm(randomPhone())]);
    const id = result.body.created[0].id as string;
    const outbox = await t.admin.query(
      `select payload from outbox_events where aggregate_id = $1 and event_type = 'notification.sms'`,
      [id],
    );
    const payload = outbox.rows[0].payload as NotificationJobData['payload'];
    const data = { headers: {}, payload };
    const before = sent.length;
    await Promise.all([
      t.app.get(QueueWorkers).runNotification('sms.send', data),
      t.app.get(QueueWorkers).runNotification('sms.send', data),
    ]);
    expect(sent.length - before).toBe(1);
    const ref = { workspaceId: workspace.id, id, attempt: 1 };
    await expect(t.app.get(InvitationSmsProcessor).report(ref)).rejects.toThrow();
    expect((await list()).find((entry) => entry.id === id)?.smsDelivery?.status).toBe('sent');
    reportState = 1;
    reportMatches = false;
    await expect(t.app.get(InvitationSmsProcessor).report(ref)).rejects.toThrow();
    expect((await list()).find((entry) => entry.id === id)?.smsDelivery?.status).toBe('sent');
    reportMatches = true;
    await t.app.get(InvitationSmsProcessor).report(ref);
    expect((await list()).find((entry) => entry.id === id)?.smsDelivery?.status).toBe('delivered');
    reportState = null;
  });

  it('retains the workspace department on the invitation and accepted membership, and rejects a foreign department', async () => {
    const department = (
      await t.http().get(`/api/v1/workspaces/${workspace.id}/departments`).set(bearer(owner))
    ).body[0];
    const phone = randomPhone();
    const result = await create([localForm(phone)], department.id);
    expect(result.body.created[0].departmentId).toBe(department.id);
    await flushSends();
    const link = sent
      .find((entry) => entry.mobile === localForm(phone))
      ?.parameters.find((entry) => entry.name === 'LINK')?.value;
    expect(new URL(link!).pathname).toMatch(/^\/invite\/[A-Za-z0-9_-]+$/);
    const invitee = await signIn(t, phone);
    const accepted = await t
      .http()
      .post('/api/v1/invitations/accept')
      .set(bearer(invitee))
      .send({ token: invitationToken(link) });
    expect(accepted.status).toBe(200);
    const membership = await t.admin.query(
      `select department_id from workspace_members where workspace_id = $1 and user_id = $2`,
      [workspace.id, invitee.userId],
    );
    expect(membership.rows[0]?.department_id).toBe(department.id);
    expect((await retry(result.body.created[0].id, invitee)).status).toBe(403);
    const foreign = await ownerWithWorkspace(t);
    const foreignDepartment = (
      await t.http().get(`/api/v1/workspaces/${foreign.workspace.id}/departments`).set(bearer(foreign.owner))
    ).body[0];
    const rejected = await create([localForm(randomPhone())], foreignDepartment.id);
    expect(rejected.body.code).toBe('VALIDATION_FAILED');
    expect(rejected.body.errors[0].field).toBe('departmentId');
  });

  it('persists terminal undelivered reports but keeps pending, unknown and blocked outcomes non-retryable', async () => {
    const result = await create([localForm(randomPhone())]);
    const id = result.body.created[0].id as string;
    await flushSends();
    const ref = { workspaceId: workspace.id, id, attempt: 1 };
    for (const state of [3, 5, 8, null, 999]) {
      reportState = state;
      await expect(t.app.get(InvitationSmsProcessor).report(ref)).rejects.toThrow();
      expect((await list()).find((entry) => entry.id === id)?.smsDelivery).toMatchObject({
        status: 'sent',
        retryable: false,
      });
    }
    reportState = 2;
    await t.app.get(InvitationSmsProcessor).report(ref);
    expect((await list()).find((entry) => entry.id === id)?.smsDelivery).toMatchObject({
      status: 'failed',
      failureCode: 'delivery_failed',
      retryable: true,
    });
    await coolDownElapsed(id);
    expect((await retry(id)).status).toBe(200);
    reportState = 7;
    await flushSends();
    await t.app.get(InvitationSmsProcessor).report({ ...ref, attempt: 2 });
    expect((await list()).find((entry) => entry.id === id)?.smsDelivery).toMatchObject({
      status: 'failed',
      failureCode: 'recipient_blocked',
      retryable: false,
    });
    expect((await retry(id)).status).toBe(409);
    reportState = null;
  });

  it('preserves historical unknown status and prevents retry of historical, revoked and exhausted invitations', async () => {
    const result = await create([localForm(randomPhone())]);
    const id = result.body.created[0].id;
    await t.admin.query(`update invitations set sms_attempts = null, sms_link_sealed = null where id = $1`, [
      id,
    ]);
    expect((await list()).find((entry) => entry.id === id)?.smsDelivery).toMatchObject({
      status: 'unknown',
      retryable: false,
    });
    expect((await retry(id)).status).toBe(409);
    await t.http().delete(`${base()}/${id}`).set(bearer(owner));
    expect((await retry(id)).status).toBe(410);
    const capped = await create([localForm(randomPhone())]);
    const exhaustedId = capped.body.created[0].id;
    const attempts = Array.from({ length: 5 }, (_, index) => ({
      number: index + 1,
      status: 'failed',
      retryable: true,
      failureCode: 'provider_rejected',
      queuedAt: '2020-01-01T00:00:00Z',
    }));
    await t.admin.query(`update invitations set sms_attempts = $2::jsonb where id = $1`, [
      exhaustedId,
      JSON.stringify(attempts),
    ]);
    expect((await retry(exhaustedId)).status).toBe(409);
  });

  it('preserves a stricter deployment-wide request limit on the retry endpoint', async () => {
    const limited = await createTestApp({ THROTTLE_USER_PER_MINUTE: '1' });
    try {
      const { owner: inviter, workspace: team } = await ownerWithWorkspace(limited);
      const path = `/api/v1/workspaces/${team.id}/invitations`;
      const created = await limited
        .http()
        .post(path)
        .set(bearer(inviter))
        .set('Idempotency-Key', idempotencyKey())
        .send({ recipients: [{ address: localForm(randomPhone()) }], role: 'member' });
      expect(created.status).toBe(201);
      const id = created.body.created[0].id as string;
      await limited.admin.query(`update invitations set sms_attempts = $2::jsonb where id = $1`, [
        id,
        JSON.stringify([
          {
            number: 1,
            status: 'failed',
            retryable: true,
            failureCode: 'provider_unavailable',
            queuedAt: '2020-01-01T00:00:00Z',
          },
        ]),
      ]);
      const sendAgain = () =>
        limited
          .http()
          .post(`${path}/${id}/retry-sms`)
          .set(bearer(inviter))
          .set('Idempotency-Key', idempotencyKey());
      expect((await sendAgain()).status).toBe(200);
      const refused = await sendAgain();
      expect(refused.status).toBe(429);
      expect(refused.body.code).toBe('RATE_LIMITED');
    } finally {
      await limited.close();
    }
  });
});

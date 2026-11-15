import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../../src/config/app-config.js';
import { SmsService } from '../../src/platform/sms/sms.js';
import { OutboxRelay } from '../../src/platform/outbox/outbox-relay.js';
import { Queues } from '../../src/platform/queue/queues.js';
import {
  bearer,
  createTestApp,
  idempotencyKey,
  localForm,
  ownerWithWorkspace,
  randomPhone,
  type TestApp,
} from './harness.js';

describe('delayed invitation report through real BullMQ workers', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ QUEUE_WORKERS_ENABLED: 'true', OUTBOX_RELAY_ENABLED: 'false' });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await t?.close();
  });

  it('delays the report, retries a pending report, and records terminal failure without resending', async () => {
    const { owner, workspace } = await ownerWithWorkspace(t);
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
    let sends = 0;
    let reports = 0;
    let reportState = 3;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === 'https://api.sms.ir/v1/send/verify') {
          sends += 1;
          return { ok: true, json: async () => ({ status: 1, data: { messageId: 41 } }) };
        }
        reports += 1;
        return {
          ok: true,
          json: async () => ({ status: 1, data: { messageId: 41, deliveryState: reportState } }),
        };
      }),
    );
    const base = `/api/v1/workspaces/${workspace.id}/invitations`;
    const created = await t
      .http()
      .post(base)
      .set(bearer(owner))
      .set('Idempotency-Key', idempotencyKey())
      .send({ recipients: [{ address: localForm(randomPhone()) }], role: 'member' });
    expect(created.status).toBe(201);
    const id = created.body.created[0].id as string;
    const delivery = async () =>
      (await t.http().get(base).set(bearer(owner))).body.find((entry: { id: string }) => entry.id === id)
        .smsDelivery;
    const relay = t.app.get(OutboxRelay);
    await relay.drainOnce();
    await vi.waitFor(
      async () => {
        expect((await delivery()).status).toBe('sent');
      },
      { timeout: 10_000, interval: 50 },
    );
    await relay.drainOnce();
    const queue = t.app.get(Queues).notifications;
    const job = (await queue.getJobs(['delayed'])).find((entry) => entry.name === 'sms.report');
    expect(job).toBeDefined();
    expect(job!.opts.delay).toBe(60_000);
    expect(job!.opts.attempts).toBe(30);
    expect(job!.opts.backoff).toEqual({ type: 'fixed', delay: 60_000 });
    expect(reports).toBe(0);
    // Advance this disposable job's due time, not the production scheduler or processor.
    await job!.changeDelay(100);
    await vi.waitFor(
      async () => {
        expect((await queue.getJob(job!.id!))?.attemptsMade).toBe(1);
      },
      { timeout: 10_000, interval: 50 },
    );
    expect((await delivery()).status).toBe('sent');
    expect(await job!.getState()).toBe('delayed');
    reportState = 2;
    await job!.changeDelay(100);
    await vi.waitFor(
      async () => {
        expect(await job!.getState()).toBe('completed');
      },
      { timeout: 10_000, interval: 50 },
    );
    expect(await delivery()).toMatchObject({
      status: 'failed',
      failureCode: 'delivery_failed',
      retryable: true,
    });
    expect(sends).toBe(1);
    expect(reports).toBe(2);
  }, 30_000);
});

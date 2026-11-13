import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../../src/config/app-config.js';
import { envSchema } from '../../src/config/env.js';
import { SmsService, SmsUnavailableError } from '../../src/platform/sms/sms.js';
import { invitationFailure } from '../../src/platform/sms/invitation-sms-processor.js';
import { smsDeliveryView } from '../../src/platform/sms/invitation-sms-state.js';

afterEach(() => vi.unstubAllGlobals());

describe('SMS.ir invitations, independent of OTP', () => {
  it('uses the configured invitation template, WORKSPACE and LINK without claiming delivery', async () => {
    const config = new AppConfig(
      envSchema.parse({
        DATABASE_URL: 'postgres://test:test@localhost/test',
        REDIS_CORE_URL: 'redis://localhost:6379',
        REDIS_RT_URL: 'redis://localhost:6379',
        S3_ENDPOINT: 'http://localhost:8333',
        S3_BUCKET: 'test',
        S3_ACCESS_KEY: 'test',
        S3_SECRET_KEY: 'test',
        OTP_PEPPER: 'test-only-pepper'.repeat(3),
        APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
        SMS_PROVIDERS: 'smsir',
        SMSIR_API_KEY: 'synthetic-key',
        SMSIR_INVITE_TEMPLATE_ID: '30303',
      }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: 1, data: { messageId: 92 } }) });
    vi.stubGlobal('fetch', fetchMock);
    const sms = new SmsService(config);
    const tokens = { workspace: 'فضای آزمایشی', link: 'https://example.test/invite?token=synthetic' };
    const receipt = await sms.send({ to: '+989120000000', template: 'invite', tokens });
    expect(receipt).toEqual({ provider: 'smsir', messageId: '92' });
    expect(sms.providers.map((entry) => entry.name)).toEqual(['smsir']);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.sms.ir/v1/send/verify');
    expect(JSON.parse(options.body as string)).toEqual({
      mobile: '09120000000',
      templateId: 30303,
      parameters: [
        { name: 'WORKSPACE', value: tokens.workspace },
        { name: 'LINK', value: tokens.link },
      ],
    });
    expect(
      smsDeliveryView([
        {
          number: 1,
          status: 'sent',
          queuedAt: new Date().toISOString(),
          provider: receipt.provider,
          messageId: receipt.messageId,
        },
      ]).status,
    ).toBe('sent');
  });

  it('preserves unknown historical and ambiguous outcomes; only confirmed refusal enables retry', () => {
    expect(smsDeliveryView(null)).toMatchObject({ status: 'unknown', retryable: false });
    expect(invitationFailure(new SmsUnavailableError(['smsir: HTTP 400']))).toMatchObject({
      status: 'failed',
      retryable: false,
    });
    expect(invitationFailure(new SmsUnavailableError(['smsir: fetch failed']))).toMatchObject({
      status: 'unknown',
      retryable: false,
    });
    expect(invitationFailure(new SmsUnavailableError(['smsir: HTTP 503']))).toMatchObject({
      status: 'unknown',
      retryable: false,
    });
  });
});

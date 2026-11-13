import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../../src/config/app-config.js';
import { envSchema } from '../../src/config/env.js';
import { OtpService } from '../../src/modules/auth/otp.service.js';
import type { AuditWriter } from '../../src/platform/audit/audit-writer.js';
import type { UnitOfWork } from '../../src/platform/db/unit-of-work.js';
import type { RedisClients } from '../../src/platform/redis/redis.js';
import { SmsService } from '../../src/platform/sms/sms.js';

export function smsirConfig() {
  return new AppConfig(
    envSchema.parse({
      NODE_ENV: 'test',
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
      SMSIR_OTP_TEMPLATE_ID: '10101',
      SMSIR_RESET_OTP_TEMPLATE_ID: '20202',
      SMSIR_INVITE_TEMPLATE_ID: '30303',
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('unchanged SMS.ir OTP routing', () => {
  it.each([
    ['login', 10101],
    ['password_reset', 20202],
  ] as const)(
    '%s uses the existing configured SMS.ir template and CODE parameter',
    async (purpose, templateId) => {
      const config = smsirConfig();
      const sms = new SmsService(config);
      const fetchMock = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ status: 1, data: { messageId: 91 } }) });
      vi.stubGlobal('fetch', fetchMock);
      const values = vi.fn().mockResolvedValue(undefined);
      const uow = {
        run: async (_scope: unknown, work: (unit: unknown) => Promise<unknown>) =>
          work({ tx: { insert: () => ({ values }) } }),
      } as unknown as UnitOfWork;
      const chain = {
        incr: () => chain,
        expire: () => chain,
        ttl: () => chain,
        exec: async () => [
          [null, 1],
          [null, 1],
          [null, 3600],
        ],
      };
      const redis = {
        key: (...parts: string[]) => parts.join(':'),
        core: { multi: () => chain, set: async () => 'OK' },
      } as unknown as RedisClients;
      const otp = new OtpService(config, uow, { write: vi.fn() } as unknown as AuditWriter, redis, sms);
      await otp.request('09120000000', { ip: '192.0.2.1' }, purpose);
      expect(sms.providers.map((entry) => entry.name)).toEqual(['smsir']);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.sms.ir/v1/send/verify');
      expect(options.headers['x-api-key']).toBe(config.env.SMSIR_API_KEY);
      const body = JSON.parse(options.body as string);
      expect(body.templateId).toBe(templateId);
      expect(body.parameters).toEqual([{ name: 'CODE', value: expect.stringMatching(/^\d{6}$/) }]);
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ purpose, provider: 'smsir', providerMessageId: '91' }),
      );
    },
  );
});

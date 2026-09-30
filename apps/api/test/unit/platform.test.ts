import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../../src/config/app-config.js';
import { envSchema, InvalidConfigError, loadEnv } from '../../src/config/env.js';
import { toIranMobileE164 } from '../../src/modules/auth/otp.service.js';
import { passwordProblem } from '../../src/modules/auth/password.service.js';
import { sniff } from '../../src/modules/content/file-types.js';
import { sniffImage } from '../../src/modules/workspaces/icons.service.js';
import { redactChanges } from '../../src/platform/audit/audit-writer.js';
import { acceptRequestId, traceIdFrom } from '../../src/platform/context/request-context.js';
import { numericCode, safeEqual, SecretBox } from '../../src/platform/crypto/crypto.js';
import { ApiError } from '../../src/platform/http/api-error.js';
import { canonicalJson } from '../../src/platform/http/idempotency.js';
import { renderException } from '../../src/platform/http/problem.filter.js';
import { maskPhone } from '../../src/platform/logging/logging.js';
import { SmsService, SmsUnavailableError, toLocalMobile } from '../../src/platform/sms/sms.js';

const BASE_ENV = {
  DATABASE_URL: 'postgres://u:p@localhost/db',
  REDIS_CORE_URL: 'redis://localhost:6379',
  REDIS_RT_URL: 'redis://localhost:6380',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY: 'a',
  S3_SECRET_KEY: 's',
  OTP_PEPPER: 'x'.repeat(32),
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

describe('configuration', () => {
  it('lists every problem at once', () => {
    try {
      loadEnv({});
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidConfigError);
      const problems = (error as InvalidConfigError).problems.join('\n');
      for (const key of ['DATABASE_URL', 'REDIS_CORE_URL', 'OTP_PEPPER', 'APP_ENCRYPTION_KEY']) expect(problems).toContain(key);
    }
  });

  it('refuses development shortcuts in production', () => {
    const result = envSchema.safeParse({ ...BASE_ENV, NODE_ENV: 'production', SMS_PROVIDERS: 'console', COOKIE_SECURE: 'false' });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['SMS_PROVIDERS', 'JWT_PRIVATE_JWKS', 'COOKIE_SECURE']));
  });

  it('always allows the web app’s own origin', () => {
    const config = new AppConfig(envSchema.parse({ ...BASE_ENV, CORS_ORIGINS: 'https://admin.taskin.ir', PUBLIC_WEB_ORIGIN: 'https://app.taskin.ir/' }));
    expect(config.allowedOrigins).toEqual(['https://admin.taskin.ir', 'https://app.taskin.ir']);
  });
});

describe('crypto', () => {
  it('makes uniform six-digit codes', () => {
    const codes = Array.from({ length: 2000 }, () => numericCode(6));
    expect(codes.every((code) => /^[0-9]{6}$/.test(code))).toBe(true);
    const firstDigits = new Set(codes.map((code) => code[0]));
    expect(firstDigits.size).toBe(10);
  });

  it('seals and opens secrets, and detects tampering', () => {
    const box = new SecretBox(Buffer.alloc(32, 3).toString('base64'));
    const sealed = box.seal('https://app.taskin.ir/invite?token=abc');
    expect(sealed).not.toContain('token');
    expect(box.open(sealed)).toBe('https://app.taskin.ir/invite?token=abc');
    const tampered = `${sealed.slice(0, -2)}${sealed.endsWith('A') ? 'BB' : 'AA'}`;
    expect(() => box.open(tampered)).toThrow();
  });

  it('compares in constant time, across lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('request correlation', () => {
  it('keeps a sane client request id and replaces anything else', () => {
    expect(acceptRequestId('req-1234abcd')).toBe('req-1234abcd');
    expect(acceptRequestId('bad id with spaces')).not.toBe('bad id with spaces');
    expect(acceptRequestId(undefined)).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it('takes the trace id from a valid traceparent', () => {
    expect(traceIdFrom('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(traceIdFrom('00-00000000000000000000000000000000-00f067aa0ba902b7-01')).toMatch(/^[0-9a-f]{32}$/);
    expect(traceIdFrom('garbage')).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('redaction', () => {
  it('drops secrets and masks phone numbers and emails in audit changes', () => {
    expect(
      redactChanges({ phone: '+989121234567', email: 'sara@rahnama.ir', token: 'abc', nested: { passwordHash: 'x', name: 'سارا' }, addresses: ['+989121234567'] }),
    ).toEqual({
      phone: '+98912***4567',
      email: 's***@rahnama.ir',
      token: '[redacted]',
      nested: { passwordHash: '[redacted]', name: 'سارا' },
      addresses: ['+98912***4567'],
    });
    expect(maskPhone('+989121234567')).toBe('+98912***4567');
  });
});

describe('idempotency fingerprints', () => {
  it('ignore key order and undefined fields', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] }, x: undefined })).toBe(canonicalJson({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: '1' }));
  });
});

describe('input checks', () => {
  it('sniffs images by their magic numbers, not their names', () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))?.type).toBe('image/png');
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.type).toBe('image/jpeg');
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))?.type).toBe('image/webp');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it('tells an audio-only WebM (a browser voice note) from a video', () => {
    const ebml = [0x1a, 0x45, 0xdf, 0xa3];
    const webm = (codecs: string) => Buffer.concat([Buffer.from(ebml), Buffer.from(`\x42\x86webm Tracks ${codecs}`, 'latin1'), Buffer.alloc(64, 0)]);
    expect(sniff(webm('A_OPUS'), 'voice.webm')).toEqual({ mime: 'audio/webm', kind: 'audio' });
    expect(sniff(webm('V_VP9 A_OPUS'), 'clip.webm')).toEqual({ mime: 'video/webm', kind: 'video' });
    expect(sniff(webm(''), 'unknown.webm')).toEqual({ mime: 'video/webm', kind: 'video' });
  });

  it('asks for a reasonable password', () => {
    expect(passwordProblem('short1')).toMatch(/8/);
    expect(passwordProblem('onlyletters')).toMatch(/mix/);
    expect(passwordProblem('Rahnama-1405')).toBeNull();
    expect(passwordProblem('رمزعبور۱۴۰۵')).toBeNull();
  });

  it('accepts Iranian mobile numbers in any written form, and nothing else', () => {
    for (const input of ['09121234567', '+98 912 123 4567', '0098-912-123-4567', '۰۹۱۲۱۲۳۴۵۶۷', '٠٩١٢١٢٣٤٥٦٧', '9121234567']) {
      expect({ input, e164: toIranMobileE164(input) }).toEqual({ input, e164: '+989121234567' });
    }
    for (const input of ['02188776655', '+4915112345678', '0912123', 'hello']) expect(toIranMobileE164(input)).toBeNull();
    expect(toLocalMobile('+989121234567')).toBe('09121234567');
  });
});

describe('problem details', () => {
  const pg = (code: string) => ({ name: 'DrizzleQueryError', message: 'insert … params: secret', cause: { code, severity: 'ERROR' } });

  it('renders domain errors with their catalogued status', () => {
    expect(renderException(new ApiError('PLAN_LIMIT_REACHED'))).toMatchObject({ code: 'PLAN_LIMIT_REACHED', status: 402, unexpected: false });
    expect(renderException(ApiError.rateLimited(12)).headers).toEqual({ 'Retry-After': '12' });
  });

  it('maps database failures without leaking the query', () => {
    expect(renderException(pg('23505'))).toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(renderException(pg('23001'))).toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(renderException(pg('TK001'))).toMatchObject({ code: 'OWNER_IMMUTABLE', status: 403 });
    expect(renderException(pg('40001'))).toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503, unexpected: true });
    expect(renderException(pg('42501'))).toMatchObject({ code: 'FORBIDDEN', unexpected: true });
    expect(JSON.stringify(renderException(pg('23505')))).not.toContain('secret');
  });

  it('turns unreadable bodies into validation problems and anything else into a 500', () => {
    expect(renderException(Object.assign(new Error('too large'), { type: 'entity.too.large', status: 413 }))).toMatchObject({ code: 'VALIDATION_FAILED', status: 413 });
    expect(renderException(new Error('boom'))).toMatchObject({ code: 'INTERNAL', status: 500, unexpected: true });
  });
});

describe('SMS failover', () => {
  afterEach(() => vi.unstubAllGlobals());

  const service = () =>
    new SmsService(
      new AppConfig(
        envSchema.parse({ ...BASE_ENV, SMS_PROVIDERS: 'kavenegar,smsir', KAVENEGAR_API_KEY: 'k', SMSIR_API_KEY: 's', SMSIR_OTP_TEMPLATE_ID: '100' }),
      ),
    );

  it('fails over to the next provider, and opens the breaker after three failures', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(new URL(url).host);
      if (url.includes('kavenegar')) return new Response('{"return":{"status":500}}', { status: 500 });
      return new Response('{"status":1,"data":{"messageId":42}}', { status: 200 });
    });
    const sms = service();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const receipt = await sms.send({ to: '+989121234567', template: 'otp', tokens: { code: '123456' } });
      expect(receipt).toEqual({ provider: 'smsir', messageId: '42' });
    }
    // Three tries at Kavenegar, then its breaker skips it.
    expect(calls.filter((host) => host.includes('kavenegar'))).toHaveLength(3);
    expect(calls.filter((host) => host.includes('sms.ir'))).toHaveLength(4);
  });

  it('reports when every provider is down', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 502 }));
    await expect(service().send({ to: '+989121234567', template: 'otp', tokens: { code: '1' } })).rejects.toBeInstanceOf(SmsUnavailableError);
  });

  it('sends the receptor in local form to Kavenegar', async () => {
    let body = '';
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      body = String(init.body);
      return new Response('{"return":{"status":200},"entries":[{"messageid":7}]}', { status: 200 });
    });
    const receipt = await service().send({ to: '+989121234567', template: 'otp', tokens: { code: '654321' } });
    expect(receipt.messageId).toBe('7');
    expect(new URLSearchParams(body).get('receptor')).toBe('09121234567');
    expect(new URLSearchParams(body).get('token')).toBe('654321');
  });
});

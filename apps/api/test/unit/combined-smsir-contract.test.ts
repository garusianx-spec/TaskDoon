import { afterEach, describe, expect, it, vi } from 'vitest';
import { SmsIrProvider, renderSms } from '../../src/platform/sms/sms.js';

// Adapter contract only: this does not claim the invitation form currently supplies NAME
// or generates path-token URLs. The creation-flow audit records those gaps separately.
const message = {
  to: '+989120000000',
  template: 'invite' as const,
  tokens: {
    name: 'همکار نمونه',
    workspace: 'فضای آزمایشی',
    link: 'https://taskdoone.ir/invite/phase4-synthetic-token',
  },
};
afterEach(() => vi.unstubAllGlobals());

describe('combined SMS.ir parameter and renderer audit', () => {
  it('forwards a synthetic name, workspace and path-form link without a live gateway request', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: 1, data: { messageId: 42 } }) });
    vi.stubGlobal('fetch', transport);
    const provider = new SmsIrProvider('synthetic-key', {
      otp: 1,
      otp_reset: 2,
      invite: 30303,
      alert: 4,
      password_reset: 5,
    });
    expect(await provider.send(message)).toBe('42');
    expect(transport.mock.calls[0]?.[0]).toBe('https://api.sms.ir/v1/send/verify');
    expect(JSON.parse(transport.mock.calls[0]?.[1].body as string)).toEqual({
      mobile: '09120000000',
      templateId: 30303,
      parameters: [
        { name: 'NAME', value: 'همکار نمونه' },
        { name: 'WORKSPACE', value: 'فضای آزمایشی' },
        { name: 'LINK', value: message.tokens.link },
      ],
    });
  });

  it('records the exact local renderer text, which does not currently personalize the invitee name', () => {
    expect(renderSms(message)).toBe(
      'شما به فضای کاری «فضای آزمایشی» در تسک‌دون دعوت شده‌اید: https://taskdoone.ir/invite/phase4-synthetic-token',
    );
    expect(renderSms(message).includes(message.tokens.name)).toBe(false);
  });
});

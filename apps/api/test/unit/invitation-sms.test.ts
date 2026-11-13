import { afterEach, describe, expect, it, vi } from 'vitest';
import { SmsIrProvider, renderSms } from '../../src/platform/sms/sms.js';

const message = {
  to: '+989000000000',
  template: 'invite' as const,
  tokens: { workspace: 'فضای آزمایشی', link: 'https://example.test/invite?token=synthetic' },
};

afterEach(() => vi.unstubAllGlobals());

describe('invitation SMS adapters', () => {
  it('renders the invitation link and passes normalized recipient and template tokens to SMS.ir', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, data: { messageId: 42 } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new SmsIrProvider('test', {
      otp: 1,
      otp_reset: 2,
      invite: 3,
      alert: 4,
      password_reset: 5,
    });
    expect(await provider.send(message)).toBe('42');
    const params = JSON.parse(fetchMock.mock.calls[0]?.[1].body as string);
    expect(params.mobile).toBe('09000000000');
    expect(params.templateId).toBe(3);
    expect(params.parameters).toEqual([
      { name: 'WORKSPACE', value: message.tokens.workspace },
      { name: 'LINK', value: message.tokens.link },
    ]);
    expect(renderSms(message)).toContain(message.tokens.link);
  });

  it('rejects an unsuccessful provider acknowledgement', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 0 }),
      }),
    );
    const provider = new SmsIrProvider('test', {
      otp: 1,
      otp_reset: 1,
      invite: 2,
      alert: 3,
      password_reset: 4,
    });
    await expect(provider.send(message)).rejects.toThrow('smsir status 0');
  });
});

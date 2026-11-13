import { afterEach, describe, expect, it, vi } from 'vitest';
import { KavenegarProvider, SmsIrProvider, renderSms } from '../../src/platform/sms/sms.js';

const message = {
  to: '+989000000000',
  template: 'invite' as const,
  tokens: { workspace: 'فضای آزمایشی', link: 'https://example.test/invite?token=synthetic' },
};

afterEach(() => vi.unstubAllGlobals());

describe('invitation SMS adapters', () => {
  it('renders the invitation link and passes normalized recipient and template tokens to Kavenegar', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ return: { status: 200 }, entries: [{ messageid: 42 }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new KavenegarProvider('test', {
      otp: 'otp',
      otp_reset: 'reset',
      invite: 'invite-template',
      alert: 'alert',
      password_reset: 'password',
    });
    expect(await provider.send(message)).toBe('42');
    const params = fetchMock.mock.calls[0]?.[1].body as URLSearchParams;
    expect(params.get('receptor')).toBe('09000000000');
    expect(params.get('template')).toBe('invite-template');
    expect(params.get('token')).toBe(message.tokens.link);
    expect(params.get('token10')).toBe(message.tokens.workspace);
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

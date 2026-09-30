import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { maskPhone } from '../logging/logging.js';

/**
 * The SMS port (RFC §5.2). Iranian providers send through pre-approved templates ("verify" or
 * "lookup" APIs), so the port speaks in templates rather than free text: an OTP code, an
 * invitation link, a security alert. Numbers are E.164 at the port; each adapter converts to the
 * form its API expects.
 */
/** `password_reset`: a link a platform admin sent to set a new password. */
export type SmsTemplate = 'otp' | 'invite' | 'alert' | 'password_reset';

export interface SmsMessage {
  readonly to: string;
  readonly template: SmsTemplate;
  /** Ordered template tokens, e.g. `{ code }` or `{ workspace, link }`. */
  readonly tokens: Readonly<Record<string, string>>;
}

export interface SmsReceipt {
  readonly provider: string;
  readonly messageId: string | null;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<string | null>;
}

export class SmsUnavailableError extends Error {
  constructor(readonly causes: readonly string[]) {
    super(`every SMS provider failed: ${causes.join('; ')}`);
    this.name = 'SmsUnavailableError';
  }
}

/** `+989121234567` → `09121234567`, the form Iranian gateways take. */
export function toLocalMobile(e164: string): string {
  return e164.startsWith('+98') ? `0${e164.slice(3)}` : e164;
}

/** What the console driver prints, and what a real template renders to. */
export function renderSms(message: SmsMessage): string {
  switch (message.template) {
    case 'otp':
      return `کد ورود شما به تسک‌دون: ${message.tokens.code}`;
    case 'invite':
      return `شما به فضای کاری «${message.tokens.workspace}» در تسک‌دون دعوت شده‌اید: ${message.tokens.link}`;
    case 'alert':
      return `هشدار امنیتی تسک‌دون: ${message.tokens.event}`;
    case 'password_reset':
      return `برای گذاشتن رمز عبور تازه در تسک‌دون: ${message.tokens.link}`;
  }
}

/**
 * Development and test driver: logs a masked line and keeps the message in memory, where the
 * integration tests read OTP codes and invitation links. Refused in production by config.
 */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  readonly sent: (SmsMessage & { readonly text: string; readonly at: Date })[] = [];
  private readonly logger = new Logger('ConsoleSms');

  async send(message: SmsMessage): Promise<string | null> {
    const text = renderSms(message);
    this.sent.push({ ...message, text, at: new Date() });
    this.logger.log({ to: maskPhone(message.to), template: message.template, devOnly: true, text }, 'SMS (console driver)');
    return `console-${this.sent.length}`;
  }

  /** The newest message to `to`, for tests. */
  lastTo(to: string): (SmsMessage & { readonly text: string }) | undefined {
    return [...this.sent].reverse().find((message) => message.to === to);
  }
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return payload;
}

/**
 * Kavenegar "verify/lookup": `token`, `token2`, `token3` fill the approved template. Tokens may
 * not contain spaces, so a workspace name travels as `token10`, which may.
 */
export class KavenegarProvider implements SmsProvider {
  readonly name = 'kavenegar';

  constructor(
    private readonly apiKey: string,
    private readonly templates: Readonly<Record<SmsTemplate, string>>,
    private readonly baseUrl = 'https://api.kavenegar.com',
  ) {}

  async send(message: SmsMessage): Promise<string | null> {
    const params = new URLSearchParams({ receptor: toLocalMobile(message.to), template: this.templates[message.template] });
    const values = Object.values(message.tokens);
    if (message.template === 'invite') {
      params.set('token', message.tokens.link ?? '');
      params.set('token10', message.tokens.workspace ?? '');
    } else if (message.template === 'password_reset') {
      params.set('token', message.tokens.link ?? '');
    } else {
      values.slice(0, 3).forEach((value, index) => params.set(index === 0 ? 'token' : `token${index + 1}`, value.replace(/\s+/g, '_')));
    }
    const url = `${this.baseUrl}/v1/${encodeURIComponent(this.apiKey)}/verify/lookup.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: AbortSignal.timeout(5_000),
    });
    const payload = (await response.json().catch(() => null)) as {
      return?: { status?: number; message?: string };
      entries?: { messageid?: number }[];
    } | null;
    if (!response.ok || payload?.return?.status !== 200) {
      throw new Error(`kavenegar ${payload?.return?.status ?? response.status}`);
    }
    return payload.entries?.[0]?.messageid?.toString() ?? null;
  }
}

/** SMS.ir "send/verify": numbered template ids, named parameters. */
export class SmsIrProvider implements SmsProvider {
  readonly name = 'smsir';

  constructor(
    private readonly apiKey: string,
    private readonly templates: Readonly<Record<SmsTemplate, number | undefined>>,
    private readonly baseUrl = 'https://api.sms.ir',
  ) {}

  async send(message: SmsMessage): Promise<string | null> {
    const templateId = this.templates[message.template];
    if (templateId === undefined) throw new Error(`smsir has no template for ${message.template}`);
    const payload = (await postJson(
      `${this.baseUrl}/v1/send/verify`,
      {
        mobile: toLocalMobile(message.to),
        templateId,
        parameters: Object.entries(message.tokens).map(([name, value]) => ({ name: name.toUpperCase(), value })),
      },
      { 'x-api-key': this.apiKey },
    )) as { status?: number; data?: { messageId?: number } } | null;
    if (payload?.status !== 1) throw new Error(`smsir status ${payload?.status ?? 'unknown'}`);
    return payload.data?.messageId?.toString() ?? null;
  }
}

interface Breaker {
  failures: number;
  openUntil: number;
}

/**
 * Sends through the configured providers in order, failing over on error. Three consecutive
 * failures open a provider's breaker for 30 seconds so a dead gateway costs nothing per request.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger('SmsService');
  private readonly breakers = new Map<string, Breaker>();
  readonly providers: readonly SmsProvider[];

  constructor(config: AppConfig) {
    const env = config.env;
    this.providers = env.SMS_PROVIDERS.map((name): SmsProvider => {
      switch (name) {
        case 'console':
          return new ConsoleSmsProvider();
        case 'kavenegar':
          return new KavenegarProvider(env.KAVENEGAR_API_KEY ?? '', {
            otp: env.KAVENEGAR_OTP_TEMPLATE,
            invite: env.KAVENEGAR_INVITE_TEMPLATE,
            alert: env.KAVENEGAR_ALERT_TEMPLATE,
            password_reset: env.KAVENEGAR_RESET_TEMPLATE,
          });
        case 'smsir':
          return new SmsIrProvider(env.SMSIR_API_KEY ?? '', {
            otp: env.SMSIR_OTP_TEMPLATE_ID,
            invite: env.SMSIR_INVITE_TEMPLATE_ID,
            alert: env.SMSIR_ALERT_TEMPLATE_ID,
            password_reset: env.SMSIR_RESET_TEMPLATE_ID,
          });
      }
    });
  }

  /** The in-memory console driver, when configured (development and tests). */
  get console(): ConsoleSmsProvider | undefined {
    return this.providers.find((provider): provider is ConsoleSmsProvider => provider instanceof ConsoleSmsProvider);
  }

  async send(message: SmsMessage): Promise<SmsReceipt> {
    const causes: string[] = [];
    for (const provider of this.providers) {
      const breaker = this.breakers.get(provider.name) ?? { failures: 0, openUntil: 0 };
      if (breaker.openUntil > Date.now()) {
        causes.push(`${provider.name}: circuit open`);
        continue;
      }
      try {
        const messageId = await provider.send(message);
        this.breakers.set(provider.name, { failures: 0, openUntil: 0 });
        return { provider: provider.name, messageId };
      } catch (error) {
        const failures = breaker.failures + 1;
        this.breakers.set(provider.name, { failures, openUntil: failures >= 3 ? Date.now() + 30_000 : 0 });
        const cause = error instanceof Error ? error.message : String(error);
        causes.push(`${provider.name}: ${cause}`);
        this.logger.warn({ provider: provider.name, to: maskPhone(message.to), cause }, 'SMS provider failed');
      }
    }
    throw new SmsUnavailableError(causes);
  }
}

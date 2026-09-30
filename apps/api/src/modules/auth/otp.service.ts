import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import type { OtpChallenge } from '@taskin/contracts';
import { normaliseIranMobile } from '@taskin/text';
import { AppConfig } from '../../config/app-config.js';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { hmacSha256, numericCode, safeEqual } from '../../platform/crypto/crypto.js';
import { otpChallenges } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import { maskPhone } from '../../platform/logging/logging.js';
import { RedisClients } from '../../platform/redis/redis.js';
import { SmsService, SmsUnavailableError } from '../../platform/sms/sms.js';

export const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const SENDS_PER_PHONE_PER_HOUR = 5;
const SENDS_PER_IP_PER_HOUR = 20;
const VERIFIES_PER_IP_PER_HOUR = 30;

/**
 * Any written form of an Iranian mobile number (`0912…`, `+98 912 …`, `۰۹۱۲…`) to E.164, or
 * `null`. Only mobile ranges pass: SMS pumping to premium or foreign numbers is refused up front.
 */
export function toIranMobileE164(raw: string): string | null {
  const local = normaliseIranMobile(raw);
  if (!local) return null;
  const parsed = parsePhoneNumberFromString(local, 'IR');
  if (!parsed?.isValid() || parsed.getType() !== 'MOBILE') return null;
  return parsed.number;
}

export interface VerifiedPhone {
  readonly phone: string;
  readonly challengeId: string;
}

/**
 * SMS one-time codes (RFC §5.2). Codes are six digits, live 120 seconds, allow five attempts,
 * and are stored only as an HMAC bound to their challenge id. Sending limits live in redis-core
 * and fail closed: without Redis there is no way to stop SMS pumping, so no code is sent.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger('OtpService');

  constructor(
    private readonly config: AppConfig,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
    private readonly redis: RedisClients,
    private readonly sms: SmsService,
  ) {}

  async request(rawPhone: string, client: { ip?: string; userAgent?: string }): Promise<OtpChallenge> {
    const phone = toIranMobileE164(rawPhone);
    if (!phone) throw ApiError.validation([{ field: 'phone', message: 'not an Iranian mobile number' }]);

    await this.enforceSendLimits(phone, client.ip);

    const challengeId = randomUUID();
    const code = numericCode(OTP_LENGTH);
    let receipt;
    try {
      receipt = await this.sms.send({ to: phone, template: 'otp', tokens: { code } });
    } catch (error) {
      if (error instanceof SmsUnavailableError) {
        // Let the person try again right away instead of waiting out a cooldown for nothing.
        await this.redis.core.del(this.cooldownKey(phone)).catch(() => undefined);
        throw new ApiError('SMS_UNAVAILABLE', undefined, undefined, { 'Retry-After': '30' });
      }
      throw error;
    }
    await this.uow.run({ workspaceId: null, userId: null }, async ({ tx }) => {
      await tx.insert(otpChallenges).values({
        id: challengeId,
        phone,
        purpose: 'login',
        codeHash: this.hash(challengeId, code),
        provider: receipt.provider,
        providerMessageId: receipt.messageId,
        ip: client.ip ?? null,
        userAgent: client.userAgent?.slice(0, 512) ?? null,
        expiresAt: new Date(Date.now() + this.config.env.OTP_TTL_SECONDS * 1000),
      });
      await this.audit.write(tx, {
        action: 'auth.otp.request',
        actorUserId: null,
        resourceType: 'otp_challenge',
        resourceId: challengeId,
        changes: { phone, provider: receipt.provider },
      });
    });
    this.logger.log({ phone: maskPhone(phone), provider: receipt.provider }, 'OTP sent');
    return {
      challengeId,
      codeLength: OTP_LENGTH,
      expiresInSeconds: this.config.env.OTP_TTL_SECONDS,
      resendInSeconds: this.config.env.OTP_RESEND_SECONDS,
    };
  }

  /** Consumes the challenge when the code matches; counts the attempt when it does not. */
  async verify(challengeId: string, code: string, ip: string | undefined): Promise<VerifiedPhone> {
    await this.hit(this.redis.key('otp', 'verify', 'ip', ip ?? 'unknown'), 3600, VERIFIES_PER_IP_PER_HOUR);

    const outcome = await this.uow.run({ workspaceId: null, userId: null }, async ({ tx }) => {
      const [challenge] = await tx
        .select({
          row: otpChallenges,
          expired: sql<boolean>`${otpChallenges.expiresAt} <= now()`,
        })
        .from(otpChallenges)
        .where(eq(otpChallenges.id, challengeId))
        .for('update');
      if (!challenge) return { kind: 'invalid' as const, remaining: 0 };
      const { row } = challenge;
      if (row.consumedAt || challenge.expired) return { kind: 'expired' as const };
      if (row.attempts >= MAX_ATTEMPTS) return { kind: 'locked' as const };
      if (!safeEqual(this.hash(row.id, code), row.codeHash)) {
        const attempts = row.attempts + 1;
        await tx.update(otpChallenges).set({ attempts }).where(eq(otpChallenges.id, row.id));
        return attempts >= MAX_ATTEMPTS ? ({ kind: 'locked' as const }) : { kind: 'invalid' as const, remaining: MAX_ATTEMPTS - attempts };
      }
      await tx.update(otpChallenges).set({ consumedAt: sql`now()` }).where(eq(otpChallenges.id, row.id));
      await this.audit.write(tx, { action: 'auth.otp.verify', actorUserId: null, resourceType: 'otp_challenge', resourceId: row.id });
      return { kind: 'ok' as const, phone: row.phone };
    });

    switch (outcome.kind) {
      case 'ok':
        return { phone: outcome.phone, challengeId };
      case 'expired':
        throw new ApiError('OTP_EXPIRED');
      case 'locked':
        throw new ApiError('OTP_ATTEMPTS_EXCEEDED', 'Request a new code.');
      case 'invalid':
        throw new ApiError('OTP_INVALID', outcome.remaining > 0 ? `${outcome.remaining} attempts left.` : undefined);
    }
  }

  private hash(challengeId: string, code: string): Buffer {
    return hmacSha256(this.config.env.OTP_PEPPER, `${challengeId}:${code}`);
  }

  private cooldownKey(phone: string): string {
    return this.redis.key('otp', 'send', 'phone', phone, 'cooldown');
  }

  private async enforceSendLimits(phone: string, ip: string | undefined): Promise<void> {
    await this.hit(this.redis.key('otp', 'send', 'ip', ip ?? 'unknown'), 3600, SENDS_PER_IP_PER_HOUR);
    const cooldown = this.config.env.OTP_RESEND_SECONDS;
    let fresh: string | null;
    try {
      fresh = await this.redis.core.set(this.cooldownKey(phone), '1', 'EX', cooldown, 'NX');
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Sign-in is temporarily unavailable.');
    }
    if (fresh !== 'OK') {
      const ttl = await this.redis.core.ttl(this.cooldownKey(phone)).catch(() => cooldown);
      throw ApiError.rateLimited(ttl > 0 ? ttl : cooldown, 'Wait before requesting another code.');
    }
    await this.hit(this.redis.key('otp', 'send', 'phone', phone, 'hour'), 3600, SENDS_PER_PHONE_PER_HOUR);
  }

  /** Fixed-window counter that fails closed. */
  private async hit(key: string, windowSeconds: number, limit: number): Promise<void> {
    let count: number;
    let ttl: number;
    try {
      const results = await this.redis.core.multi().incr(key).expire(key, windowSeconds, 'NX').ttl(key).exec();
      count = Number(results?.[0]?.[1] ?? 0);
      ttl = Number(results?.[2]?.[1] ?? windowSeconds);
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Sign-in is temporarily unavailable.');
    }
    if (count > limit) throw ApiError.rateLimited(ttl > 0 ? ttl : windowSeconds);
  }
}

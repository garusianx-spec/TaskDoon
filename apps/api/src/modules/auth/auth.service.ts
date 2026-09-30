import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { AuthMethod, AuthSession, OtpChallenge, OtpVerifyResult } from '@taskin/contracts';
import { AppConfig } from '../../config/app-config.js';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { sha256 } from '../../platform/crypto/crypto.js';
import { authSessions, passwordResetTokens, refreshTokens, users } from '../../platform/db/schema/all.js';
import { isUniqueViolation } from '../../platform/db/pg-errors.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import type { AuthPrincipal } from '../../platform/http/request.js';
import { OutboxWriter } from '../../platform/outbox/outbox-writer.js';
import { RedisClients } from '../../platform/redis/redis.js';
import { toMeUser, UsersService } from '../users/users.service.js';
import { type DeviceInfo, type IssuedRefresh, SessionService } from './session.service.js';
import { OtpService, toIranMobileE164 } from './otp.service.js';
import { PasswordService, passwordProblem } from './password.service.js';
import { TokenService } from './token.service.js';

type UserRow = typeof users.$inferSelect;
type SessionRow = typeof authSessions.$inferSelect;

/** A session response plus the refresh token the controller puts in the cookie. */
export interface IssuedSession {
  readonly body: AuthSession;
  readonly refresh: IssuedRefresh;
}

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
/** Password sign-in attempts per IP per hour, on top of the per-account lockout. */
const PASSWORD_SIGNINS_PER_IP_PER_HOUR = 30;

/**
 * The sign-in flows: phone → OTP → session (or sign-up), refresh rotation, step-up with the
 * admin password, and password management. Controllers stay thin; cookies are theirs.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly uow: UnitOfWork,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordService,
    private readonly usersService: UsersService,
    private readonly audit: AuditWriter,
    private readonly redis: RedisClients,
    private readonly outbox: OutboxWriter,
  ) {}

  async verifyOtp(challengeId: string, code: string, device: DeviceInfo): Promise<{ result: OtpVerifyResult; refresh?: IssuedRefresh }> {
    const { phone } = await this.otp.verify(challengeId, code, device.ip ?? undefined);
    const signedIn = await this.uow.run({ workspaceId: null, userId: null }, async (unit) => {
      const user = await this.usersService.findByPhone(unit.tx, phone);
      if (!user) return null;
      if (user.status !== 'active') throw ApiError.forbidden('This account is suspended.');
      const { session, refresh } = await this.sessions.create(unit, user.id, device, ['otp']);
      await this.audit.write(unit.tx, { action: 'auth.signin', actorUserId: user.id, resourceType: 'session', resourceId: session.id });
      return { user, session, refresh };
    });
    if (!signedIn) {
      const signup = await this.tokens.signSignup(phone);
      return { result: { status: 'signup_required', signupToken: signup.token, expiresInSeconds: signup.expiresInSeconds } };
    }
    const body = await this.sessionBody(signedIn.user, signedIn.session);
    return { result: { status: 'signed_in', session: body }, refresh: signedIn.refresh };
  }

  /**
   * Phone and password instead of an SMS code, for an account that has set a password. The
   * session's `amr` is `pwd`; it is not a step-up, which stays a separate act. Unknown numbers,
   * accounts without a password and wrong passwords get one and the same answer.
   */
  async passwordSignIn(rawPhone: string, password: string, device: DeviceInfo): Promise<IssuedSession> {
    const phone = toIranMobileE164(rawPhone);
    if (!phone) throw ApiError.validation([{ field: 'phone', message: 'not an Iranian mobile number' }]);
    await this.limit(this.redis.key('password', 'signin', 'ip', device.ip ?? 'unknown'), 3600, PASSWORD_SIGNINS_PER_IP_PER_HOUR);
    const userId = await this.passwords.authenticate(phone, password);
    const signedIn = await this.uow.run({ workspaceId: null, userId: null }, async (unit) => {
      const user = await this.usersService.findById(unit.tx, userId);
      if (!user || user.status !== 'active') throw new ApiError('CREDENTIALS_INVALID');
      const { session, refresh } = await this.sessions.create(unit, user.id, device, ['pwd']);
      await this.audit.write(unit.tx, { action: 'auth.signin.password', actorUserId: user.id, resourceType: 'session', resourceId: session.id });
      return { user, session, refresh };
    });
    return { body: await this.sessionBody(signedIn.user, signedIn.session), refresh: signedIn.refresh };
  }

  /**
   * «فراموشی رمز عبور»: texts a reset code (purpose `password_reset`) to an account's phone. The
   * answer is the same whether or not the number has an active account, so it cannot be used
   * to find accounts; only real accounts are texted.
   */
  async forgotPassword(rawPhone: string, client: { ip?: string; userAgent?: string }): Promise<OtpChallenge> {
    const phone = toIranMobileE164(rawPhone);
    if (!phone) throw ApiError.validation([{ field: 'phone', message: 'not an Iranian mobile number' }]);
    const account = await this.uow.run({ workspaceId: null, userId: null }, async ({ tx }) => {
      const user = await this.usersService.findByPhone(tx, phone);
      await this.audit.write(tx, { action: 'auth.password.forgot', actorUserId: null, resourceType: 'user', ...(user ? { resourceId: user.id } : {}) });
      return user && user.status === 'active' ? user : null;
    });
    return account ? this.otp.request(phone, client, 'password_reset') : this.otp.decoy(phone, client);
  }

  /**
   * A new password with the reset code from the SMS: the code proves the phone, the password
   * passes the usual policy and is stored as an Argon2id hash. Any admin-issued reset is
   * settled, a lockout lifted, and every session of the account ends; its owner is texted.
   */
  async recoverPassword(challengeId: string, code: string, newPassword: string, ip: string | undefined): Promise<void> {
    // The policy first, so a weak password does not use up the code.
    const problem = passwordProblem(newPassword);
    if (problem) throw new ApiError('PASSWORD_TOO_WEAK', `The password ${problem}.`);
    const { phone } = await this.otp.verify(challengeId, code, ip, 'password_reset');
    const passwordHash = await this.passwords.hash(newPassword);
    await this.uow.run({ workspaceId: null, userId: null }, async (unit) => {
      const { tx } = unit;
      const user = await this.usersService.findByPhone(tx, phone);
      if (!user || user.status !== 'active') throw new ApiError('OTP_INVALID');
      await this.passwords.store(unit, user.id, passwordHash);
      await tx.update(users).set({ passwordResetRequired: false }).where(eq(users.id, user.id));
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: sql`now()` })
        .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
      const signedOut = await this.sessions.revokeOthers(unit, user.id, null, 'password_changed');
      await this.audit.write(tx, {
        action: 'auth.password.recover',
        actorUserId: user.id,
        resourceType: 'user',
        resourceId: user.id,
        changes: { sessionsSignedOut: signedOut },
      });
      await this.outbox.add(tx, {
        type: 'notification.sms',
        aggregateType: 'user',
        aggregateId: user.id,
        payload: { to: user.phone, template: 'alert', tokens: { event: 'رمز عبور حساب شما با کد پیامکی تغییر کرد' } },
      });
    });
  }

  /** Texts a confirmation code (purpose `step_up`) to the signed-in account's own phone. */
  async requestSessionConfirmation(principal: AuthPrincipal, client: { ip?: string; userAgent?: string }): Promise<OtpChallenge> {
    const user = await this.uow.run({ workspaceId: null, userId: principal.userId }, ({ tx }) => this.usersService.findById(tx, principal.userId));
    if (!user) throw new ApiError('SESSION_REVOKED');
    return this.otp.request(user.phone, client, 'step_up');
  }

  /**
   * Confirms the session with that code: `otp` joins its `amr` (as a step-up adds `pwd`), so a
   * session opened with a password becomes one that has shown the phone too.
   */
  async confirmSession(principal: AuthPrincipal, challengeId: string, code: string, ip: string | undefined): Promise<AuthSession> {
    const { phone } = await this.otp.verify(challengeId, code, ip, 'step_up');
    const { user, session } = await this.uow.run({ workspaceId: null, userId: principal.userId }, async ({ tx }) => {
      const user = await this.usersService.findById(tx, principal.userId);
      if (!user) throw new ApiError('SESSION_REVOKED');
      if (user.phone !== phone) throw new ApiError('OTP_INVALID');
      const [session] = await tx
        .update(authSessions)
        .set({ amr: sql`array(select distinct unnest(${authSessions.amr} || array['otp']))` })
        .where(and(eq(authSessions.id, principal.sessionId), isNull(authSessions.revokedAt)))
        .returning();
      if (!session) throw new ApiError('SESSION_REVOKED');
      await this.audit.write(tx, { action: 'auth.session.confirm', resourceType: 'session', resourceId: session.id });
      return { user, session };
    });
    return this.sessionBody(user, session);
  }

  async signup(signupToken: string, fullName: string, device: DeviceInfo): Promise<IssuedSession> {
    const claims = await this.tokens.verifySignup(signupToken);
    // Single use: the first redemption wins, a replay of the same token is refused.
    const ttl = Math.max(1, claims.exp - Math.floor(Date.now() / 1000));
    const first = await this.redis.core
      .set(this.redis.key('signup', 'used', claims.jti), '1', 'EX', ttl, 'NX')
      .catch(() => {
        throw new ApiError('SERVICE_UNAVAILABLE', 'Sign-up is temporarily unavailable.');
      });
    if (first !== 'OK') throw new ApiError('SIGNUP_TOKEN_INVALID');

    const created = await this.uow.run({ workspaceId: null, userId: null }, async (unit) => {
      let user: UserRow | undefined;
      try {
        [user] = await unit.tx
          .insert(users)
          .values({ phone: claims.phone, phoneVerifiedAt: sql`now()`, fullName: fullName.trim() })
          .returning();
      } catch (error) {
        // Two sign-ups for one number: the account exists now, so just sign in to it.
        if (!isUniqueViolation(error, 'users_phone_uq')) throw error;
      }
      user ??= await this.usersService.findByPhone(unit.tx, claims.phone);
      if (!user) throw new ApiError('CONFLICT');
      const { session, refresh } = await this.sessions.create(unit, user.id, device, ['otp']);
      await this.audit.write(unit.tx, { action: 'auth.signup', actorUserId: user.id, resourceType: 'user', resourceId: user.id });
      return { user, session, refresh };
    });
    return { body: await this.sessionBody(created.user, created.session), refresh: created.refresh };
  }

  async refresh(presented: string | undefined): Promise<IssuedSession> {
    if (!presented) throw new ApiError('REFRESH_INVALID');
    const outcome = await this.sessions.rotate(presented);
    switch (outcome.kind) {
      case 'invalid':
        throw new ApiError('REFRESH_INVALID');
      case 'revoked':
      case 'reuse':
        throw new ApiError('SESSION_REVOKED');
      case 'rotated':
        return { body: await this.sessionBody(outcome.user, outcome.session), refresh: outcome.refresh };
    }
  }

  /** Signs the session out. Works from the refresh cookie or the access token, whichever exists. */
  async logout(presentedRefresh: string | undefined, principal: AuthPrincipal | undefined): Promise<void> {
    await this.uow.run({ workspaceId: null, userId: principal?.userId ?? null }, async (unit) => {
      let sessionId = principal?.sessionId;
      let userId = principal?.userId;
      if (!sessionId && presentedRefresh) {
        const [owner] = await unit.tx
          .select({ sessionId: authSessions.id, userId: authSessions.userId })
          .from(refreshTokens)
          .innerJoin(authSessions, eq(authSessions.id, refreshTokens.sessionId))
          .where(eq(refreshTokens.tokenHash, sha256(presentedRefresh)));
        sessionId = owner?.sessionId;
        userId = owner?.userId;
      }
      if (!sessionId || !userId) return;
      await this.sessions.revoke(unit, [sessionId], 'logout', userId);
      await this.audit.write(unit.tx, { action: 'auth.signout', actorUserId: userId, resourceType: 'session', resourceId: sessionId });
    });
  }

  /** Re-verifies the admin password and returns a token that carries the step-up. */
  async stepUp(principal: AuthPrincipal, password: string): Promise<AuthSession> {
    await this.passwords.verify(principal.userId, password);
    const { user, session } = await this.uow.run({ workspaceId: null, userId: principal.userId }, async ({ tx }) => {
      const [session] = await tx
        .update(authSessions)
        .set({ steppedUpAt: sql`now()`, amr: sql`array(select distinct unnest(${authSessions.amr} || array['pwd']))` })
        .where(eq(authSessions.id, principal.sessionId))
        .returning();
      const user = await this.usersService.findById(tx, principal.userId);
      if (!session || !user) throw new ApiError('SESSION_REVOKED');
      await this.audit.write(tx, { action: 'auth.stepup', resourceType: 'session', resourceId: session.id });
      return { user, session };
    });
    return this.sessionBody(user, session);
  }

  /**
   * Sets or changes the admin password. Changing needs the current one (or a fresh step-up);
   * setting the first one needs a fresh sign-in. Every other session is signed out.
   */
  async setPassword(principal: AuthPrincipal, currentPassword: string | undefined, newPassword: string): Promise<void> {
    const passwordHash = await this.passwords.hash(newPassword);
    const [user] = await this.uow.run({ workspaceId: null, userId: principal.userId }, ({ tx }) =>
      tx.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, principal.userId)),
    );
    if (!user) throw new ApiError('UNAUTHENTICATED');
    const now = Math.floor(Date.now() / 1000);
    const fresh = (at: number | null) => at !== null && now - at <= this.config.env.STEP_UP_TTL_SECONDS;
    if (user.passwordHash) {
      if (currentPassword) await this.passwords.verify(principal.userId, currentPassword);
      else if (!fresh(principal.stepUpAt)) throw new ApiError('STEP_UP_REQUIRED');
    } else if (!fresh(principal.authTime) && !fresh(principal.stepUpAt)) {
      throw new ApiError('STEP_UP_REQUIRED', 'Sign in again to set a password.');
    }
    await this.uow.run({ workspaceId: null, userId: principal.userId }, async (unit) => {
      await this.passwords.store(unit, principal.userId, passwordHash);
      const signedOut = await this.sessions.revokeOthers(unit, principal.userId, principal.sessionId, 'password_changed');
      await this.audit.write(unit.tx, {
        action: user.passwordHash ? 'auth.password.change' : 'auth.password.set',
        resourceType: 'user',
        resourceId: principal.userId,
        changes: { otherSessionsSignedOut: signedOut },
      });
    });
  }

  async revokeSession(principal: AuthPrincipal, sessionId: string): Promise<void> {
    if (sessionId === principal.sessionId) throw new ApiError('CONFLICT', 'Sign out to end the current session.');
    await this.uow.run({ workspaceId: null, userId: principal.userId }, async (unit) => {
      const session = await this.sessions.find(unit.tx, sessionId);
      if (!session || session.userId !== principal.userId) throw ApiError.notFound('The session');
      await this.sessions.revoke(unit, [sessionId], 'user_revoked', principal.userId);
      await this.audit.write(unit.tx, { action: 'auth.session.revoke', resourceType: 'session', resourceId: sessionId });
    });
  }

  async revokeOtherSessions(principal: AuthPrincipal): Promise<void> {
    await this.uow.run({ workspaceId: null, userId: principal.userId }, async (unit) => {
      const count = await this.sessions.revokeOthers(unit, principal.userId, principal.sessionId, 'user_revoked');
      await this.audit.write(unit.tx, { action: 'auth.session.revoke_others', resourceType: 'user', resourceId: principal.userId, changes: { count } });
    });
  }

  /** Fixed-window counter that fails closed, like the SMS limits. */
  private async limit(key: string, windowSeconds: number, max: number): Promise<void> {
    let count: number;
    let ttl: number;
    try {
      const results = await this.redis.core.multi().incr(key).expire(key, windowSeconds, 'NX').ttl(key).exec();
      count = Number(results?.[0]?.[1] ?? 0);
      ttl = Number(results?.[2]?.[1] ?? windowSeconds);
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE', 'Sign-in is temporarily unavailable.');
    }
    if (count > max) throw ApiError.rateLimited(ttl > 0 ? ttl : windowSeconds);
  }

  private async sessionBody(user: UserRow, session: SessionRow): Promise<AuthSession> {
    const stepUpAt =
      session.steppedUpAt && Date.now() - session.steppedUpAt.getTime() <= this.config.env.STEP_UP_TTL_SECONDS * 1000
        ? seconds(session.steppedUpAt)
        : null;
    const access = await this.tokens.signAccess({
      userId: user.id,
      sessionId: session.id,
      amr: session.amr as AuthMethod[],
      authTime: seconds(session.createdAt),
      securityVersion: user.securityVersion,
      stepUpAt,
    });
    return {
      accessToken: access.token,
      tokenType: 'Bearer',
      expiresInSeconds: access.expiresInSeconds,
      sessionId: session.id,
      user: toMeUser(user),
    };
  }
}

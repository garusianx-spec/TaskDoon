import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthMethod } from '@taskin/contracts';
import { AppConfig } from '../../config/app-config.js';
import { RequestContext } from '../../platform/context/request-context.js';
import { safeEqual } from '../../platform/crypto/crypto.js';
import { ApiError } from '../../platform/http/api-error.js';
import { IS_PUBLIC } from '../../platform/http/public.js';
import type { AuthenticatedRequest, AuthPrincipal } from '../../platform/http/request.js';
import { RevocationService } from './revocation.service.js';
import { TokenService } from './token.service.js';
import { authCookies } from './cookies.js';

type HttpRequest = Request & AuthenticatedRequest;

function bearer(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/**
 * Global guard: every route needs a valid access token unless marked `@Public()`. Beyond the
 * signature it checks the two things a token cannot know about itself: whether its session was
 * revoked, and whether the user's security version moved on.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly revocations: RevocationService,
    private readonly context: RequestContext,
  ) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    if (execution.getType() !== 'http') return true;
    const request = execution.switchToHttp().getRequest<HttpRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [execution.getHandler(), execution.getClass()]);
    const token = bearer(request);
    if (!token) {
      if (isPublic) return true;
      throw new ApiError('UNAUTHENTICATED');
    }
    try {
      request.auth = await this.authenticate(token);
    } catch (error) {
      // A stale token on a public route (sign-in, refresh) is simply ignored.
      if (isPublic) return true;
      throw error;
    }
    this.context.set('userId', request.auth.userId);
    this.context.set('sessionId', request.auth.sessionId);
    return true;
  }

  async authenticate(token: string): Promise<AuthPrincipal> {
    const claims = await this.tokens.verifyAccess(token);
    const [revoked, standing] = await Promise.all([this.revocations.isRevoked(claims.sid), this.revocations.standing(claims.sub)]);
    if (revoked || !standing.active || standing.securityVersion !== claims.sv) throw new ApiError('SESSION_REVOKED');
    return {
      userId: claims.sub,
      sessionId: claims.sid,
      amr: claims.amr as AuthMethod[],
      authTime: claims.auth_time,
      stepUpAt: claims.stepup_at ?? null,
      securityVersion: claims.sv,
      expiresAt: claims.exp,
    };
  }
}

const STEP_UP = Symbol('taskin:step-up');

/** The route needs a password re-verification in the last 15 minutes (RFC §5.2). */
export const RequireStepUp = () => applyDecorators(SetMetadata(STEP_UP, true), UseGuards(StepUpGuard));

@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
  ) {}

  canActivate(execution: ExecutionContext): boolean {
    if (!this.reflector.getAllAndOverride<boolean>(STEP_UP, [execution.getHandler(), execution.getClass()])) return true;
    const auth = execution.switchToHttp().getRequest<HttpRequest>().auth;
    if (!auth) throw new ApiError('UNAUTHENTICATED');
    const age = Math.floor(Date.now() / 1000) - (auth.stepUpAt ?? 0);
    if (!auth.stepUpAt || age > this.config.env.STEP_UP_TTL_SECONDS) throw new ApiError('STEP_UP_REQUIRED');
    return true;
  }
}

/**
 * The refresh and logout calls are authenticated by cookie, so they need CSRF protection: the
 * Origin (when the browser sends one) must be ours, and `X-CSRF-Token` must echo the readable
 * CSRF cookie. A cross-site page can make the browser send the cookies but cannot read them.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(execution: ExecutionContext): boolean {
    const request = execution.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    if (origin && !this.config.allowedOrigins.includes(origin)) throw new ApiError('CSRF_FAILED');
    const cookie = (request.cookies as Record<string, string | undefined> | undefined)?.[authCookies(this.config).csrf.name];
    const header = request.header('x-csrf-token');
    if (!cookie || !header || !safeEqual(cookie, header)) throw new ApiError('CSRF_FAILED');
    return true;
  }
}

export const RequireCsrf = () =>
  applyDecorators(
    UseGuards(CsrfGuard),
    ApiHeader({ name: 'X-CSRF-Token', required: true, description: 'The value of the readable CSRF cookie' }),
  );

/** The authenticated principal. Only on routes that are not `@Public()`. */
export const CurrentAuth = createParamDecorator((_: unknown, execution: ExecutionContext): AuthPrincipal => {
  const auth = execution.switchToHttp().getRequest<HttpRequest>().auth;
  if (!auth) throw new ApiError('UNAUTHENTICATED');
  return auth;
});

/** The principal when a token was presented, on a route that also works without one. */
export const OptionalAuth = createParamDecorator(
  (_: unknown, execution: ExecutionContext): AuthPrincipal | undefined => execution.switchToHttp().getRequest<HttpRequest>().auth,
);

export const Authenticated = () => applyDecorators(ApiBearerAuth());

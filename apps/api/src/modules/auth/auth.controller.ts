import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiQuery, ApiTags, getSchemaPath } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthSession, OtpChallenge, OtpVerifyResult, SessionView } from '@taskin/contracts';
import { AppConfig } from '../../config/app-config.js';
import { ApiError } from '../../platform/http/api-error.js';
import { Public } from '../../platform/http/public.js';
import type { AuthPrincipal } from '../../platform/http/request.js';
import {
  AuthSessionDto,
  OtpChallengeDto,
  OtpConfirmDto,
  OtpRequestDto,
  OtpVerifyDto,
  PasswordForgotDto,
  PasswordRecoverDto,
  PasswordSignInDto,
  SessionViewDto,
  SetPasswordDto,
  SignupDto,
  StepUpDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { authCookies, clearAuthCookies, setAuthCookies } from './cookies.js';
import { Authenticated, CurrentAuth, OptionalAuth, RequireCsrf } from './guards.js';
import { OtpService } from './otp.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

function device(request: Request, label?: string) {
  return { deviceLabel: label ?? null, userAgent: request.headers['user-agent'] ?? null, ip: request.ip ?? null };
}

@ApiTags('auth')
@ApiExtraModels(AuthSessionDto)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly config: AppConfig,
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Text a sign-in code to a mobile number (same answer whether or not it has an account)' })
  @ApiOkResponse({ type: OtpChallengeDto })
  request(@Body() body: OtpRequestDto, @Req() request: Request): Promise<OtpChallenge> {
    return this.otp.request(body.phone, { ip: request.ip, userAgent: request.headers['user-agent'] });
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check the code: signs in, or returns a sign-up token for a new number' })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { type: 'object', properties: { status: { type: 'string', enum: ['signed_in'] }, session: { $ref: getSchemaPath(AuthSessionDto) } } },
        { type: 'object', properties: { status: { type: 'string', enum: ['signup_required'] }, signupToken: { type: 'string' }, expiresInSeconds: { type: 'integer' } } },
      ],
    },
  })
  async verify(@Body() body: OtpVerifyDto, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<OtpVerifyResult> {
    const { result, refresh } = await this.auth.verifyOtp(body.challengeId, body.code, device(request, body.deviceLabel));
    if (refresh) setAuthCookies(response, this.config, refresh.token, refresh.expiresAt);
    return result;
  }

  @Public()
  @Post('password/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with phone and password (for accounts that set one); the SMS code stays the default' })
  @ApiOkResponse({ type: AuthSessionDto })
  async passwordLogin(@Body() body: PasswordSignInDto, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<AuthSession> {
    const issued = await this.auth.passwordSignIn(body.phone, body.password, device(request, body.deviceLabel));
    setAuthCookies(response, this.config, issued.refresh.token, issued.refresh.expiresAt);
    return issued.body;
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Text a password reset code to the number (same answer whether or not it has an account)' })
  @ApiOkResponse({ type: OtpChallengeDto })
  forgotPassword(@Body() body: PasswordForgotDto, @Req() request: Request): Promise<OtpChallenge> {
    return this.auth.forgotPassword(body.phone, { ip: request.ip, userAgent: request.headers['user-agent'] });
  }

  @Public()
  @Post('password/recover')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password with the reset code from the SMS (signs every session out)' })
  recoverPassword(@Body() body: PasswordRecoverDto, @Req() request: Request): Promise<void> {
    return this.auth.recoverPassword(body.challengeId, body.code, body.newPassword, request.ip);
  }

  @Public()
  @Post('signup')
  @ApiOperation({ summary: 'Create the account for a verified number and sign in' })
  @ApiOkResponse({ type: AuthSessionDto })
  async signup(@Body() body: SignupDto, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<AuthSession> {
    const issued = await this.auth.signup(body.signupToken, body.fullName, device(request, body.deviceLabel));
    setAuthCookies(response, this.config, issued.refresh.token, issued.refresh.expiresAt);
    return issued.body;
  }

  @Public()
  @RequireCsrf()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh cookie and get a new access token' })
  @ApiOkResponse({ type: AuthSessionDto })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<AuthSession> {
    const presented = (request.cookies as Record<string, string | undefined>)[authCookies(this.config).refresh.name];
    try {
      const issued = await this.auth.refresh(presented);
      setAuthCookies(response, this.config, issued.refresh.token, issued.refresh.expiresAt);
      return issued.body;
    } catch (error) {
      if (error instanceof ApiError) clearAuthCookies(response, this.config);
      throw error;
    }
  }

  @Public()
  @RequireCsrf()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign this device out' })
  async logout(@Req() request: Request, @OptionalAuth() principal: AuthPrincipal | undefined, @Res({ passthrough: true }) response: Response): Promise<void> {
    const presented = (request.cookies as Record<string, string | undefined>)[authCookies(this.config).refresh.name];
    await this.auth.logout(presented, principal);
    clearAuthCookies(response, this.config);
  }

  @Authenticated()
  @Post('step-up')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-verify the admin password; the returned token allows sensitive actions for 15 minutes' })
  @ApiOkResponse({ type: AuthSessionDto })
  stepUp(@CurrentAuth() principal: AuthPrincipal, @Body() body: StepUpDto): Promise<AuthSession> {
    return this.auth.stepUp(principal, body.password);
  }

  @Authenticated()
  @Post('otp/confirm/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Text a confirmation code to the signed-in account’s own phone' })
  @ApiOkResponse({ type: OtpChallengeDto })
  requestConfirmation(@CurrentAuth() principal: AuthPrincipal, @Req() request: Request): Promise<OtpChallenge> {
    return this.auth.requestSessionConfirmation(principal, { ip: request.ip, userAgent: request.headers['user-agent'] });
  }

  @Authenticated()
  @Post('otp/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm this session with that code (a password session then counts as SMS-confirmed)' })
  @ApiOkResponse({ type: AuthSessionDto })
  confirmSession(@CurrentAuth() principal: AuthPrincipal, @Body() body: OtpConfirmDto, @Req() request: Request): Promise<AuthSession> {
    return this.auth.confirmSession(principal, body.challengeId, body.code, request.ip);
  }

  @Authenticated()
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set or change the admin password (signs out every other session)' })
  setPassword(@CurrentAuth() principal: AuthPrincipal, @Body() body: SetPasswordDto): Promise<void> {
    return this.auth.setPassword(principal, body.currentPassword, body.newPassword);
  }

  @Authenticated()
  @Get('sessions')
  @ApiOperation({ summary: 'Signed-in devices («نشست‌های فعال»)' })
  @ApiOkResponse({ type: SessionViewDto, isArray: true })
  listSessions(@CurrentAuth() principal: AuthPrincipal): Promise<SessionView[]> {
    return this.sessions.listActive(principal.userId, principal.sessionId);
  }

  @Authenticated()
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign another device out' })
  revokeSession(@CurrentAuth() principal: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.auth.revokeSession(principal, id);
  }

  @Authenticated()
  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiQuery({ name: 'others', required: true, enum: ['true'] })
  @ApiOperation({ summary: 'Sign every other device out' })
  revokeOthers(@CurrentAuth() principal: AuthPrincipal, @Query('others') others: string): Promise<void> {
    if (others !== 'true') throw ApiError.validation([{ field: 'others', message: 'must be true' }]);
    return this.auth.revokeOtherSessions(principal);
  }

  @Public()
  @Get('jwks')
  @ApiOperation({ summary: 'Public keys that verify access tokens' })
  jwks() {
    return this.tokens.jwks;
  }
}

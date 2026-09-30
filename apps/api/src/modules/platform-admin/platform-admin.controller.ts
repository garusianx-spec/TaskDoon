import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import type {
  PasswordResetIssued,
  PlatformAdminMe,
  PlatformAttachmentLink,
  PlatformAuditPage,
  PlatformConversationDetail,
  PlatformConversationView,
  PlatformMessagePage,
  PlatformSessionsRevoked,
  PlatformSessionView,
  PlatformUserDetail,
  PlatformUserPage,
  PlatformWorkspaceDetail,
  PlatformWorkspacePage,
} from '@taskin/contracts';
import { AppConfig } from '../../config/app-config.js';
import { Public } from '../../platform/http/public.js';
import type { AuthPrincipal } from '../../platform/http/request.js';
import { CurrentAuth } from '../auth/guards.js';
import { PasswordResetService } from './password-reset.service.js';
import {
  CompletePasswordResetDto,
  IssuePasswordResetDto,
  PasswordResetIssuedDto,
  PlatformAdminMeDto,
  PlatformAttachmentLinkDto,
  PlatformAuditPageDto,
  PlatformAuditQueryDto,
  PlatformConversationDetailDto,
  PlatformConversationViewDto,
  PlatformMessagePageDto,
  PlatformMessageQueryDto,
  PlatformSessionQueryDto,
  PlatformSessionsRevokedDto,
  PlatformSessionViewDto,
  PlatformTargetQueryDto,
  PlatformUserDetailDto,
  PlatformUserPageDto,
  PlatformUserQueryDto,
  PlatformWorkspaceDetailDto,
  PlatformWorkspacePageDto,
  PlatformWorkspaceQueryDto,
} from './platform-admin.dto.js';
import { CurrentPlatformAdmin, type PlatformAdmin, PlatformAdminOnly, PlatformAdminProbe } from './platform-admin.guard.js';
import { PlatformAdminUnitOfWork } from './admin-unit-of-work.js';
import { PlatformConversationsService } from './platform-conversations.service.js';
import { PlatformUsersService } from './platform-users.service.js';
import { PlatformWorkspacesService } from './platform-workspaces.service.js';

/** What the admin screens show is never kept by a browser or proxy cache. */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(execution: ExecutionContext, next: CallHandler): Observable<unknown> {
    execution.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'no-store');
    return next.handle();
  }
}

/** The admin shell's first call: am I a platform admin here, and is my step-up still fresh? */
@ApiTags('platform-admin')
@Controller('admin')
@UseInterceptors(NoStoreInterceptor)
export class PlatformAdminProbeController {
  constructor(
    private readonly config: AppConfig,
    private readonly admins: PlatformAdminUnitOfWork,
  ) {}

  @PlatformAdminProbe()
  @Get('me')
  @ApiOperation({ summary: 'Platform admin probe: 404 for everyone else; no step-up needed' })
  @ApiOkResponse({ type: PlatformAdminMeDto })
  me(@CurrentPlatformAdmin() admin: PlatformAdmin, @CurrentAuth() principal: AuthPrincipal): PlatformAdminMe {
    const age = Math.floor(Date.now() / 1000) - (principal.stepUpAt ?? 0);
    return {
      userId: admin.userId,
      fullName: admin.fullName,
      stepUpRequired: !principal.stepUpAt || age > this.config.env.STEP_UP_TTL_SECONDS,
      available: this.admins.available,
    };
  }
}

/**
 * The platform super admin API. Every route: a platform admin (everyone else gets 404), with a
 * password step-up in the last 15 minutes; every look at someone's data is audited.
 */
@ApiTags('platform-admin')
@Controller('admin')
@PlatformAdminOnly()
@UseInterceptors(NoStoreInterceptor)
export class PlatformAdminController {
  constructor(
    private readonly users: PlatformUsersService,
    private readonly conversations: PlatformConversationsService,
    private readonly workspaces: PlatformWorkspacesService,
  ) {}

  /* ---------------------------------------------------------------- users and sessions */

  @Get('users')
  @ApiOperation({ summary: 'User directory: filter by name, phone, email, status and platform role' })
  @ApiOkResponse({ type: PlatformUserPageDto })
  listUsers(@CurrentPlatformAdmin() admin: PlatformAdmin, @Query() query: PlatformUserQueryDto): Promise<PlatformUserPage> {
    return this.users.list(admin, query);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'A person: profile, workspaces, exact workspace roles and project memberships' })
  @ApiOkResponse({ type: PlatformUserDetailDto })
  user(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('userId', ParseUUIDPipe) userId: string): Promise<PlatformUserDetail> {
    return this.users.detail(admin, userId);
  }

  @Get('users/:userId/sessions')
  @ApiOperation({ summary: 'Session inspector: devices, clients, IPs, activity and status' })
  @ApiOkResponse({ type: PlatformSessionViewDto, isArray: true })
  sessions(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: PlatformSessionQueryDto,
  ): Promise<PlatformSessionView[]> {
    return this.users.sessionsOf(admin, userId, query.status ?? 'all');
  }

  @Post('sessions/:sessionId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End one session now (its tokens and sockets stop working)' })
  @ApiNoContentResponse()
  revokeSession(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<void> {
    return this.users.revokeSession(admin, sessionId);
  }

  @Post('users/:userId/sessions/revoke-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End every session of a person' })
  @ApiOkResponse({ type: PlatformSessionsRevokedDto })
  revokeAll(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('userId', ParseUUIDPipe) userId: string): Promise<PlatformSessionsRevoked> {
    return this.users.revokeAll(admin, userId);
  }

  @Post('users/:userId/password-reset')
  @ApiOperation({ summary: 'Issue a single-use password reset code: sent as a link, or shown once to hand over' })
  @ApiCreatedResponse({ type: PasswordResetIssuedDto })
  issuePasswordReset(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: IssuePasswordResetDto,
  ): Promise<PasswordResetIssued> {
    return this.users.issuePasswordReset(admin, userId, body.channel);
  }

  /* ---------------------------------------------------------------- conversations and messages */

  @Get('users/:userId/conversations')
  @ApiOperation({ summary: 'Every conversation a person is or was in, across workspaces' })
  @ApiOkResponse({ type: PlatformConversationViewDto, isArray: true })
  userConversations(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('userId', ParseUUIDPipe) userId: string): Promise<PlatformConversationView[]> {
    return this.conversations.ofUser(admin, userId);
  }

  @Get('conversations/:conversationId')
  @ApiOperation({ summary: 'A conversation and its members (left ones included)' })
  @ApiOkResponse({ type: PlatformConversationDetailDto })
  conversation(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: PlatformTargetQueryDto,
  ): Promise<PlatformConversationDetail> {
    return this.conversations.detail(admin, conversationId, query.targetUserId);
  }

  @Get('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Messages of a conversation, filtered by date range, type and sender' })
  @ApiOkResponse({ type: PlatformMessagePageDto })
  messages(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: PlatformMessageQueryDto,
  ): Promise<PlatformMessagePage> {
    return this.conversations.messages(admin, conversationId, query);
  }

  @Get('attachments/:attachmentId/link')
  @ApiOperation({ summary: 'A five-minute link to a file sent in a conversation' })
  @ApiOkResponse({ type: PlatformAttachmentLinkDto })
  attachmentLink(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Query() query: PlatformTargetQueryDto,
  ): Promise<PlatformAttachmentLink> {
    return this.conversations.attachmentLink(admin, attachmentId, query.targetUserId);
  }

  /* ---------------------------------------------------------------- workspaces, roles, audit */

  @Get('workspaces')
  @ApiOperation({ summary: 'Every workspace' })
  @ApiOkResponse({ type: PlatformWorkspacePageDto })
  listWorkspaces(@CurrentPlatformAdmin() admin: PlatformAdmin, @Query() query: PlatformWorkspaceQueryDto): Promise<PlatformWorkspacePage> {
    return this.workspaces.list(admin, query);
  }

  @Get('workspaces/:workspaceId')
  @ApiOperation({ summary: 'A workspace: roles with their permission matrix, and members with their roles' })
  @ApiOkResponse({ type: PlatformWorkspaceDetailDto })
  workspace(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('workspaceId', ParseUUIDPipe) workspaceId: string): Promise<PlatformWorkspaceDetail> {
    return this.workspaces.detail(admin, workspaceId);
  }

  @Get('audit')
  @ApiOperation({ summary: 'The platform audit log: who looked at what, from where' })
  @ApiOkResponse({ type: PlatformAuditPageDto })
  audit(@CurrentPlatformAdmin() admin: PlatformAdmin, @Query() query: PlatformAuditQueryDto): Promise<PlatformAuditPage> {
    return this.workspaces.audit(admin, query);
  }
}

/** The person's side of an admin-issued reset: set a new password with the code from the link. */
@ApiTags('auth')
@Controller('password-reset')
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password with a single-use reset code (signs every session out)' })
  @ApiNoContentResponse()
  complete(@Body() body: CompletePasswordResetDto, @Req() request: Request): Promise<void> {
    return this.resets.complete(body.token, body.newPassword, request.ip);
  }
}

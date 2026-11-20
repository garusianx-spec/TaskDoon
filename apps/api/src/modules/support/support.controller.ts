import {
  SupportAgentViewDto,
  SupportFileLinkDto,
  SupportMessageViewDto,
  SupportThreadViewDto,
  SupportTicketPageDto,
  SupportTicketViewDto,
  SupportUploadViewDto,
} from './support.responses.js';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import type { AuthPrincipal } from '../../platform/http/request.js';
import { CurrentAuth } from '../auth/guards.js';
import {
  CurrentPlatformAdmin,
  PlatformAdminOnly,
  type PlatformAdmin,
} from '../platform-admin/platform-admin.guard.js';
import { NoStoreInterceptor } from '../platform-admin/platform-admin.controller.js';
import {
  AgentReplyDto,
  AgentTicketQueryDto,
  CloseTicketDto,
  CreateTicketDto,
  InitialSupportUploadDto,
  ReadTicketDto,
  SupportReplyDto,
  SupportUploadDto,
  ThreadQueryDto,
  TicketQueryDto,
  UpdateTicketDto,
} from './support.dto.js';
import { SupportService } from './support.service.js';

@ApiTags('support')
@ApiBearerAuth()
@Controller('support')
@UseInterceptors(NoStoreInterceptor)
export class SupportController {
  constructor(private readonly support: SupportService) {}
  @Get('tickets')
  @ApiOkResponse({ type: SupportTicketPageDto })
  list(@CurrentAuth() auth: AuthPrincipal, @Query() q: TicketQueryDto) {
    return this.support.list({ userId: auth.userId }, q);
  }
  @Post('tickets')
  @ApiCreatedResponse({ type: SupportTicketViewDto })
  create(@CurrentAuth() auth: AuthPrincipal, @Body() body: CreateTicketDto) {
    return this.support.create(auth.userId, body);
  }
  @Get('tickets/:id')
  @ApiOkResponse({ type: SupportThreadViewDto })
  thread(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ThreadQueryDto,
  ) {
    return this.support.thread({ userId: auth.userId }, id, q.cursor);
  }
  @Post('tickets/:id/messages')
  @ApiCreatedResponse({ type: SupportMessageViewDto })
  reply(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupportReplyDto,
  ) {
    return this.support.reply({ userId: auth.userId }, id, body);
  }
  @Post('tickets/:id/read')
  @HttpCode(204)
  @ApiNoContentResponse()
  read(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReadTicketDto,
  ) {
    return this.support.read({ userId: auth.userId }, id, body.throughSeq);
  }
  @Post('tickets/:id/close')
  @HttpCode(200)
  @ApiOkResponse({ type: SupportTicketViewDto })
  close(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CloseTicketDto,
  ) {
    return this.support.update({ userId: auth.userId }, id, { ...body, status: 'CLOSED' });
  }
  @Post('uploads')
  @ApiCreatedResponse({ type: SupportUploadViewDto })
  upload(@CurrentAuth() auth: AuthPrincipal, @Body() body: InitialSupportUploadDto) {
    return this.support.planUpload({ userId: auth.userId }, body, { workspaceId: body.workspaceId });
  }
  @Post('uploads/:id/complete')
  @HttpCode(200)
  @ApiOkResponse({ type: SupportUploadViewDto })
  complete(@CurrentAuth() auth: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.completeUpload({ userId: auth.userId }, id);
  }
  @Post('tickets/:id/uploads')
  @ApiCreatedResponse({ type: SupportUploadViewDto })
  threadUpload(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupportUploadDto,
  ) {
    return this.support.planUpload({ userId: auth.userId }, body, { ticketId: id });
  }
  @Post('tickets/:id/uploads/:fileId/complete')
  @HttpCode(200)
  @ApiOkResponse({ type: SupportUploadViewDto })
  threadComplete(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.support.completeUpload({ userId: auth.userId }, fileId, id);
  }
  @Get('tickets/:id/attachments/:fileId')
  @ApiOkResponse({ type: SupportFileLinkDto })
  file(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.support.fileLink({ userId: auth.userId }, id, fileId);
  }
}
@ApiTags('admin-support')
@Controller('admin/tickets')
@PlatformAdminOnly()
@UseInterceptors(NoStoreInterceptor)
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}
  @Get()
  @ApiOkResponse({ type: SupportTicketPageDto })
  list(@CurrentPlatformAdmin() admin: PlatformAdmin, @Query() q: AgentTicketQueryDto) {
    return this.support.list({ userId: admin.userId, admin }, q);
  }
  @Get('agents')
  @ApiOkResponse({ type: SupportAgentViewDto, isArray: true })
  agents(@CurrentPlatformAdmin() admin: PlatformAdmin) {
    return this.support.agents(admin);
  }
  @Get(':id')
  @ApiOkResponse({ type: SupportThreadViewDto })
  thread(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ThreadQueryDto,
  ) {
    return this.support.thread({ userId: admin.userId, admin }, id, q.cursor);
  }
  @Post(':id/messages')
  @ApiCreatedResponse({ type: SupportMessageViewDto })
  reply(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AgentReplyDto,
  ) {
    return this.support.reply({ userId: admin.userId, admin }, id, body);
  }
  @Post(':id/read')
  @HttpCode(204)
  @ApiNoContentResponse()
  read(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReadTicketDto,
  ) {
    return this.support.read({ userId: admin.userId, admin }, id, body.throughSeq);
  }
  @Patch(':id')
  @ApiOkResponse({ type: SupportTicketViewDto })
  update(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTicketDto,
  ) {
    return this.support.update({ userId: admin.userId, admin }, id, body);
  }
  @Post(':id/uploads')
  @ApiCreatedResponse({ type: SupportUploadViewDto })
  upload(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupportUploadDto,
  ) {
    return this.support.planUpload({ userId: admin.userId, admin }, body, { ticketId: id });
  }
  @Post(':id/uploads/:fileId/complete')
  @HttpCode(200)
  @ApiOkResponse({ type: SupportUploadViewDto })
  complete(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.support.completeUpload({ userId: admin.userId, admin }, fileId, id);
  }
  @Get(':id/attachments/:fileId')
  @ApiOkResponse({ type: SupportFileLinkDto })
  file(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.support.fileLink({ userId: admin.userId, admin }, id, fileId);
  }
}

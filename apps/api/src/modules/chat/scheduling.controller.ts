import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { ScheduledMessageView, WorkingHoursView } from '@taskin/contracts';
import type { MembershipContext } from '../../platform/http/request.js';
import { Authenticated } from '../auth/guards.js';
import { CurrentMember, WorkspaceScoped } from '../rbac/guards.js';
import { AutoReplyService } from './auto-reply.service.js';
import { ScheduledListQueryDto, ScheduledMessageViewDto, ScheduleMessageDto, UpdateWorkingHoursDto, WorkingHoursViewDto } from './chat.dto.js';
import { ScheduledMessagesService } from './scheduled-messages.service.js';

const UUID = new ParseUUIDPipe();

/**
 * Phase 3.2: scheduled messages («پیام‌های زمان‌بندی‌شده») and each member's working hours with
 * their out-of-office auto-reply. Schedules are the caller's own; nobody else sees them before
 * they are sent.
 */
@ApiTags('chat')
@Authenticated()
@WorkspaceScoped()
@Controller('workspaces/:workspaceId')
export class SchedulingController {
  constructor(
    private readonly scheduled: ScheduledMessagesService,
    private readonly autoReply: AutoReplyService,
  ) {}

  @Get('scheduled-messages')
  @ApiOkResponse({ type: ScheduledMessageViewDto, isArray: true })
  @ApiOperation({ summary: 'Your pending scheduled messages, soonest first' })
  list(@CurrentMember() member: MembershipContext, @Query() query: ScheduledListQueryDto): Promise<ScheduledMessageView[]> {
    return this.scheduled.list(member, query.conversationId);
  }

  @Post('conversations/:conversationId/scheduled-messages')
  @ApiCreatedResponse({ type: ScheduledMessageViewDto })
  @ApiOkResponse({ type: ScheduledMessageViewDto, description: 'A retry: the message scheduled with this clientMsgId' })
  @ApiOperation({ summary: 'Schedule a message: the worker sends it at scheduledAt, as you' })
  async schedule(
    @CurrentMember() member: MembershipContext,
    @Param('conversationId', UUID) conversationId: string,
    @Body() body: ScheduleMessageDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ScheduledMessageView> {
    const { view, created } = await this.scheduled.schedule(member, conversationId, body);
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return view;
  }

  @Post('scheduled-messages/:scheduledId/send')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ScheduledMessageViewDto })
  @ApiOperation({ summary: 'ارسال فوری: send it now' })
  sendNow(@CurrentMember() member: MembershipContext, @Param('scheduledId', UUID) scheduledId: string): Promise<ScheduledMessageView> {
    return this.scheduled.sendNow(member, scheduledId);
  }

  @Delete('scheduled-messages/:scheduledId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiOperation({ summary: 'لغو: cancel it (a message already sent cannot be)' })
  cancel(@CurrentMember() member: MembershipContext, @Param('scheduledId', UUID) scheduledId: string): Promise<void> {
    return this.scheduled.cancel(member, scheduledId);
  }

  @Get('me/working-hours')
  @ApiOkResponse({ type: WorkingHoursViewDto })
  @ApiOperation({ summary: 'Your working hours and out-of-office auto-reply in this workspace' })
  workingHours(@CurrentMember() member: MembershipContext): Promise<WorkingHoursView> {
    return this.autoReply.get(member);
  }

  @Put('me/working-hours')
  @ApiOkResponse({ type: WorkingHoursViewDto })
  @ApiOperation({ summary: 'Sets your working hours; outside them, direct messages get your auto-reply (once a day per person)' })
  putWorkingHours(@CurrentMember() member: MembershipContext, @Body() body: UpdateWorkingHoursDto): Promise<WorkingHoursView> {
    return this.autoReply.put(member, body);
  }
}

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type {
  ConvertMessageResult,
  ConversationDetail,
  ConversationMemberView,
  ConversationView,
  CreateConversationBody,
  MediaPage,
  MessagePage,
  MessageView,
  ReactionView,
  SentMessage,
} from '@taskin/contracts';
import { Idempotent } from '../../platform/http/idempotency.js';
import type { MembershipContext } from '../../platform/http/request.js';
import { Authenticated } from '../auth/guards.js';
import { CurrentMember, WorkspaceScoped } from '../rbac/guards.js';
import { MessageTasksService } from '../bridges/message-tasks.service.js';
import {
  ConvertMessageDto,
  ConvertMessageResultDto,
  ConversationDetailDto,
  ConversationListQueryDto,
  ConversationMemberViewDto,
  ConversationViewDto,
  CreateConversationDto,
  EditMessageDto,
  MediaPageDto,
  MediaQueryDto,
  MessagePageDto,
  MessagePageQueryDto,
  MessageViewDto,
  PutConversationMemberDto,
  ReactionViewDto,
  ReadCursorDto,
  SendMessageDto,
  SentMessageDto,
  UpdateConversationDto,
  UpdateMyConversationDto,
} from './chat.dto.js';
import { ConversationsService } from './conversations.service.js';
import { MessagesService } from './messages.service.js';

const UUID = new ParseUUIDPipe();

/**
 * Conversations and messages over REST (RFC §12). Live clients send, edit, react and read over
 * the WebSocket; these routes serve history, settings and membership, and are the fallback when
 * the socket is down. Access is decided per conversation in the use cases.
 */
@ApiTags('chat')
@Authenticated()
@WorkspaceScoped()
@Controller('workspaces/:workspaceId/conversations')
export class ChatController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly messageTasks: MessageTasksService,
  ) {}

  @Get()
  @ApiOkResponse({ type: ConversationViewDto, isArray: true })
  @ApiOperation({ summary: 'The sidebar (scope=mine), or the public channels you can join (scope=public)' })
  list(@CurrentMember() member: MembershipContext, @Query() query: ConversationListQueryDto): Promise<ConversationView[]> {
    return this.conversations.list(member, query);
  }

  @Post()
  @Idempotent()
  @ApiCreatedResponse({ type: ConversationDetailDto })
  @ApiOkResponse({ type: ConversationDetailDto, description: 'An existing direct chat with that person' })
  async create(
    @CurrentMember() member: MembershipContext,
    @Body() body: CreateConversationDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ConversationDetail> {
    const { conversation, created } = await this.conversations.create(member, body as CreateConversationBody);
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return conversation;
  }

  @Get(':conversationId')
  @ApiOkResponse({ type: ConversationDetailDto })
  get(@CurrentMember() member: MembershipContext, @Param('conversationId', UUID) conversationId: string): Promise<ConversationDetail> {
    return this.conversations.get(member, conversationId);
  }

  @Patch(':conversationId')
  @ApiOkResponse({ type: ConversationDetailDto })
  update(
    @CurrentMember() member: MembershipContext,
    @Param('conversationId', UUID) conversationId: string,
    @Body() body: UpdateConversationDto,
  ): Promise<ConversationDetail> {
    return this.conversations.update(member, conversationId, body);
  }

  @Put(':conversationId/members/:userId')
  @ApiOkResponse({ type: ConversationMemberViewDto })
  @ApiOperation({ summary: 'Add a member or change their role; on yourself, join a public channel' })
  putMember(
    @CurrentMember() member: MembershipContext,
    @Param('conversationId', UUID) conversationId: string,
    @Param('userId', UUID) userId: string,
    @Body() body: PutConversationMemberDto,
  ): Promise<ConversationMemberView> {
    return this.conversations.putMember(member, conversationId, userId, body);
  }

  @Delete(':conversationId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiOperation({ summary: 'Remove a member; on yourself, leave' })
  removeMember(
    @CurrentMember() member: MembershipContext,
    @Param('conversationId', UUID) conversationId: string,
    @Param('userId', UUID) userId: string,
  ): Promise<void> {
    return this.conversations.removeMember(member, conversationId, userId);
  }

  @Put(':conversationId/me')
  @ApiOkResponse({ type: ConversationViewDto })
  @ApiOperation({ summary: 'Your own pin, mute, notification level and hidden state' })
  updateMine(
    @CurrentMember() member: MembershipContext,
    @Param('conversationId', UUID) conversationId: string,
    @Body() body: UpdateMyConversationDto,
  ): Promise<ConversationView> {
    return this.conversations.updateMine(member, conversationId, body);
  }

  /* ----------------------------------------------------------- messages */

  @Get(':conversationId/messages')
  @ApiOkResponse({ type: MessagePageDto })
  page(
    @CurrentMember() member: MembershipContext,
    @Param('conversationId', UUID) conversationId: string,
    @Query() query: MessagePageQueryDto,
  ): Promise<MessagePage> {
    return this.messages.page(member, conversationId, query);
  }

  @Post(':conversationId/messages')
  @ApiCreatedResponse({ type: SentMessageDto })
  @ApiOkResponse({ type: SentMessageDto, description: 'A retry of a message already stored' })
  @ApiOperation({ summary: 'Send over HTTP when the socket is down; retries are safe by clientMsgId' })
  async send(
    @CurrentMember() member: MembershipContext,
    @Param('conversationId', UUID) conversationId: string,
    @Body() body: SendMessageDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SentMessage> {
    const { sent } = await this.messages.send(member, conversationId, body, { audit: true });
    response.status(sent.duplicate ? HttpStatus.OK : HttpStatus.CREATED);
    return sent;
  }

  @Patch(':conversationId/messages/:messageId')
  @ApiOkResponse({ type: MessageViewDto })
  edit(
    @CurrentMember() member: MembershipContext,
    @Param('conversationId', UUID) conversationId: string,
    @Param('messageId', UUID) messageId: string,
    @Body() body: EditMessageDto,
  ): Promise<MessageView> {
    return this.messages.edit(member, messageId, body.text, { conversationId });
  }

  @Delete(':conversationId/messages/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(
    @CurrentMember() member: MembershipContext,
    @Param('conversationId', UUID) conversationId: string,
    @Param('messageId', UUID) messageId: string,
  ): Promise<void> {
    await this.messages.remove(member, messageId, { conversationId });
  }

  @Put(':conversationId/messages/:messageId/reactions/:emoji')
  @ApiOkResponse({ type: ReactionViewDto })
  react(
    @CurrentMember() member: MembershipContext,
    @Param('conversationId', UUID) conversationId: string,
    @Param('messageId', UUID) messageId: string,
    @Param('emoji') emoji: string,
  ): Promise<ReactionView> {
    return this.messages.react(member, messageId, emoji, true, { audit: true, conversationId });
  }

  @Delete(':conversationId/messages/:messageId/reactions/:emoji')
  @ApiOkResponse({ type: ReactionViewDto })
  unreact(
    @CurrentMember() member: MembershipContext,
    @Param('conversationId', UUID) conversationId: string,
    @Param('messageId', UUID) messageId: string,
    @Param('emoji') emoji: string,
  ): Promise<ReactionView> {
    return this.messages.react(member, messageId, emoji, false, { audit: true, conversationId });
  }

  @Post(':conversationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiOperation({ summary: 'Moves your read cursor forward (it never moves back)' })
  async read(@CurrentMember() member: MembershipContext, @Param('conversationId', UUID) conversationId: string, @Body() body: ReadCursorDto): Promise<void> {
    await this.messages.advance(member, conversationId, { read: body.seq }, { audit: true });
  }

  @Post(':conversationId/messages/:messageId/task')
  @Idempotent()
  @ApiOperation({ summary: 'تبدیل پیام به وظیفه: a task linked to this message (one live task per message)' })
  @ApiCreatedResponse({ type: ConvertMessageResultDto })
  @ApiOkResponse({ type: ConvertMessageResultDto, description: 'The message already had a live task; it is returned' })
  async convertToTask(
    @CurrentMember() member: MembershipContext,
    @Param('conversationId', UUID) conversationId: string,
    @Param('messageId', UUID) messageId: string,
    @Body() body: ConvertMessageDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ConvertMessageResult> {
    const result = await this.messageTasks.convert(member, conversationId, messageId, body);
    response.status(result.existing ? HttpStatus.OK : HttpStatus.CREATED);
    return result;
  }

  @Get(':conversationId/media')
  @ApiOkResponse({ type: MediaPageDto })
  media(@CurrentMember() member: MembershipContext, @Param('conversationId', UUID) conversationId: string, @Query() query: MediaQueryDto): Promise<MediaPage> {
    return this.messages.media(member, conversationId, query);
  }
}

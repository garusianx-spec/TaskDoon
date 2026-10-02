import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import { type BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, type OnGatewayConnection, type OnGatewayDisconnect, type OnGatewayInit, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { z, ZodError } from 'zod';
import type { ApiErrorCode, RealtimeEnvelope, ResumeResult, WsAck } from '@taskin/contracts';
import { AppConfig } from '../../config/app-config.js';
import { Clock } from '../../platform/clock/clock.js';
import { RequestContext } from '../../platform/context/request-context.js';
import { isUnavailable } from '../../platform/db/pg-errors.js';
import { ApiError } from '../../platform/http/api-error.js';
import { EventStream } from '../../platform/realtime/event-stream.js';
import { PresenceDirectory } from '../../platform/realtime/presence-directory.js';
import { BUS_CHANNEL, type BusOperation } from '../../platform/realtime/realtime-bus.js';
import { RealtimePublisher } from '../../platform/realtime/realtime-publisher.js';
import { isWorkspaceRoom, rooms } from '../../platform/realtime/rooms.js';
import { RedisClients } from '../../platform/redis/redis.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { MessagesService } from '../chat/messages.service.js';
import { MembershipService } from '../rbac/membership.service.js';
import { MembersService } from '../workspaces/members.service.js';
import { PresenceTracker } from './presence-tracker.js';
import { RoomScope } from './room-scope.js';
import { type BucketKind, bucketLimits, EXPIRY_GRACE_SECONDS, type RtSocket, WsJwtGuard, WsThrottlerGuard } from './ws-guards.js';

const UUID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'must be a UUID');
const schemas = {
  subscribe: z.object({ workspaceId: UUID }).strict(),
  refresh: z.object({ token: z.string().min(1).max(4096) }).strict(),
  resume: z
    .object({
      workspaceId: UUID,
      conversations: z.record(UUID, z.number().int().min(0)).default({}),
      lastEventId: z.string().max(64).nullable().default(null),
    })
    .strict(),
  send: z
    .object({
      conversationId: UUID,
      clientMsgId: UUID,
      kind: z.enum(['text', 'voice', 'file']),
      text: z.string().max(8000).optional(),
      attachmentId: UUID.optional(),
      replyToId: UUID.optional(),
      durationSec: z.number().int().min(1).max(3600).optional(),
      waveform: z.array(z.number().int().min(0).max(100)).max(64).optional(),
      asFile: z.boolean().optional(),
    })
    .strict(),
  edit: z.object({ messageId: UUID, text: z.string().min(1).max(8000) }).strict(),
  remove: z.object({ messageId: UUID }).strict(),
  react: z.object({ messageId: UUID, emoji: z.string().min(1).max(32), on: z.boolean() }).strict(),
  cursor: z.object({ conversationId: UUID, seq: z.number().int().min(0) }).strict(),
  typing: z.object({ conversationId: UUID }).strict(),
  presence: z.object({ presence: z.enum(['online', 'busy', 'away']), statusMessage: z.string().max(80).optional() }).strict(),
};

/** How long a typing indicator lasts without a renewal (RFC §4). */
const TYPING_TIMEOUT_MS = 6_000;
/** Events replayed on resume before the client is told to resync instead. */
const REPLAY_MAX = 1_000;

/**
 * The realtime gateway (RFC §4), on the `ws` role. Sockets authenticate at the handshake (see
 * RedisIoAdapter), live in their user and session rooms, and in one workspace's rooms at a time.
 * Every client event runs through the same wrapper: token expiry and revocation, the per-socket
 * rate limit, payload validation, a request context for logs and SQL settings, and an ack that
 * is `{ ok: true, … }` or `{ ok: false, code }`.
 *
 * Chat messages are stored and broadcast here directly (the hot path). Everything the REST nodes,
 * the relay and the worker publish arrives on the bus channel and is applied to local sockets.
 */
@Injectable()
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, BeforeApplicationShutdown {
  private readonly logger = new Logger('RealtimeGateway');
  readonly nodeId: string;
  private server?: Server;
  private readonly jwt: WsJwtGuard;
  private readonly throttle: WsThrottlerGuard;
  private readonly expiryTimers = new WeakMap<RtSocket, NodeJS.Timeout>();
  private readonly typing = new Map<string, NodeJS.Timeout>();
  private subscriber?: Redis;
  private bus: Promise<void> = Promise.resolve();
  private draining = false;
  private crashed = false;

  constructor(
    private readonly config: AppConfig,
    private readonly redis: RedisClients,
    private readonly publisher: RealtimePublisher,
    private readonly stream: EventStream,
    private readonly context: RequestContext,
    private readonly clock: Clock,
    private readonly auth: JwtAuthGuard,
    private readonly memberships: MembershipService,
    private readonly scope: RoomScope,
    private readonly messages: MessagesService,
    private readonly members: MembersService,
    private readonly presence: PresenceTracker,
    private readonly directory: PresenceDirectory,
  ) {
    this.nodeId = config.env.WS_NODE_ID ?? `${hostname()}-${process.pid}-${randomBytes(3).toString('hex')}`;
    this.jwt = new WsJwtGuard(config.env.ACCESS_TOKEN_TTL_SECONDS);
    this.throttle = new WsThrottlerGuard(bucketLimits({ burst: config.env.WS_SEND_BURST, perSecond: config.env.WS_SEND_PER_SECOND }));
  }

  /** The Socket.IO server this node runs (for operations and tests). */
  get io(): Server | undefined {
    return this.server;
  }

  afterInit(server: Server): void {
    this.server = server;
    this.publisher.attach(server);
    this.presence.start(this.nodeId);
    this.subscriber = this.redis.rt.duplicate();
    this.subscriber.on('error', () => undefined);
    this.subscriber.on('message', (_channel: string, raw: string) => {
      this.bus = this.bus.then(() => this.apply(JSON.parse(raw) as BusOperation)).catch((error: unknown) => {
        this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'bus operation failed');
      });
    });
    void this.subscriber.subscribe(this.redis.key(BUS_CHANNEL));
    this.logger.log({ nodeId: this.nodeId, adapter: this.config.env.RT_ADAPTER }, 'realtime gateway ready');
  }

  /* ================================================================== lifecycle */

  async handleConnection(socket: RtSocket): Promise<void> {
    if (this.draining) {
      socket.emit('server:draining', this.envelope('server:draining', null, { reconnectInMs: 0 }));
      socket.disconnect(true);
      return;
    }
    await socket.join([rooms.user(socket.data.userId), rooms.session(socket.data.sessionId)]);
    this.scheduleExpiry(socket);
    await this.presence.connected(socket);
  }

  async handleDisconnect(socket: RtSocket): Promise<void> {
    const timer = this.expiryTimers.get(socket);
    if (timer) clearTimeout(timer);
    for (const [key, typingTimer] of this.typing) {
      if (!key.startsWith(`${socket.id}:`)) continue;
      clearTimeout(typingTimer);
      this.typing.delete(key);
      this.typingOff(socket, key.slice(socket.id.length + 1));
    }
    if (!this.crashed) await this.presence.disconnected(socket);
  }

  /**
   * Graceful shutdown (RFC §3): tell every client to reconnect elsewhere after a jittered pause,
   * stop the heartbeat (the sweeper collects this node's connections after the grace, so users
   * who reconnect never flap offline), then close.
   */
  async beforeApplicationShutdown(): Promise<void> {
    if (this.crashed || !this.server) return;
    this.draining = true;
    for (const socket of this.localSockets()) {
      socket.emit('server:draining', this.envelope('server:draining', null, { reconnectInMs: Math.floor(Math.random() * 5_000) }));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    await this.messages.flushReads();
    await this.presence.drain();
    this.server.local.disconnectSockets(true);
    this.publisher.attach(undefined);
    await this.subscriber?.quit().catch(() => undefined);
  }

  /** Test support: die like a killed process: no goodbyes, no presence cleanup, sockets cut. */
  crash(): void {
    this.crashed = true;
    this.presence.stop();
    this.subscriber?.disconnect();
    for (const socket of this.localSockets()) socket.conn.close();
  }

  private scheduleExpiry(socket: RtSocket): void {
    const previous = this.expiryTimers.get(socket);
    if (previous) clearTimeout(previous);
    const delay = (socket.data.expiresAt + EXPIRY_GRACE_SECONDS) * 1000 - Date.now();
    const timer = setTimeout(() => this.expire(socket), Math.max(0, Math.min(delay, 2 ** 31 - 1)));
    timer.unref();
    this.expiryTimers.set(socket, timer);
  }

  private expire(socket: RtSocket): void {
    if (!socket.connected) return;
    socket.emit('auth:expired', this.envelope('auth:expired', null, {}));
    socket.disconnect(true);
  }

  /* ================================================================== client events */

  @SubscribeMessage('workspace:subscribe')
  subscribe(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown): Promise<WsAck<{ online: string[] }> | undefined> {
    return this.run(socket, 'workspace:subscribe', 'other', async () => {
      const { workspaceId } = schemas.subscribe.parse(body);
      const online = await this.enter(socket, workspaceId);
      return { online };
    });
  }

  @SubscribeMessage('auth:refresh')
  refresh(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown): Promise<WsAck<{ expiresAt: string }> | undefined> {
    return this.run(socket, 'auth:refresh', 'other', async () => {
      const { token } = schemas.refresh.parse(body);
      const principal = await this.auth.authenticate(token);
      if (principal.userId !== socket.data.userId) throw new ApiError('AUTH_INVALID', 'The token belongs to someone else.');
      if (principal.sessionId !== socket.data.sessionId) {
        await socket.leave(rooms.session(socket.data.sessionId));
        await socket.join(rooms.session(principal.sessionId));
        socket.data.sessionId = principal.sessionId;
      }
      socket.data.expiresAt = principal.expiresAt;
      this.scheduleExpiry(socket);
      return { expiresAt: new Date(principal.expiresAt * 1000).toISOString() };
    });
  }

  @SubscribeMessage('sync:resume')
  resume(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown): Promise<WsAck<ResumeResult> | undefined> {
    return this.run(socket, 'sync:resume', 'other', async () => {
      const input = schemas.resume.parse(body);
      // Rooms first, then the reads: whatever commits after the join arrives as a live event.
      if (socket.data.workspaceId !== input.workspaceId) await this.enter(socket, input.workspaceId);
      const member = this.member(socket);
      const conversations = await this.messages.resume(member, input.conversations);
      let replayed = 0;
      if (input.lastEventId) {
        const { entries, gap, more } = await this.stream.since(input.workspaceId, input.lastEventId, REPLAY_MAX);
        if (gap || more) {
          socket.emit('resync:required', this.envelope('resync:required', input.workspaceId, { scopes: ['all'] }));
        } else {
          for (const entry of entries) {
            if (!entry.rooms.some((room) => socket.rooms.has(room))) continue;
            socket.emit(entry.envelope.type, entry.envelope as never);
            replayed += 1;
          }
        }
      }
      return { conversations, replayed };
    });
  }

  @SubscribeMessage('message:send')
  send(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown) {
    return this.run(socket, 'message:send', 'send', async () => {
      const { conversationId, ...message } = schemas.send.parse(body);
      const { sent } = await this.messages.send(this.member(socket), conversationId, message, { socketId: socket.id });
      return { ...sent };
    });
  }

  @SubscribeMessage('message:edit')
  edit(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown) {
    return this.run(socket, 'message:edit', 'other', async () => {
      const { messageId, text } = schemas.edit.parse(body);
      const view = await this.messages.edit(this.member(socket), messageId, text);
      return { editedAt: view.editedAt ?? '' };
    });
  }

  @SubscribeMessage('message:delete')
  remove(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown) {
    return this.run(socket, 'message:delete', 'other', async () => {
      const { messageId } = schemas.remove.parse(body);
      await this.messages.remove(this.member(socket), messageId);
      return {};
    });
  }

  @SubscribeMessage('message:react')
  react(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown) {
    return this.run(socket, 'message:react', 'other', async () => {
      const { messageId, emoji, on } = schemas.react.parse(body);
      return { reaction: await this.messages.react(this.member(socket), messageId, emoji, on) };
    });
  }

  @SubscribeMessage('message:delivered')
  delivered(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown) {
    return this.run(socket, 'message:delivered', 'other', async () => {
      const { conversationId, seq } = schemas.cursor.parse(body);
      this.messages.queueCursor(this.member(socket), this.inConversation(socket, conversationId), { delivered: seq });
      return {};
    });
  }

  @SubscribeMessage('message:read')
  read(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown) {
    return this.run(socket, 'message:read', 'other', async () => {
      const { conversationId, seq } = schemas.cursor.parse(body);
      this.messages.queueCursor(this.member(socket), this.inConversation(socket, conversationId), { read: seq });
      return {};
    });
  }

  @SubscribeMessage('typing:start')
  async typingStart(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown): Promise<void> {
    await this.run(socket, 'typing:start', 'typing', async () => {
      const { conversationId } = schemas.typing.parse(body);
      const room = rooms.conversation(conversationId);
      if (!socket.rooms.has(room)) throw ApiError.notFound('The conversation');
      const key = `${socket.id}:${conversationId}`;
      const running = this.typing.get(key);
      if (running) clearTimeout(running);
      else socket.volatile.to(room).emit('typing', this.envelope('typing', socket.data.workspaceId, { conversationId, userId: socket.data.userId, typing: true }));
      const timer = setTimeout(() => {
        this.typing.delete(key);
        this.typingOff(socket, conversationId);
      }, TYPING_TIMEOUT_MS);
      timer.unref();
      this.typing.set(key, timer);
      return {};
    });
  }

  @SubscribeMessage('typing:stop')
  async typingStop(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown): Promise<void> {
    await this.run(socket, 'typing:stop', 'other', async () => {
      const { conversationId } = schemas.typing.parse(body);
      const key = `${socket.id}:${conversationId}`;
      const running = this.typing.get(key);
      if (running) {
        clearTimeout(running);
        this.typing.delete(key);
        this.typingOff(socket, conversationId);
      }
      return {};
    });
  }

  @SubscribeMessage('presence:set')
  setPresence(@ConnectedSocket() socket: RtSocket, @MessageBody() body: unknown) {
    return this.run(socket, 'presence:set', 'other', async () => {
      const input = schemas.presence.parse(body);
      await this.members.updatePresence(this.member(socket), input);
      return {};
    });
  }

  private typingOff(socket: RtSocket, conversationId: string): void {
    socket.volatile
      .to(rooms.conversation(conversationId))
      .emit('typing', this.envelope('typing', socket.data.workspaceId, { conversationId, userId: socket.data.userId, typing: false }));
  }

  /* ================================================================== the wrapper */

  private async run<T extends object>(socket: RtSocket, event: string, bucket: BucketKind, work: () => Promise<T>): Promise<WsAck<T> | undefined> {
    if (this.crashed) return undefined;
    const now = this.clock.now();
    const standing = this.jwt.check(socket, Math.floor(now.getTime() / 1000));
    if (standing !== 'ok') {
      // Answer first, then drop: the client learns why its call failed.
      setTimeout(() => (standing === 'expired' ? this.expire(socket) : socket.disconnect(true)), 50).unref();
      return { ok: false, code: standing === 'expired' ? 'AUTH_EXPIRED' : 'SESSION_REVOKED' };
    }
    const wait = this.throttle.take(socket, bucket, now.getTime());
    if (wait > 0) return { ok: false, code: 'RATE_LIMITED', retryAfterMs: wait };
    return this.context.run(
      { userId: socket.data.userId, sessionId: socket.data.sessionId, ...(socket.data.workspaceId ? { workspaceId: socket.data.workspaceId } : {}) },
      async () => {
        try {
          const result = await work();
          return { ok: true as const, ...result };
        } catch (error) {
          return this.failure(error, socket, event);
        }
      },
    );
  }

  private failure(error: unknown, socket: RtSocket, event: string): WsAck<never> {
    if (error instanceof ZodError) return { ok: false, code: 'VALIDATION_FAILED', message: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') };
    if (error instanceof ApiError) return { ok: false, code: error.code as ApiErrorCode, ...(error.detail ? { message: error.detail } : {}) };
    if (isUnavailable(error)) {
      this.logger.warn({ error: error instanceof Error ? error.message : String(error), event, connId: socket.data.connId }, 'socket event unavailable');
      return { ok: false, code: 'SERVICE_UNAVAILABLE' };
    }
    this.logger.error({ error: error instanceof Error ? error.message : String(error), event, connId: socket.data.connId }, 'socket event failed');
    return { ok: false, code: 'INTERNAL' };
  }

  private member(socket: RtSocket) {
    const member = socket.data.member;
    if (!member) throw new ApiError('NOT_SUBSCRIBED');
    return member;
  }

  /** The socket is in a conversation's room exactly while its user is a member (rooms follow membership). */
  private inConversation(socket: RtSocket, conversationId: string): string {
    if (!socket.rooms.has(rooms.conversation(conversationId))) throw ApiError.notFound('The conversation');
    return conversationId;
  }

  /** Makes `workspaceId` the socket's live workspace: leaves the old rooms, joins the new. */
  private async enter(socket: RtSocket, workspaceId: string): Promise<string[]> {
    const member = await this.memberships.load(workspaceId, socket.data.userId);
    if (!member) {
      if (await this.memberships.suspendedFor(workspaceId, socket.data.userId)) throw new ApiError('WORKSPACE_SUSPENDED');
      throw ApiError.notFound('The workspace');
    }
    const scope = await this.scope.of(member);
    const stale = [...socket.rooms].filter((room) => isWorkspaceRoom(room));
    for (const room of stale) await socket.leave(room);
    await socket.join([...scope.rooms]);
    socket.data.workspaceId = workspaceId;
    socket.data.member = member;
    return [...(await this.directory.online(scope.memberIds))];
  }

  /* ================================================================== the bus */

  /** Applies one operation to this node's own sockets. */
  async apply(operation: BusOperation): Promise<void> {
    const server = this.server;
    if (!server || this.crashed) return;
    switch (operation.op) {
      case 'emit': {
        let target = server.local.to([...operation.rooms]);
        if (operation.except?.length) target = target.except([...operation.except]);
        target.emit(operation.envelope.type, operation.envelope);
        return;
      }
      case 'join': {
        for (const userId of operation.userIds) {
          for (const socket of this.localSockets(rooms.user(userId))) {
            if (socket.data.workspaceId === operation.workspaceId) await socket.join([...operation.rooms]);
          }
        }
        return;
      }
      case 'leave': {
        const targets = operation.userIds ? operation.userIds.flatMap((userId) => this.localSockets(rooms.user(userId))) : operation.rooms.flatMap((room) => this.localSockets(room));
        for (const socket of targets) for (const room of operation.rooms) await socket.leave(room);
        return;
      }
      case 'rescope':
        await this.rescope(operation.workspaceId, operation.userIds, operation.reason);
        return;
      case 'evict': {
        for (const socket of this.workspaceSockets(operation.workspaceId, operation.userIds)) {
          socket.emit('workspace:removed', this.envelope('workspace:removed', operation.workspaceId, { workspaceId: operation.workspaceId, reason: operation.reason }));
          await this.leaveWorkspace(socket);
        }
        return;
      }
      case 'revoke': {
        this.jwt.revoke(operation.sessionIds, Math.floor(this.clock.now().getTime() / 1000));
        for (const sessionId of operation.sessionIds) {
          for (const socket of this.localSockets(rooms.session(sessionId))) {
            socket.emit('session:revoked', this.envelope('session:revoked', null, { reason: operation.reason }));
            socket.disconnect(true);
          }
        }
        return;
      }
    }
  }

  /** Re-evaluates the rooms of these users' sockets (all, when null) after a permission change. */
  private async rescope(workspaceId: string, userIds: readonly string[] | null, reason: string): Promise<void> {
    const sockets = this.workspaceSockets(workspaceId, userIds);
    const byUser = new Map<string, RtSocket[]>();
    for (const socket of sockets) byUser.set(socket.data.userId, [...(byUser.get(socket.data.userId) ?? []), socket]);
    for (const [userId, own] of byUser) {
      const member = await this.memberships.load(workspaceId, userId);
      if (!member) {
        const why = (await this.memberships.suspendedFor(workspaceId, userId)) ? 'suspended' : 'removed';
        for (const socket of own) {
          socket.emit('workspace:removed', this.envelope('workspace:removed', workspaceId, { workspaceId, reason: why }));
          await this.leaveWorkspace(socket);
        }
        continue;
      }
      const wanted = new Set((await this.scope.of(member)).rooms);
      for (const socket of own) {
        for (const room of [...socket.rooms]) if (isWorkspaceRoom(room) && !wanted.has(room)) await socket.leave(room);
        await socket.join([...wanted]);
        socket.data.member = member;
        socket.emit('permissions:updated', this.envelope('permissions:updated', workspaceId, { reason }));
      }
    }
  }

  private async leaveWorkspace(socket: RtSocket): Promise<void> {
    for (const room of [...socket.rooms]) if (isWorkspaceRoom(room)) await socket.leave(room);
    socket.data.workspaceId = null;
    socket.data.member = null;
  }

  /** Local sockets live in `workspaceId`, optionally only those of `userIds`. */
  private workspaceSockets(workspaceId: string, userIds: readonly string[] | null): RtSocket[] {
    const wanted = userIds ? new Set(userIds) : null;
    return this.localSockets(rooms.workspace(workspaceId)).filter((socket) => socket.data.workspaceId === workspaceId && (!wanted || wanted.has(socket.data.userId)));
  }

  /** This node's sockets, all or in one room. */
  localSockets(room?: string): RtSocket[] {
    const namespace = this.server?.of('/');
    if (!namespace) return [];
    if (!room) return [...namespace.sockets.values()] as unknown as RtSocket[];
    const ids = namespace.adapter.rooms.get(room);
    if (!ids) return [];
    return [...ids].flatMap((id) => {
      const socket = namespace.sockets.get(id);
      return socket ? [socket as unknown as RtSocket] : [];
    });
  }

  private envelope<T extends RealtimeEnvelope['type']>(type: T, workspaceId: string | null, data: RealtimeEnvelope<T>['data']): RealtimeEnvelope<T> {
    return this.publisher.envelope({ type, workspaceId, rooms: [], data, actorId: null, requestId: null });
  }
}

import { randomBytes } from 'node:crypto';
import { type INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter, createShardedAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import { AppConfig } from '../../config/app-config.js';
import { ApiError } from '../../platform/http/api-error.js';
import { RedisClients } from '../../platform/redis/redis.js';
import { JwtAuthGuard } from '../auth/guards.js';
import type { RtSocket } from './ws-guards.js';

/** Where the edge routes WebSocket traffic (`/rt`), and the only transport accepted. */
export const SOCKET_PATH = '/rt';
/** Frames above this close the connection; files never travel over the socket (RFC §4). */
export const MAX_FRAME_BYTES = 64 * 1024;

/**
 * Socket.IO on redis-rt (RFC §4): the classic Pub/Sub adapter, or the sharded one (`RT_ADAPTER`)
 * for a Redis Cluster. The handshake is authenticated here, in middleware, because Nest guards run
 * per message: a connection without a valid, unrevoked access token in `auth.token` never opens,
 * and the client's `connect_error` carries `AUTH_EXPIRED`, `AUTH_INVALID` or `SESSION_REVOKED`.
 * When the check itself cannot run (the database or Redis is unavailable) the code is
 * `SERVICE_UNAVAILABLE`: the token may be fine, so the client keeps it and retries with backoff.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly clients: Redis[] = [];

  constructor(private readonly context: INestApplicationContext) {
    super(context);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const config = this.context.get(AppConfig);
    const redis = this.context.get(RedisClients);
    const server = super.createIOServer(port, {
      ...options,
      path: SOCKET_PATH,
      // WebSocket only: no long-polling, so no sticky sessions are needed at the edge.
      transports: ['websocket'],
      pingInterval: 25_000,
      pingTimeout: 20_000,
      maxHttpBufferSize: MAX_FRAME_BYTES,
      serveClient: false,
      cors: { origin: [...config.allowedOrigins], credentials: true },
    } as ServerOptions) as Server;

    const pub = redis.rt.duplicate();
    const sub = redis.rt.duplicate();
    for (const client of [pub, sub]) {
      client.on('error', () => undefined);
      this.clients.push(client);
    }
    const prefix = redis.key('sio');
    server.adapter(config.env.RT_ADAPTER === 'redis-sharded' ? createShardedAdapter(pub, sub, { channelPrefix: prefix }) : createAdapter(pub, sub, { key: prefix }));

    const guard = this.context.get(JwtAuthGuard);
    const logger = new Logger('RedisIoAdapter');
    server.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
        next(handshakeError('AUTH_INVALID'));
        return;
      }
      guard
        .authenticate(token)
        .then((principal) => {
          const data: RtSocket['data'] = {
            userId: principal.userId,
            sessionId: principal.sessionId,
            expiresAt: principal.expiresAt,
            connId: randomBytes(6).toString('base64url'),
            workspaceId: null,
            member: null,
          };
          socket.data = data;
          next();
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError) {
            next(handshakeError(error.code));
            return;
          }
          logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'handshake check unavailable');
          next(handshakeError('SERVICE_UNAVAILABLE'));
        });
    });
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.allSettled(this.clients.map((client) => client.quit()));
  }
}

function handshakeError(code: string): Error {
  const error = new Error(code) as Error & { data?: { code: string } };
  error.data = { code };
  return error;
}

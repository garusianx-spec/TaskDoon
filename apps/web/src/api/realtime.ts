import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ManualPresence,
  RealtimeEnvelope,
  ResumeBody,
  ResumeResult,
  SendMessageBody,
  SentMessage,
  ServerToClientEvents,
  WsAck,
  ReactionView,
} from '@taskin/contracts';

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface RealtimeHooks {
  /** The access token for the handshake (read on every connect, so reconnects use a fresh one). */
  readonly token: () => string | null;
  /** Every server event, in arrival order. */
  readonly onEvent: (envelope: RealtimeEnvelope) => void;
  readonly onStatus: (status: ConnectionStatus) => void;
  /** After a reconnect: what the client already has, so the server sends only what it missed. */
  readonly resumeFrom: () => ResumeBody | null;
  readonly onResumed: (result: ResumeResult) => void;
  /** The handshake was refused for good (`SESSION_REVOKED`, `AUTH_INVALID`). */
  readonly onRejected: (code: string) => void;
  /** The token is too old for the handshake: refresh it, then reconnect. Resolves false when signed out. */
  readonly refreshToken: () => Promise<boolean>;
}

/** Where the gateway listens: this origin (proxied to the API), unless `NEXT_PUBLIC_RT_URL` points elsewhere. */
function gatewayUrl(): string {
  return process.env.NEXT_PUBLIC_RT_URL || window.location.origin;
}

const ACK_TIMEOUT_MS = 10_000;

/**
 * One Socket.IO connection per tab (RFC §4): WebSocket only, the token in the handshake, one live
 * workspace at a time. Socket.IO reconnects by itself after a dropped connection; a handshake the
 * server refuses (expired token, database busy) is retried here, since Socket.IO leaves those alone.
 */
export class RealtimeClient {
  private socket: RealtimeSocket | null = null;
  private workspaceId: string | null = null;
  private connectedOnce = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;

  constructor(private readonly hooks: RealtimeHooks) {}

  connect(workspaceId: string): void {
    this.workspaceId = workspaceId;
    if (this.socket) {
      if (this.socket.connected) void this.subscribe();
      return;
    }
    const socket: RealtimeSocket = io(gatewayUrl(), {
      path: '/rt',
      transports: ['websocket'],
      auth: (callback) => callback({ token: this.hooks.token() ?? '' }),
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      randomizationFactor: 0.5,
    });
    this.socket = socket;
    this.hooks.onStatus('connecting');

    socket.on('connect', () => {
      this.retries = 0;
      void this.subscribe().then(() => {
        this.hooks.onStatus('online');
        this.connectedOnce = true;
      });
    });
    socket.on('disconnect', (reason) => {
      this.hooks.onStatus('offline');
      // The server closed it (draining, expired token): Socket.IO does not come back by itself.
      if (reason === 'io server disconnect') this.scheduleRetry();
    });
    socket.on('connect_error', (error: Error & { data?: { code?: string } }) => {
      this.hooks.onStatus('offline');
      const code = error.data?.code;
      if (code === 'SESSION_REVOKED' || code === 'AUTH_INVALID') {
        this.hooks.onRejected(code);
        return;
      }
      if (code === 'AUTH_EXPIRED') {
        void this.hooks.refreshToken().then((ok) => (ok ? this.scheduleRetry(0) : this.hooks.onRejected(code)));
        return;
      }
      // Refused by middleware (e.g. SERVICE_UNAVAILABLE): Socket.IO does not retry these.
      if (code) this.scheduleRetry();
    });
    socket.onAny((_event: string, envelope: RealtimeEnvelope) => this.hooks.onEvent(envelope));
    socket.on('server:draining', (envelope) => {
      setTimeout(() => {
        socket.disconnect();
        socket.connect();
      }, envelope.data.reconnectInMs);
    });
  }

  /** A fresh access token for the open socket (a minute of grace after the old one expires). */
  refreshToken(token: string): void {
    if (this.socket?.connected) this.socket.emit('auth:refresh', { token }, () => undefined);
  }

  disconnect(): void {
    clearTimeout(this.retryTimer);
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.connectedOnce = false;
    this.workspaceId = null;
    this.hooks.onStatus('offline');
  }

  send(conversationId: string, body: SendMessageBody): Promise<WsAck<SentMessage>> {
    return this.call((socket, ack) => socket.emit('message:send', { ...body, conversationId }, ack));
  }

  react(messageId: string, emoji: string, on: boolean): Promise<WsAck<{ readonly reaction: ReactionView }>> {
    return this.call((socket, ack) => socket.emit('message:react', { messageId, emoji, on }, ack));
  }

  markRead(conversationId: string, seq: number): Promise<WsAck> {
    return this.call((socket, ack) => socket.emit('message:read', { conversationId, seq }, ack));
  }

  typing(conversationId: string, typing: boolean): void {
    this.socket?.emit(typing ? 'typing:start' : 'typing:stop', { conversationId });
  }

  setPresence(presence: ManualPresence, statusMessage: string): Promise<WsAck> {
    return this.call((socket, ack) => socket.emit('presence:set', { presence, statusMessage }, ack));
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  private async subscribe(): Promise<void> {
    const socket = this.socket;
    const workspaceId = this.workspaceId;
    if (!socket || !workspaceId) return;
    await this.call<{ readonly online: readonly string[] }>((live, ack) => live.emit('workspace:subscribe', { workspaceId }, ack));
    // Back after a drop: ask for what was missed while away.
    if (this.connectedOnce) {
      const resume = this.hooks.resumeFrom();
      if (resume && resume.workspaceId === workspaceId) {
        const result = await this.call<ResumeResult>((live, ack) => live.emit('sync:resume', resume, ack));
        if (result.ok) this.hooks.onResumed(result);
      }
    }
  }

  private scheduleRetry(delay?: number): void {
    clearTimeout(this.retryTimer);
    const wait = delay ?? Math.min(10_000, 1_000 * 2 ** this.retries) * (0.5 + Math.random());
    this.retries += 1;
    this.retryTimer = setTimeout(() => this.socket?.connect(), wait);
  }

  private call<T extends object = Record<string, never>>(
    emit: (socket: RealtimeSocket, ack: (response: WsAck<T>) => void) => void,
  ): Promise<WsAck<T>> {
    const socket = this.socket;
    if (!socket?.connected) return Promise.resolve({ ok: false, code: 'SERVICE_UNAVAILABLE', message: 'offline' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, code: 'SERVICE_UNAVAILABLE', message: 'timeout' }), ACK_TIMEOUT_MS);
      emit(socket, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }
}

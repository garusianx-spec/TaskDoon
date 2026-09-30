import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RealtimeEnvelope, RealtimeEventType, ServerToClientEvents, WsAck } from '@taskin/contracts';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface Connected {
  readonly socket: ClientSocket;
  /** Every server event received, in order. */
  readonly events: RealtimeEnvelope[];
  /** Resolves when `socket.disconnect` happens from the server side (or the transport dies). */
  readonly closed: Promise<string>;
}

/** Connects the way the web client will: WebSocket only, token in `auth`, no automatic reconnects. */
export function connect(baseUrl: string, token: string): Promise<Connected> {
  const socket: ClientSocket = io(baseUrl, { path: '/rt', transports: ['websocket'], auth: { token }, reconnection: false, forceNew: true, timeout: 5_000 });
  const events: RealtimeEnvelope[] = [];
  socket.onAny((_event: string, envelope: RealtimeEnvelope) => events.push(envelope));
  const closed = new Promise<string>((resolve) => socket.on('disconnect', (reason) => resolve(reason)));
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve({ socket, events, closed }));
    socket.once('connect_error', (error: Error & { data?: { code?: string } }) => {
      socket.close();
      reject(Object.assign(new Error(error.data?.code ?? error.message), { code: error.data?.code ?? error.message }));
    });
  });
}

type AckOf<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]> extends [unknown, (response: infer A) => void] ? A : never;

/** Emits and waits for the ack. */
export async function call<E extends keyof ClientToServerEvents>(socket: ClientSocket, event: E, body: Parameters<ClientToServerEvents[E]>[0], timeoutMs = 5_000): Promise<AckOf<E>> {
  const emit = socket.timeout(timeoutMs).emitWithAck as unknown as (event: string, body: unknown) => Promise<AckOf<E>>;
  return emit.call(socket.timeout(timeoutMs), event, body);
}

/** The ack, which must be `ok`. */
export async function ok<E extends keyof ClientToServerEvents>(socket: ClientSocket, event: E, body: Parameters<ClientToServerEvents[E]>[0]): Promise<Extract<AckOf<E>, { ok: true }>> {
  const ack = (await call(socket, event, body)) as WsAck<object>;
  if (!ack.ok) throw new Error(`${event} failed: ${JSON.stringify(ack)}`);
  return ack as Extract<AckOf<E>, { ok: true }>;
}

/** Waits for the first event of `type` (already received or still to come) matching `test`. */
export async function next<T extends RealtimeEventType>(
  connected: Connected,
  type: T,
  test: (envelope: RealtimeEnvelope<T>) => boolean = () => true,
  timeoutMs = 5_000,
): Promise<RealtimeEnvelope<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = connected.events.find((envelope) => envelope.type === type && test(envelope as RealtimeEnvelope<T>));
    if (found) return found as RealtimeEnvelope<T>;
    if (Date.now() > deadline) throw new Error(`no ${type} within ${timeoutMs} ms; got ${connected.events.map((envelope) => envelope.type).join(', ') || 'nothing'}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Resolves after `ms`, for "nothing arrives" checks. */
export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls `check` until it returns true (or fails after `timeoutMs`). */
export async function eventually(check: () => boolean | Promise<boolean>, timeoutMs = 5_000, what = 'the condition'): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`${what} did not hold within ${timeoutMs} ms`);
    await pause(25);
  }
}

/** The events of `type` received so far, typed. */
export function received<T extends RealtimeEventType>(connected: Connected, type: T): RealtimeEnvelope<T>[] {
  return connected.events.filter((envelope): envelope is RealtimeEnvelope<T> => envelope.type === type);
}

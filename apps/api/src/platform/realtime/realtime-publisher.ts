import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { RealtimeEnvelope, RealtimeEventMap, RealtimeEventType } from '@taskin/contracts';
import { Clock } from '../clock/clock.js';
import { RequestContext } from '../context/request-context.js';
import { RedisClients } from '../redis/redis.js';
import { EventStream } from './event-stream.js';
import { BUS_CHANNEL, type BusOperation } from './realtime-bus.js';

export interface RealtimeEmit<T extends RealtimeEventType = RealtimeEventType> {
  readonly type: T;
  readonly workspaceId: string | null;
  readonly rooms: readonly string[];
  readonly data: RealtimeEventMap[T];
  /** Rooms (or socket ids) to leave out, e.g. the sender's own socket. */
  readonly except?: readonly string[];
  readonly version?: number;
  /** Default to the current request's user and id. */
  readonly actorId?: string | null;
  readonly requestId?: string | null;
  readonly occurredAt?: string;
  /** Appended to the workspace's replay stream first, so a reconnecting client can catch up. */
  readonly durable?: boolean;
}

export type RealtimeItem = { readonly emit: RealtimeEmit } | { readonly op: BusOperation };

/**
 * Sends realtime events and room operations to the WebSocket nodes, after the change they
 * describe has committed. On a node that hosts the gateway, events go straight through the
 * Socket.IO adapter; elsewhere (REST nodes, the relay, the worker) through the bus channel that
 * every node applies locally. Delivery is best effort: a failure is logged, never thrown, since
 * the change itself is already committed and clients recover by replay or refetch.
 */
@Injectable()
export class RealtimePublisher {
  private readonly logger = new Logger('RealtimePublisher');
  private server?: Server;

  constructor(
    private readonly redis: RedisClients,
    private readonly stream: EventStream,
    private readonly context: RequestContext,
    private readonly clock: Clock,
  ) {}

  /** Called by the gateway: this process delivers through its own Socket.IO server. */
  attach(server: Server | undefined): void {
    this.server = server;
  }

  get channel(): string {
    return this.redis.key(BUS_CHANNEL);
  }

  envelope<T extends RealtimeEventType>(event: RealtimeEmit<T>, eventId: string | null = null): RealtimeEnvelope<T> {
    return {
      eventId,
      type: event.type,
      workspaceId: event.workspaceId,
      occurredAt: event.occurredAt ?? this.clock.now().toISOString(),
      actorId: event.actorId !== undefined ? event.actorId : (this.context.userId ?? null),
      requestId: event.requestId !== undefined ? event.requestId : (this.context.requestId ?? null),
      ...(event.version !== undefined ? { version: event.version } : {}),
      data: event.data,
    };
  }

  /** Emits events, each to its rooms; on a gateway node without a bus round trip. */
  async emit(...events: readonly RealtimeEmit[]): Promise<void> {
    if (events.length === 0) return;
    try {
      const envelopes = await this.record(events);
      const server = this.server;
      if (server) {
        events.forEach((event, index) => {
          let target = server.to([...event.rooms]);
          if (event.except?.length) target = target.except([...event.except]);
          target.emit(event.type, envelopes[index]);
        });
        return;
      }
      await this.send(events.map((event, index): BusOperation => ({ op: 'emit', rooms: event.rooms, except: event.except, envelope: envelopes[index] as RealtimeEnvelope })));
    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : String(error), types: events.map((event) => event.type) }, 'realtime emit failed');
    }
  }

  /**
   * Room operations and events that must apply in exactly this order (join, then announce), so
   * all of them travel the bus, whichever process publishes.
   */
  async publish(items: readonly RealtimeItem[]): Promise<void> {
    if (items.length === 0) return;
    try {
      const emits = items.flatMap((item) => ('emit' in item ? [item.emit] : []));
      const envelopes = await this.record(emits);
      let next = 0;
      await this.send(
        items.map((item): BusOperation => {
          if ('op' in item) return item.op;
          const envelope = envelopes[next] as RealtimeEnvelope;
          next += 1;
          return { op: 'emit', rooms: item.emit.rooms, except: item.emit.except, envelope };
        }),
      );
    } catch (error) {
      this.logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'realtime publish failed');
    }
  }

  /** Appends the durable events to their streams (one round trip) and builds every envelope. */
  private async record(events: readonly RealtimeEmit[]): Promise<RealtimeEnvelope[]> {
    const envelopes = events.map((event) => this.envelope(event));
    const durable = events.flatMap((event, index) => (event.durable && event.workspaceId ? [{ event, index }] : []));
    if (durable.length > 0) {
      const ids = await this.stream.append(
        durable.map(({ event, index }) => ({ workspaceId: event.workspaceId as string, rooms: event.rooms, envelope: envelopes[index] as RealtimeEnvelope })),
      );
      durable.forEach(({ index }, position) => {
        envelopes[index] = { ...(envelopes[index] as RealtimeEnvelope), eventId: ids[position] ?? null };
      });
    }
    return envelopes;
  }

  private async send(operations: readonly BusOperation[]): Promise<void> {
    if (operations.length === 0) return;
    const pipeline = this.redis.rt.pipeline();
    for (const operation of operations) pipeline.publish(this.channel, JSON.stringify(operation));
    await pipeline.exec();
  }
}

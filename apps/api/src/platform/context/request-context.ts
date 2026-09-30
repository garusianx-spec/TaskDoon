import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { CLS_REQ, ClsService, type ClsStore } from 'nestjs-cls';

/**
 * Everything the platform needs to know about the unit of work in progress: an HTTP request, a
 * WebSocket event or a queue job. Stored in AsyncLocalStorage (nestjs-cls), so logs, audit rows,
 * outbox headers and SQL settings pick it up without threading it through every call.
 */
export interface RequestContextStore extends ClsStore {
  requestId: string;
  /** W3C trace id (32 hex chars), from `traceparent` or the active OpenTelemetry span. */
  traceId: string;
  traceparent?: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  workspaceId?: string;
  /** SQL statements run so far (transaction control excluded); see SqlCounter. */
  sqlCount: number;
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

/** A client-supplied request id is kept only when it is a sane token; otherwise a fresh one. */
export function acceptRequestId(candidate: unknown): string {
  return typeof candidate === 'string' && REQUEST_ID.test(candidate) ? candidate : randomBytes(12).toString('base64url');
}

/** The trace id of a valid W3C `traceparent`, or a new random one. */
export function traceIdFrom(traceparent: unknown): string {
  if (typeof traceparent === 'string') {
    const match = TRACEPARENT.exec(traceparent);
    if (match?.[1] && match[1] !== '0'.repeat(32)) return match[1];
  }
  return randomBytes(16).toString('hex');
}

@Injectable()
export class RequestContext {
  constructor(private readonly cls: ClsService<RequestContextStore>) {}

  get active(): boolean {
    return this.cls.isActive();
  }

  get requestId(): string | undefined {
    return this.active ? this.cls.get('requestId') : undefined;
  }

  get traceId(): string | undefined {
    return this.active ? this.cls.get('traceId') : undefined;
  }

  get userId(): string | undefined {
    return this.active ? this.cls.get('userId') : undefined;
  }

  get sessionId(): string | undefined {
    return this.active ? this.cls.get('sessionId') : undefined;
  }

  get workspaceId(): string | undefined {
    return this.active ? this.cls.get('workspaceId') : undefined;
  }

  get ip(): string | undefined {
    return this.active ? this.cls.get('ip') : undefined;
  }

  get userAgent(): string | undefined {
    return this.active ? this.cls.get('userAgent') : undefined;
  }

  get traceparent(): string | undefined {
    return this.active ? this.cls.get('traceparent') : undefined;
  }

  set<K extends keyof RequestContextStore>(key: K, value: RequestContextStore[K]): void {
    if (!this.active) return;
    this.cls.set(key, value);
    // Mirror onto the request so pino-http's final "request completed" line carries it too.
    const request = this.cls.get(CLS_REQ) as { logContext?: Record<string, unknown> } | undefined;
    if (request && typeof value === 'string') (request.logContext ??= {})[key as string] = value;
  }

  /** Runs `work` in a fresh context, as queue jobs and the outbox relay do. */
  run<T>(values: Partial<RequestContextStore>, work: () => Promise<T>): Promise<T> {
    return this.cls.run(async () => {
      this.cls.set('requestId', values.requestId ?? acceptRequestId(undefined));
      this.cls.set('traceId', values.traceId ?? traceIdFrom(values.traceparent));
      this.cls.set('sqlCount', 0);
      for (const [key, value] of Object.entries(values)) {
        if (value !== undefined && key !== 'requestId' && key !== 'traceId') {
          this.cls.set(key as keyof RequestContextStore, value as never);
        }
      }
      return work();
    });
  }

  /** Counts one statement; the test suite reads it back to hold endpoints to a query budget. */
  countStatement(): void {
    if (this.active) this.cls.set('sqlCount', (this.cls.get('sqlCount') ?? 0) + 1);
  }

  get sqlCount(): number {
    return this.active ? (this.cls.get('sqlCount') ?? 0) : 0;
  }
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DestinationStream } from 'pino';
import type { Params } from 'nestjs-pino';
import type { ClsService } from 'nestjs-cls';
import type { AppConfig } from '../../config/app-config.js';
import { acceptRequestId, type RequestContextStore, traceIdFrom } from '../context/request-context.js';
import { trace } from '@opentelemetry/api';

/**
 * Structured JSON logs (pino). Every line carries the request id and trace id, and, once known,
 * the user, session and workspace, so a Loki query on any of them returns the whole story.
 * Secrets are redacted by path; phone numbers are masked before they are logged at all.
 */

/** Fields the request pipeline learns as it goes, mirrored onto the request for the final log line. */
export interface LogContext {
  requestId?: string;
  traceId?: string;
  userId?: string;
  sessionId?: string;
  workspaceId?: string;
}

export type RequestWithLogContext = IncomingMessage & { logContext?: LogContext };

/**
 * Settles the request id and trace id once per request, whichever middleware asks first (pino-http
 * or the request-context middleware); the other reuses them.
 */
export function ensureLogContext(request: RequestWithLogContext): LogContext & { requestId: string; traceId: string } {
  const current = request.logContext;
  if (current?.requestId && current.traceId) return current as LogContext & { requestId: string; traceId: string };
  const traceparent = typeof request.headers.traceparent === 'string' ? request.headers.traceparent : undefined;
  const settled = {
    ...current,
    requestId: acceptRequestId(request.headers['x-request-id']),
    traceId: trace.getActiveSpan()?.spanContext().traceId ?? traceIdFrom(traceparent),
  };
  request.logContext = settled;
  return settled;
}

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.otp',
  '*.code',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.signupToken',
] as const;

/** `+989121234567` → `+98912***4567`. */
export function maskPhone(phone: string): string {
  return phone.length > 8 ? `${phone.slice(0, 6)}***${phone.slice(-4)}` : '***';
}

export function loggerParams(config: AppConfig, cls: ClsService<RequestContextStore>, destination?: DestinationStream): Params {
  const env = config.env;
  return {
    pinoHttp: [
      {
        level: env.LOG_LEVEL,
        base: { service: env.OTEL_SERVICE_NAME, role: env.APP_ROLE },
        redact: { paths: [...REDACT_PATHS], censor: '[redacted]' },
        transport: env.LOG_PRETTY && !destination ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        // The response echoes the id, whether the client sent it or we made it up.
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const { requestId } = ensureLogContext(req as RequestWithLogContext);
          res.setHeader('X-Request-Id', requestId);
          return requestId;
        },
        // Inside a request context the mixin below supplies the correlation fields. Only when a
        // line is written outside one (a request that failed before the context existed) do the
        // fields mirrored onto the request fill in, so no key is ever written twice.
        customProps: (req: IncomingMessage) => {
          if (cls.isActive()) return {};
          const { requestId, traceId, userId, sessionId, workspaceId } = (req as RequestWithLogContext).logContext ?? {};
          return { requestId, traceId, userId, sessionId, workspaceId };
        },
        // Application log lines inside a request or job get the same correlation fields.
        mixin: () => {
          if (!cls.isActive()) return {};
          return {
            requestId: cls.get('requestId'),
            traceId: cls.get('traceId'),
            userId: cls.get('userId'),
            sessionId: cls.get('sessionId'),
            workspaceId: cls.get('workspaceId'),
          };
        },
        serializers: {
          req: (req: { method?: string; url?: string; id?: string }) => ({
            id: req.id,
            method: req.method,
            // Query strings may carry tokens (invitation links); log the path only.
            url: req.url?.split('?')[0],
          }),
          res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
        },
        customLogLevel: (_req: IncomingMessage, res: ServerResponse, error?: Error) =>
          error || res.statusCode >= 500 ? 'error' : 'info',
        autoLogging: { ignore: (req: IncomingMessage) => req.url?.startsWith('/health') ?? false },
      },
      ...(destination ? [destination] : []),
    ] as Params['pinoHttp'],
  };
}

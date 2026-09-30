import 'reflect-metadata';
import { RequestMethod, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ClsMiddleware, type ClsService } from 'nestjs-cls';
import { Logger } from 'nestjs-pino';
import { AppConfig } from './config/app-config.js';
import type { Env } from './config/env.js';
import type { RequestContextStore } from './platform/context/request-context.js';
import { ensureLogContext, type RequestWithLogContext } from './platform/logging/logging.js';
import { AppModule, type AppModuleOptions } from './app.module.js';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter.js';

/**
 * Builds the Nest application for `env.APP_ROLE` without listening, so tests and the CLI share
 * exactly the production pipeline: JSON only, 1 MB bodies, strict CORS, Helmet, `/api/v1` routes.
 */
export async function createApp(env: Env, options: AppModuleOptions = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRole(env, options), {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  const config = app.get(AppConfig);

  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  // First of all: the request context (request id, trace id, client), so every later middleware,
  // the request logger included, runs inside it.
  app.use(
    new ClsMiddleware({
      saveReq: true,
      setup: (clsService: ClsService, request: RequestWithLogContext & { ip?: string }) => {
        const cls = clsService as ClsService<RequestContextStore>;
        const { requestId, traceId } = ensureLogContext(request);
        const traceparent = typeof request.headers.traceparent === 'string' ? request.headers.traceparent : undefined;
        cls.set('requestId', requestId);
        cls.set('traceId', traceId);
        if (traceparent) cls.set('traceparent', traceparent);
        cls.set('ip', request.ip);
        cls.set('userAgent', request.headers['user-agent']);
        cls.set('sqlCount', 0);
      },
    }).use,
  );
  app.useBodyParser('json', { limit: '1mb' });
  app.use(cookieParser());
  // A JSON API: nothing to render, frame or load, ever.
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.enableCors({
    origin: [...config.allowedOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'If-Match', 'X-CSRF-Token', 'X-Request-Id', 'traceparent'],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'Idempotent-Replayed', 'ETag'],
    maxAge: 600,
  });
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // The Socket.IO gateway shares the HTTP server, on the `/rt` path (ws and all roles).
  if (env.APP_ROLE === 'ws' || env.APP_ROLE === 'all') app.useWebSocketAdapter(new RedisIoAdapter(app));
  app.enableShutdownHooks();
  return app;
}

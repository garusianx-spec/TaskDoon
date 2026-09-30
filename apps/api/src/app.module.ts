import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule, ClsService } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AppConfig, ConfigModule } from './config/app-config.js';
import type { Env } from './config/env.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { JwtAuthGuard } from './modules/auth/guards.js';
import { ChatController } from './modules/chat/chat.controller.js';
import { SchedulingController } from './modules/chat/scheduling.controller.js';
import { DomainModule } from './modules/domain.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { MeController } from './modules/users/me.controller.js';
import { ContentController, InboxController } from './modules/content/content.controller.js';
import { WorkController } from './modules/work/work.controller.js';
import { WorkspaceController, WorkspaceEntryController } from './modules/workspaces/workspaces.controller.js';
import type { RequestContextStore } from './platform/context/request-context.js';
import { HealthController } from './platform/health/health.controller.js';
import { IdempotencyInterceptor } from './platform/http/idempotency.js';
import { ProblemFilter } from './platform/http/problem.filter.js';
import { SqlCountInterceptor } from './platform/http/sql-count.interceptor.js';
import { RedisThrottlerStorage } from './platform/http/throttler-storage.js';
import { createValidationPipe } from './platform/http/validation.js';
import type { AuthenticatedRequest } from './platform/http/request.js';
import { loggerParams } from './platform/logging/logging.js';
import { OutboxRelay } from './platform/outbox/outbox-relay.js';
import { PlatformModule } from './platform/platform.module.js';
import { RedisClients } from './platform/redis/redis.js';
import { MaintenanceProcessor, NotificationsProcessor, QueueWorkers, WorkProcessor } from './worker/workers.js';

export interface AppModuleOptions {
  /** Where logs go; tests capture them to assert correlation ids. Defaults to stdout. */
  readonly logDestination?: DestinationStream;
}

/** The HTTP API: controllers plus the guards, pipes and filters every request passes through. */
@Module({})
class HttpApiModule {
  static register(): DynamicModule {
    const pipeline: Provider[] = [
      // Order matters: authenticate first, so the per-user limit knows who is calling.
      { provide: APP_GUARD, useExisting: JwtAuthGuard },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_INTERCEPTOR, useClass: SqlCountInterceptor },
      { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
      { provide: APP_PIPE, useFactory: createValidationPipe },
    ];
    return {
      module: HttpApiModule,
      imports: [
        DomainModule,
        ThrottlerModule.forRootAsync({
          inject: [RedisClients, AppConfig],
          useFactory: (redis: RedisClients, config: AppConfig) => ({
            storage: new RedisThrottlerStorage(redis),
            throttlers: [
              // RFC §2.8: 300/min per IP for everyone, 600/min per signed-in user (the defaults).
              { name: 'ip', ttl: 60_000, limit: config.env.THROTTLE_IP_PER_MINUTE },
              {
                name: 'user',
                ttl: 60_000,
                limit: config.env.THROTTLE_USER_PER_MINUTE,
                getTracker: (request: Record<string, unknown>) => `user:${(request as AuthenticatedRequest).auth?.userId ?? 'anonymous'}`,
                skipIf: (context) => !context.switchToHttp().getRequest<AuthenticatedRequest>().auth,
              },
            ],
          }),
        }),
      ],
      controllers: [AuthController, MeController, InboxController, WorkspaceEntryController, WorkspaceController, WorkController, ContentController, ChatController, SchedulingController],
      providers: pipeline,
    };
  }
}

/** Queue consumers, schedules and the outbox relay. */
@Module({
  imports: [DomainModule],
  providers: [OutboxRelay, NotificationsProcessor, WorkProcessor, MaintenanceProcessor, QueueWorkers],
  exports: [OutboxRelay, NotificationsProcessor, WorkProcessor, MaintenanceProcessor, QueueWorkers],
})
class WorkerModule {}

@Module({})
export class AppModule {
  /**
   * One image, several roles (RFC §1.3): `http` serves the REST API, `ws` the Socket.IO gateway,
   * `worker` runs queues and the outbox relay, `all` runs everything for local work. Every role
   * answers /health/live and /health/ready.
   */
  static forRole(env: Env, options: AppModuleOptions = {}): DynamicModule {
    const http = env.APP_ROLE === 'http' || env.APP_ROLE === 'all';
    const ws = env.APP_ROLE === 'ws' || env.APP_ROLE === 'all';
    const worker = env.APP_ROLE === 'worker' || env.APP_ROLE === 'all';
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        // The request-context middleware is mounted by createApp, ahead of every Nest middleware.
        ClsModule.forRoot({ global: true, middleware: { mount: false } }),
        LoggerModule.forRootAsync({
          inject: [AppConfig, ClsService],
          useFactory: (config: AppConfig, cls: ClsService<RequestContextStore>) => loggerParams(config, cls, options.logDestination),
        }),
        PlatformModule,
        TerminusModule,
        ...(http ? [HttpApiModule.register()] : []),
        ...(ws ? [RealtimeModule] : []),
        ...(worker ? [WorkerModule] : []),
      ],
      controllers: [HealthController],
      providers: [{ provide: APP_FILTER, useClass: ProblemFilter }],
    };
  }
}

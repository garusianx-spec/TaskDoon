import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { Env } from './env.js';

/** The validated environment, injectable by class. Read-only for the life of the process. */
export class AppConfig {
  constructor(readonly env: Readonly<Env>) {}

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  /** Browser origins allowed to call the API: the configured list plus the web app itself. */
  get allowedOrigins(): readonly string[] {
    return [...new Set([...this.env.CORS_ORIGINS, new URL(this.env.PUBLIC_WEB_ORIGIN).origin])];
  }

  /** Redis key namespace; tests give every file its own so parallel runs never collide. */
  get redisPrefix(): string {
    return this.env.REDIS_PREFIX;
  }
}

@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: AppConfig, useValue: new AppConfig(env) }],
      exports: [AppConfig],
    };
  }
}

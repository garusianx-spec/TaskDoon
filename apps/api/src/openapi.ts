import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { envSchema } from './config/env.js';

export const OPENAPI_FILE = fileURLToPath(new URL('../openapi.json', import.meta.url));

/** Placeholder settings: preview mode builds the route table without starting any provider. */
const PREVIEW_ENV = envSchema.parse({
  NODE_ENV: 'development',
  APP_ROLE: 'http',
  DATABASE_URL: 'postgres://preview@localhost/preview',
  REDIS_CORE_URL: 'redis://localhost:6379',
  REDIS_RT_URL: 'redis://localhost:6380',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_BUCKET: 'preview',
  S3_ACCESS_KEY: 'preview',
  S3_SECRET_KEY: 'preview',
  OTP_PEPPER: 'preview-pepper-preview-pepper-preview',
  APP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
});

export async function buildOpenApiDocument(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(AppModule.forRole(PREVIEW_ENV), { preview: true, logger: false, abortOnError: false });
  app.setGlobalPrefix('api', { exclude: ['health/live', 'health/ready'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  const config = new DocumentBuilder()
    .setTitle('TaskDoon API')
    .setDescription('REST API of the TaskDoon collaboration platform (RFC 0001). Errors are RFC 9457 problem details.')
    .setVersion('1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = SwaggerModule.createDocument(app, config, { operationIdFactory: (controller, method) => `${controller.replace(/Controller$/, '')}_${method}` });
  await app.close();
  return document;
}

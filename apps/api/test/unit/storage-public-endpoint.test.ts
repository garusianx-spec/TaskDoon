import { describe, expect, it } from 'vitest';
import { AppConfig } from '../../src/config/app-config.js';
import { loadEnv } from '../../src/config/env.js';
import { StorageService } from '../../src/platform/storage/storage.js';

const source = {
  DATABASE_URL: 'postgres://localhost/taskin',
  REDIS_CORE_URL: 'redis://localhost:6379',
  REDIS_RT_URL: 'redis://localhost:6380',
  APP_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  OTP_PEPPER: 'test-pepper-'.repeat(4),
  S3_ENDPOINT: 'http://minio:9000',
  S3_BUCKET: 'taskin-files',
  S3_ACCESS_KEY: 'test-access',
  S3_SECRET_KEY: 'test-secret',
};

describe('public media endpoint', () => {
  it('uses the production origin when no public endpoint was supplied', () => {
    const env = loadEnv({
      ...source,
      NODE_ENV: 'production',
      SMS_PROVIDERS: 'kavenegar',
      KAVENEGAR_API_KEY: 'test',
      JWT_PRIVATE_JWKS: '[]',
    });
    expect(env.S3_PUBLIC_ENDPOINT).toBe('https://taskdoone.ir');
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.S3_ENDPOINT).toBe('http://minio:9000');
  });

  it('preserves local fallback and explicit deployment overrides', () => {
    expect(loadEnv(source).S3_PUBLIC_ENDPOINT).toBeUndefined();
    expect(loadEnv({ ...source, S3_PUBLIC_ENDPOINT: 'https://localhost:8443' }).S3_PUBLIC_ENDPOINT).toBe(
      'https://localhost:8443',
    );
  });

  it('signs POST, download and multipart requests for the public bucket path', async () => {
    const storage = new StorageService(
      new AppConfig(loadEnv({ ...source, S3_PUBLIC_ENDPOINT: 'https://taskdoone.ir' })),
    );
    try {
      const key = 'workspaces/example/media/voice.m4a';
      const post = await storage.presignPost(key, {
        maxBytes: 1024,
        contentTypePrefix: 'audio/',
        expiresInSeconds: 60,
      });
      expect(post.url).toMatch(/^https:\/\/taskdoone\.ir\/taskin-files\/?$/);
      expect(post.fields.key).toBe(key);
      const get = new URL(await storage.presignGet(key, 60, 'voice.m4a', 'audio/mp4', 'inline'));
      const part = new URL(await storage.presignPart(key, 'upload-id', 1, 60));
      for (const url of [get, part]) {
        expect(url.origin).toBe('https://taskdoone.ir');
        expect(url.pathname).toBe(`/taskin-files/${key}`);
        expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('host');
        expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
      }
      expect(get.searchParams.get('response-content-disposition')).toContain('inline');
      expect(part.searchParams.get('uploadId')).toBe('upload-id');
      expect(part.searchParams.get('partNumber')).toBe('1');
    } finally {
      storage.onModuleDestroy();
    }
  });
});

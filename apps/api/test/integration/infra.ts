/**
 * Where the integration suite finds its backing services. Defaults match `npm run infra:up`;
 * CI overrides them with service containers.
 */
export const TEMPLATE_DB = 'taskin_test_template';

export function adminUrl(): string {
  return process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
}

/** A connection to `database` as one of the two roles. */
export function dbUrl(database: string, role: 'app' | 'migrator'): string {
  const url = new URL(adminUrl());
  url.username = role === 'app' ? 'taskin_app' : 'taskin_migrator';
  url.password = role === 'app' ? 'taskin_app' : 'taskin_migrator';
  url.pathname = `/${database}`;
  return url.toString();
}

export const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379';

export const S3 = {
  endpoint: process.env.TEST_S3_ENDPOINT ?? 'http://localhost:8333',
  bucket: process.env.TEST_S3_BUCKET ?? 'taskin-files',
  accessKey: process.env.TEST_S3_ACCESS_KEY ?? 'taskin',
  secretKey: process.env.TEST_S3_SECRET_KEY ?? 'taskin-dev-secret',
};

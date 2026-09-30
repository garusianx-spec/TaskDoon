import { z } from 'zod';

/**
 * Every setting the API reads from the environment, validated once at start-up. A missing or
 * malformed value stops the process with a list of problems instead of failing on first use.
 */

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

const smsProvider = z.enum(['console', 'kavenegar', 'smsir']);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Which part of the monolith this process runs; `all` is for local development only. */
    APP_ROLE: z.enum(['http', 'ws', 'worker', 'all']).default('all'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** Pretty, single-line logs for a terminal. JSON otherwise. */
    LOG_PRETTY: bool.default(false),
    /** Number of reverse proxies in front of the API, for the client IP (`X-Forwarded-For`). */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    /** REST request limits per minute (RFC §2.8): per client IP, and per signed-in user. */
    THROTTLE_IP_PER_MINUTE: z.coerce.number().int().min(1).default(300),
    THROTTLE_USER_PER_MINUTE: z.coerce.number().int().min(1).default(600),

    /** As `taskin_app`, through PgBouncer in production. */
    DATABASE_URL: z.url(),
    /** A direct connection (no PgBouncer) for LISTEN/NOTIFY and advisory locks. */
    DATABASE_DIRECT_URL: z.url().optional(),
    /** As `taskin_migrator`, the table owner; only the migrate job uses it. */
    DATABASE_MIGRATOR_URL: z.url().optional(),
    /**
     * As `taskin_platform_admin`, direct (no PgBouncer): read-only, cross-tenant reads for verified
     * platform super admins only. Unset: the admin routes answer 503.
     */
    DATABASE_PLATFORM_ADMIN_URL: z.url().optional(),
    /** How long a password reset code a platform admin issued stays valid. */
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(60),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),

    /** AOF, `noeviction`: queues, rate limits, idempotency, revocations, caches. */
    REDIS_CORE_URL: z.url(),
    /** No persistence: Socket.IO fan-out, presence, typing. */
    REDIS_RT_URL: z.url(),
    /**
     * The Socket.IO adapter on redis-rt: classic Pub/Sub, or sharded Pub/Sub (Redis 7+, one
     * channel per room, for a Redis Cluster). Every WebSocket node must use the same.
     */
    RT_ADAPTER: z.enum(['redis', 'redis-sharded']).default('redis'),
    /** Per-socket `message:send` limit (RFC §3): a burst, then a steady rate. */
    WS_SEND_BURST: z.coerce.number().int().min(1).default(20),
    WS_SEND_PER_SECOND: z.coerce.number().min(0.1).default(5),
    /** This WebSocket node's name in presence bookkeeping; defaults to host, pid and a random suffix. */
    WS_NODE_ID: z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,64}$/)
      .optional(),
    /** Prefix for every Redis key and BullMQ queue this deployment owns. */
    REDIS_PREFIX: z
      .string()
      .regex(/^[a-z0-9][a-z0-9:_-]{0,40}$/)
      .default('taskin'),

    /**
     * 32 random bytes, base64: seals secrets that must be stored or queued, such as the token
     * inside a pending invitation message. Generate with `openssl rand -base64 32`.
     */
    APP_ENCRYPTION_KEY: z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, 'must be 32 bytes, base64-encoded'),

    /** Origins allowed to call the API from a browser, comma-separated. */
    CORS_ORIGINS: csv.default([]),
    /** Where the web app lives; invitation links point here and it is always an allowed origin. */
    PUBLIC_WEB_ORIGIN: z.url().default('http://localhost:3000'),
    /** Refresh and CSRF cookies get `Secure`. Only turn off for plain-http test clients. */
    COOKIE_SECURE: bool.default(true),

    JWT_ISSUER: z.string().min(1).default('taskin-api'),
    JWT_AUDIENCE: z.string().min(1).default('taskin-web'),
    /**
     * A JSON array of private Ed25519 JWKs, each with a `kid`. The first signs; the rest still
     * verify, so a rotated-out key keeps working until its tokens expire. Required in production;
     * elsewhere an ephemeral key is generated at start-up.
     */
    JWT_PRIVATE_JWKS: z.string().optional(),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_IDLE_DAYS: z.coerce.number().int().min(1).default(30),
    REFRESH_ABSOLUTE_DAYS: z.coerce.number().int().min(1).default(90),
    STEP_UP_TTL_SECONDS: z.coerce.number().int().min(60).default(900),

    /** HMAC pepper for OTP code hashes; at least 32 characters. */
    OTP_PEPPER: z.string().min(32),
    OTP_TTL_SECONDS: z.coerce.number().int().min(30).max(600).default(120),
    OTP_RESEND_SECONDS: z.coerce.number().int().min(10).default(60),

    /** Providers in failover order, e.g. `kavenegar,smsir`. `console` logs codes instead (dev only). */
    SMS_PROVIDERS: csv.pipe(z.array(smsProvider).min(1)).default(['console']),
    KAVENEGAR_API_KEY: z.string().optional(),
    KAVENEGAR_OTP_TEMPLATE: z.string().default('taskin-otp'),
    KAVENEGAR_INVITE_TEMPLATE: z.string().default('taskin-invite'),
    KAVENEGAR_ALERT_TEMPLATE: z.string().default('taskin-alert'),
    KAVENEGAR_RESET_TEMPLATE: z.string().default('taskin-reset'),
    SMSIR_API_KEY: z.string().optional(),
    SMSIR_OTP_TEMPLATE_ID: z.coerce.number().int().optional(),
    SMSIR_INVITE_TEMPLATE_ID: z.coerce.number().int().optional(),
    SMSIR_ALERT_TEMPLATE_ID: z.coerce.number().int().optional(),
    SMSIR_RESET_TEMPLATE_ID: z.coerce.number().int().optional(),

    SMTP_URL: z.url().default('smtp://localhost:1025'),
    MAIL_FROM: z.string().default('TaskDoon <no-reply@taskin.local>'),

    S3_ENDPOINT: z.url(),
    /** The host browsers reach; presigned URLs are signed for it. Defaults to S3_ENDPOINT. */
    S3_PUBLIC_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: bool.default(true),

    /** Run the outbox relay in this process (worker and all roles). Tests drive it by hand. */
    OUTBOX_RELAY_ENABLED: bool.default(true),
    /** Run BullMQ workers and maintenance schedules in this process (worker and all roles). */
    QUEUE_WORKERS_ENABLED: bool.default(true),

    /** Days a deleted workspace stays recoverable by operators before its data is purged. */
    WORKSPACE_PURGE_GRACE_DAYS: z.coerce.number().int().min(0).default(7),
    INVITATION_TTL_DAYS: z.coerce.number().int().min(1).default(7),

    OTEL_SERVICE_NAME: z.string().default('taskin-api'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.SMS_PROVIDERS.includes('console')) {
      ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDERS'], message: 'the console SMS driver is not allowed in production' });
    }
    if (!env.JWT_PRIVATE_JWKS) {
      ctx.addIssue({ code: 'custom', path: ['JWT_PRIVATE_JWKS'], message: 'required in production' });
    }
    if (!env.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'must be true in production' });
    }
    if (env.SMS_PROVIDERS.includes('kavenegar') && !env.KAVENEGAR_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['KAVENEGAR_API_KEY'], message: 'required when kavenegar is a provider' });
    }
    if (env.SMS_PROVIDERS.includes('smsir') && !env.SMSIR_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['SMSIR_API_KEY'], message: 'required when smsir is a provider' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class InvalidConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n  ${problems.join('\n  ')}`);
    this.name = 'InvalidConfigError';
  }
}

/** Parses `source` (defaults to `process.env`), throwing one error that lists every problem. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;
  throw new InvalidConfigError(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
}

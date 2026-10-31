/** One-time local verification secrets. No secret is printed or enters a build context. */
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const envFile = resolve(root, '.env.prod.local');
if (existsSync(envFile)) throw new Error('.env.prod.local already exists; reuse it to preserve persisted credentials.');
const directory = resolve(root, '.local/prod');
mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
const hex = () => randomBytes(24).toString('hex');
const { privateKey } = generateKeyPairSync('ed25519');
const jwk = { ...privateKey.export({ format: 'jwk' }), kid: hex() };
const port = process.env.HTTPS_PORT ?? '8443';
if (!/^\d{2,5}$/.test(port) || Number(port) > 65535) throw new Error('HTTPS_PORT must be a valid port.');
const env = {
  POSTGRES_PASSWORD: hex(),
  TASKIN_APP_PASSWORD: hex(),
  TASKIN_MIGRATOR_PASSWORD: hex(),
  TASKIN_PLATFORM_ADMIN_PASSWORD: hex(),
  REDIS_CORE_PASSWORD: hex(),
  REDIS_RT_PASSWORD: hex(),
  S3_ACCESS_KEY: hex(),
  S3_SECRET_KEY: hex(),
  JWT_PRIVATE_JWKS: JSON.stringify([jwk]),
  OTP_PEPPER: hex(),
  APP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  HTTPS_PORT: port,
  PUBLIC_WEB_ORIGIN: 'https://localhost:' + port,
  S3_PUBLIC_ENDPOINT: 'https://storage.localhost:' + port,
  SMS_PROVIDERS: 'kavenegar',
  // This boots health/build verification only; it cannot deliver an OTP.
  KAVENEGAR_API_KEY: process.env.KAVENEGAR_API_KEY ?? 'local-verification-placeholder',
  SMTP_URL: process.env.SMTP_URL ?? 'smtp://mailpit:1025',
};
writeFileSync(envFile, Object.entries(env).map(([k,v]) => k + '=' + "'" + v + "'").join('\n') + '\n', { mode: 0o600 });
const secret = (name, content) => {
  // Compose bind-mounted secrets must be readable by their distinct service UIDs.
  // The host directory is mode0700; containers receive only their own read-only files.
  writeFileSync(resolve(directory, name), content, { mode: 0o444 });
  chmodSync(resolve(directory, name), 0o444);
};
secret('s3.json', JSON.stringify({ identities: [{
  name: 'taskdoon', credentials: [{ accessKey: env.S3_ACCESS_KEY, secretKey: env.S3_SECRET_KEY }],
  actions: ['Admin', 'Read', 'Write', 'List', 'Tagging'],
}] }, null, 2) + '\n');
secret('redis-core.conf', 'bind 0.0.0.0\nprotected-mode yes\nrequirepass ' + env.REDIS_CORE_PASSWORD + '\nappendonly yes\nappendfsync everysec\nmaxmemory 256mb\nmaxmemory-policy noeviction\n');
secret('redis-rt.conf', 'bind 0.0.0.0\nprotected-mode yes\nrequirepass ' + env.REDIS_RT_PASSWORD + '\nsave ""\nappendonly no\nmaxmemory 128mb\nmaxmemory-policy volatile-lru\n');
console.log('Created local secrets. Generate TLS certificates next; do not regenerate against existing volumes.');

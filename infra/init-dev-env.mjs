import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const path = process.argv[2] ?? '.env.dev.local';
const privateKey = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
const jwks = JSON.stringify([{ ...privateKey, kid: randomBytes(12).toString('hex') }]);

try {
  writeFileSync(
    path,
    [
      'APP_ENCRYPTION_KEY=' + randomBytes(32).toString('base64'),
      'OTP_PEPPER=' + randomBytes(32).toString('hex'),
      "JWT_PRIVATE_JWKS='" + jwks + "'",
      '',
    ].join('\n'),
    { flag: 'wx', mode: 0o600 },
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.error('The environment file already exists. Keep its keys for existing local data.');
  process.exitCode = 1;
}

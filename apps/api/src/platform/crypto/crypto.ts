import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Small, dependency-free crypto helpers used across auth, invitations and idempotency. */

export function sha256(input: string | Buffer): Buffer {
  return createHash('sha256').update(input).digest();
}

export function hmacSha256(key: string | Buffer, input: string | Buffer): Buffer {
  return createHmac('sha256', key).update(input).digest();
}

/** 256 bits of randomness, URL-safe: refresh tokens, invitation tokens, CSRF tokens. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time comparison that also tolerates different lengths. */
export function safeEqual(a: Buffer | string, b: Buffer | string): boolean {
  const left = typeof a === 'string' ? Buffer.from(a) : a;
  const right = typeof b === 'string' ? Buffer.from(b) : b;
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** A uniformly random numeric code of `length` digits, e.g. an SMS one-time code. */
export function numericCode(length: number): string {
  let code = '';
  while (code.length < length) {
    // Rejection sampling keeps every digit uniform (250 = 25 × 10 is the largest fair bound).
    for (const byte of randomBytes(length * 2)) {
      if (byte < 250 && code.length < length) code += String(byte % 10);
    }
  }
  return code;
}

/**
 * AES-256-GCM sealing for secrets that must sit in a table or a queue for a while, such as the
 * plaintext token of an invitation waiting to be sent. Output: base64url(iv ‖ tag ‖ ciphertext).
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) throw new Error('SecretBox needs a 32-byte key');
  }

  seal(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }

  open(sealed: string): string {
    const raw = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  }
}

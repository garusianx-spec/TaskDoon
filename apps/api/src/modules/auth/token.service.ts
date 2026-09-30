import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type CryptoKey, errors, exportJWK, generateKeyPair, importJWK, type JWK, jwtVerify, SignJWT } from 'jose';
import type { AuthMethod } from '@taskin/contracts';
import { AppConfig } from '../../config/app-config.js';
import { ApiError } from '../../platform/http/api-error.js';

const ALG = 'EdDSA';
const ACCESS_TYP = 'at+jwt';
const SIGNUP_TYP = 'signup+jwt';
const SIGNUP_TTL_SECONDS = 600;
const CLOCK_TOLERANCE_SECONDS = 30;

/** The access token's claims. No workspace or role: those are resolved per request (RFC §5.1). */
export interface AccessClaims {
  readonly sub: string;
  readonly sid: string;
  readonly jti: string;
  readonly iat: number;
  readonly exp: number;
  readonly auth_time: number;
  readonly amr: readonly AuthMethod[];
  /** Must equal users.security_version, or the token is dead. */
  readonly sv: number;
  readonly stepup_at?: number;
}

export interface AccessGrant {
  readonly userId: string;
  readonly sessionId: string;
  readonly amr: readonly AuthMethod[];
  readonly authTime: number;
  readonly securityVersion: number;
  readonly stepUpAt: number | null;
}

interface SigningKey {
  readonly kid: string;
  readonly privateKey: CryptoKey;
  readonly publicKey: CryptoKey;
  readonly publicJwk: JWK;
}

/**
 * Ed25519 JWTs (jose). The first configured key signs; every configured key verifies, so a key
 * can be rotated out of signing and still honour the tokens it issued until they expire.
 * Outside production, an ephemeral key is generated when none is configured.
 */
@Injectable()
export class TokenService implements OnModuleInit {
  private readonly logger = new Logger('TokenService');
  private keys: SigningKey[] = [];

  constructor(private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    const raw = this.config.env.JWT_PRIVATE_JWKS;
    if (raw) {
      const jwks = JSON.parse(raw) as JWK[];
      if (!Array.isArray(jwks) || jwks.length === 0) throw new Error('JWT_PRIVATE_JWKS must be a non-empty JSON array');
      this.keys = await Promise.all(
        jwks.map(async (jwk) => {
          if (!jwk.kid || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.d || !jwk.x) {
            throw new Error('every JWT key must be a private Ed25519 JWK with a kid');
          }
          const publicJwk: JWK = { kty: 'OKP', crv: 'Ed25519', x: jwk.x, kid: jwk.kid, alg: ALG, use: 'sig' };
          return {
            kid: jwk.kid,
            privateKey: (await importJWK(jwk, ALG)) as CryptoKey,
            publicKey: (await importJWK(publicJwk, ALG)) as CryptoKey,
            publicJwk,
          };
        }),
      );
      return;
    }
    const { privateKey, publicKey } = await generateKeyPair(ALG, { crv: 'Ed25519' });
    const kid = `ephemeral-${randomUUID().slice(0, 8)}`;
    this.keys = [{ kid, privateKey, publicKey, publicJwk: { ...(await exportJWK(publicKey)), kid, alg: ALG, use: 'sig' } }];
    this.logger.warn({ kid }, 'no JWT_PRIVATE_JWKS configured; using an ephemeral signing key (tokens die with the process)');
  }

  /** The public keys, as a JWKS document for other services (the WebSocket nodes) to verify with. */
  get jwks(): { keys: JWK[] } {
    return { keys: this.keys.map((key) => key.publicJwk) };
  }

  async signAccess(grant: AccessGrant): Promise<{ token: string; expiresInSeconds: number }> {
    const ttl = this.config.env.ACCESS_TOKEN_TTL_SECONDS;
    const key = this.signingKey();
    const token = await new SignJWT({
      sid: grant.sessionId,
      auth_time: grant.authTime,
      amr: [...grant.amr],
      sv: grant.securityVersion,
      ...(grant.stepUpAt ? { stepup_at: grant.stepUpAt } : {}),
    })
      .setProtectedHeader({ alg: ALG, kid: key.kid, typ: ACCESS_TYP })
      .setIssuer(this.config.env.JWT_ISSUER)
      .setAudience(this.config.env.JWT_AUDIENCE)
      .setSubject(grant.userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(key.privateKey);
    return { token, expiresInSeconds: ttl };
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, (header) => this.publicKey(header.kid), {
        algorithms: [ALG],
        issuer: this.config.env.JWT_ISSUER,
        audience: this.config.env.JWT_AUDIENCE,
        typ: ACCESS_TYP,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        requiredClaims: ['sub', 'sid', 'exp', 'iat', 'jti', 'sv'],
      });
      return payload as unknown as AccessClaims;
    } catch (error) {
      if (error instanceof errors.JWTExpired) throw new ApiError('AUTH_EXPIRED');
      throw new ApiError('AUTH_INVALID');
    }
  }

  /** Proof that `phone` passed an OTP, redeemable once for account creation. */
  async signSignup(phone: string): Promise<{ token: string; jti: string; expiresInSeconds: number }> {
    const key = this.signingKey();
    const jti = randomUUID();
    const token = await new SignJWT({ phone })
      .setProtectedHeader({ alg: ALG, kid: key.kid, typ: SIGNUP_TYP })
      .setIssuer(this.config.env.JWT_ISSUER)
      .setAudience(`${this.config.env.JWT_AUDIENCE}:signup`)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(`${SIGNUP_TTL_SECONDS}s`)
      .sign(key.privateKey);
    return { token, jti, expiresInSeconds: SIGNUP_TTL_SECONDS };
  }

  async verifySignup(token: string): Promise<{ phone: string; jti: string; exp: number }> {
    try {
      const { payload } = await jwtVerify(token, (header) => this.publicKey(header.kid), {
        algorithms: [ALG],
        issuer: this.config.env.JWT_ISSUER,
        audience: `${this.config.env.JWT_AUDIENCE}:signup`,
        typ: SIGNUP_TYP,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        requiredClaims: ['jti', 'exp'],
      });
      if (typeof payload.phone !== 'string' || !payload.jti || !payload.exp) throw new Error('malformed');
      return { phone: payload.phone, jti: payload.jti, exp: payload.exp };
    } catch {
      throw new ApiError('SIGNUP_TOKEN_INVALID');
    }
  }

  private signingKey(): SigningKey {
    const key = this.keys[0];
    if (!key) throw new Error('TokenService used before initialisation');
    return key;
  }

  private publicKey(kid: string | undefined): CryptoKey {
    const key = this.keys.find((candidate) => candidate.kid === kid);
    if (!key) throw new Error('unknown kid');
    return key.publicKey;
  }
}

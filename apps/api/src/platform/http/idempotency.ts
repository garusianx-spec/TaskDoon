import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiHeader } from '@nestjs/swagger';
import { and, eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { from, type Observable, of, catchError, mergeMap, throwError } from 'rxjs';
import { sha256 } from '../crypto/crypto.js';
import { Database } from '../db/database.js';
import { idempotencyKeys } from '../db/schema/all.js';
import { ApiError } from './api-error.js';
import type { AuthenticatedRequest } from './request.js';

const IDEMPOTENT = Symbol('taskin:idempotent');
const HTTP_CODE = '__httpCode__';
const KEY_FORMAT = /^[A-Za-z0-9_-]{8,64}$/;
const TTL_HOURS = 24;
/** An in-progress reservation older than this belongs to a crashed attempt and may be taken over. */
const STALE_SECONDS = 60;

/**
 * Marks a mutating route as requiring an `Idempotency-Key` header (RFC §2.2). A retry with the
 * same key and the same request replays the stored response; the same key with a different
 * request is refused, and a retry racing the original is told to wait.
 */
export const Idempotent = () =>
  applyDecorators(
    SetMetadata(IDEMPOTENT, true),
    ApiHeader({ name: 'Idempotency-Key', required: true, description: '8–64 characters of [A-Za-z0-9_-], unique per intended operation' }),
  );

/** Stable JSON: object keys sorted, so `{a,b}` and `{b,a}` hash the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

type Reservation = { readonly kind: 'proceed' } | { readonly kind: 'replay'; readonly status: number; readonly body: unknown };

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: Database,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const enabled = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT, [context.getHandler(), context.getClass()]);
    if (!enabled || context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const userId = request.auth?.userId;
    if (!userId) throw new ApiError('UNAUTHENTICATED');

    const key = request.header('idempotency-key');
    if (!key) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED');
    if (!KEY_FORMAT.test(key)) throw ApiError.validation([{ field: 'Idempotency-Key', message: 'must be 8–64 characters of A–Z, a–z, 0–9, _ or -' }]);

    const scope = `${request.method} ${request.baseUrl}${(request.route as { path?: string } | undefined)?.path ?? request.path}`;
    const requestHash = sha256(canonicalJson({ params: request.params, query: request.query, body: request.body }));
    const status =
      this.reflector.get<number | undefined>(HTTP_CODE, context.getHandler()) ??
      (request.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK);

    return from(this.reserve(userId, scope, key, requestHash)).pipe(
      mergeMap((reservation) => {
        if (reservation.kind === 'replay') {
          response.status(reservation.status);
          response.setHeader('Idempotent-Replayed', 'true');
          return of(reservation.body);
        }
        return next.handle().pipe(
          mergeMap(async (body: unknown) => {
            await this.complete(userId, scope, key, status, body);
            return body;
          }),
          catchError((error: unknown) =>
            // A failed attempt releases the key so the client can retry it.
            from(this.release(userId, scope, key)).pipe(mergeMap(() => throwError(() => error))),
          ),
        );
      }),
    );
  }

  private async reserve(userId: string, scope: string, key: string, requestHash: Buffer): Promise<Reservation> {
    const db = this.database.db;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const inserted = await db
        .insert(idempotencyKeys)
        .values({ userId, scope, key, requestHash, state: 'in_progress', expiresAt: sql`now() + make_interval(hours => ${TTL_HOURS})` })
        .onConflictDoNothing()
        .returning({ key: idempotencyKeys.key });
      if (inserted.length > 0) return { kind: 'proceed' };

      const [existing] = await db
        .select({
          requestHash: idempotencyKeys.requestHash,
          state: idempotencyKeys.state,
          responseStatus: idempotencyKeys.responseStatus,
          responseBody: idempotencyKeys.responseBody,
          expired: sql<boolean>`${idempotencyKeys.expiresAt} < now()`,
          stale: sql<boolean>`${idempotencyKeys.updatedAt} < now() - make_interval(secs => ${STALE_SECONDS})`,
        })
        .from(idempotencyKeys)
        .where(this.match(userId, scope, key));
      if (!existing) continue; // released between our insert and select: try once more
      if (existing.expired) {
        await db.delete(idempotencyKeys).where(this.match(userId, scope, key));
        continue;
      }
      if (!existing.requestHash.equals(requestHash)) throw new ApiError('IDEMPOTENCY_KEY_REUSED');
      if (existing.state === 'completed') {
        return { kind: 'replay', status: existing.responseStatus ?? HttpStatus.OK, body: existing.responseBody };
      }
      if (existing.stale) {
        const taken = await db
          .update(idempotencyKeys)
          .set({ updatedAt: sql`now()` })
          .where(and(this.match(userId, scope, key), eq(idempotencyKeys.state, 'in_progress')))
          .returning({ key: idempotencyKeys.key });
        if (taken.length > 0) return { kind: 'proceed' };
      }
      throw new ApiError('IDEMPOTENCY_IN_PROGRESS', undefined, undefined, { 'Retry-After': '1' });
    }
    throw new ApiError('IDEMPOTENCY_IN_PROGRESS', undefined, undefined, { 'Retry-After': '1' });
  }

  private async complete(userId: string, scope: string, key: string, status: number, body: unknown): Promise<void> {
    await this.database.db
      .update(idempotencyKeys)
      .set({ state: 'completed', responseStatus: status, responseBody: body ?? null })
      .where(this.match(userId, scope, key));
  }

  private async release(userId: string, scope: string, key: string): Promise<void> {
    await this.database.db
      .delete(idempotencyKeys)
      .where(and(this.match(userId, scope, key), eq(idempotencyKeys.state, 'in_progress')));
  }

  private match(userId: string, scope: string, key: string) {
    return and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key));
  }
}

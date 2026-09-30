/**
 * PostgreSQL errors reach us wrapped (drizzle's DrizzleQueryError keeps the driver error in
 * `cause`). These helpers dig out the SQLSTATE without ever touching the wrapper's message,
 * which embeds the query parameters and must not be logged.
 */

export interface PgErrorInfo {
  readonly code: string;
  readonly constraint?: string;
  readonly hint?: string;
}

export function pgError(error: unknown): PgErrorInfo | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === 'object' && current !== null) {
      const candidate = current as { code?: unknown; constraint?: unknown; hint?: unknown; cause?: unknown; severity?: unknown };
      if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code) && 'severity' in candidate) {
        return {
          code: candidate.code,
          constraint: typeof candidate.constraint === 'string' ? candidate.constraint : undefined,
          hint: typeof candidate.hint === 'string' ? candidate.hint : undefined,
        };
      }
      current = candidate.cause;
    } else {
      return undefined;
    }
  }
  return undefined;
}

export const PG = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  /** ON DELETE RESTRICT raises this, not 23503. */
  restrictViolation: '23001',
  checkViolation: '23514',
  notNullViolation: '23502',
  serializationFailure: '40001',
  deadlockDetected: '40P01',
  lockNotAvailable: '55P03',
  insufficientPrivilege: '42501',
  /** Raised by the locked-role triggers. */
  ownerImmutable: 'TK001',
  /** Raised by the workflow trigger: a board lost its last live to-do or done column. */
  workflowCategory: 'TK002',
} as const;

/** Failures a fresh attempt of the same transaction can succeed at. */
export function isRetryable(error: unknown): boolean {
  const code = pgError(error)?.code;
  return code === PG.serializationFailure || code === PG.deadlockDetected || code === PG.lockNotAvailable;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const info = pgError(error);
  return info?.code === PG.uniqueViolation && (constraint === undefined || info.constraint === constraint);
}

/** node-postgres's pool, when every connection stayed busy for `connectionTimeoutMillis`. */
const POOL_TIMEOUT = 'timeout exceeded when trying to connect';
const NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE']);

/**
 * The database was unreachable, overloaded or had no connection free: a condition to retry
 * later (503), not a bug (500). Clients retry idempotent calls, and a send with the same
 * `clientMsgId` is idempotent.
 */
export function isUnavailable(error: unknown): boolean {
  const code = pgError(error)?.code;
  // Class 08 is connection exceptions; 53300 too many connections; 57P01/57P03 shutting down or starting.
  if (code && (code.startsWith('08') || code === '53300' || code === '57P01' || code === '57P03')) return true;
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current.message === POOL_TIMEOUT || NETWORK_CODES.has((current as { code?: unknown }).code as string)) return true;
    current = current.cause;
  }
  return false;
}

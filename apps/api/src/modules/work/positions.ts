import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { ApiError } from '../../platform/http/api-error.js';

/** Keys longer than this trigger a rewrite of the column (RFC §12, board operations). */
export const REBALANCE_KEY_LENGTH = 50;

/**
 * A fractional-index key strictly between `before` and `after` (either may be `null` for an open
 * end). Neighbours that are out of order or equal mean the client's view of the board is stale.
 */
export function keyBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) throw new ApiError('BOARD_CHANGED');
  try {
    return generateKeyBetween(before, after);
  } catch {
    throw new ApiError('BOARD_CHANGED');
  }
}

/** `count` ordered keys between two neighbours. */
export function keysBetween(before: string | null, after: string | null, count: number): string[] {
  return count === 0 ? [] : generateNKeysBetween(before, after, count);
}

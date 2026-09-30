let sequence = 0;

/**
 * Monotonic id for client-created entities. Stable within a session and never collides with
 * seed ids. Exposed outside the reducer for the few flows that need the id before dispatching
 * (creating a note and selecting it in the same event handler).
 */
export function nextLocalId(prefix: string): string {
  sequence += 1;
  return `${prefix}-local-${sequence}`;
}

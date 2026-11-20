import { createHash } from 'node:crypto';
import type { TicketStatus } from '@taskin/contracts';
export function supportCommandHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function replyStatus(current: TicketStatus, agent: boolean, internal: boolean): TicketStatus | null {
  if (internal) return agent ? current : null;
  if (current === 'CLOSED') return null;
  return agent ? 'ANSWERED' : current === 'OPEN' ? 'OPEN' : 'IN_PROGRESS';
}
export function transitionAllowed(from: TicketStatus, to: TicketStatus): boolean {
  // Closed threads must be deliberately reopened before publishing another answer.
  return from !== 'CLOSED' || to === 'CLOSED' || to === 'OPEN' || to === 'IN_PROGRESS';
}

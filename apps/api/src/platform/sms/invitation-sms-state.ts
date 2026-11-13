import type { InvitationSmsDelivery, InvitationSmsFailure, InvitationSmsStatus } from '@taskin/contracts';

/** Stored on the invitation. Provider identifiers stay server-side; links are separately sealed. */
export interface InvitationSmsAttempt {
  readonly number: number;
  readonly status: InvitationSmsStatus;
  readonly queuedAt: string;
  /** Explicit name retained on the first attempt for retries, absent on older invitations. */
  readonly recipientName?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly provider?: string;
  readonly messageId?: string | null;
  readonly failureCode?: InvitationSmsFailure;
  readonly retryable?: boolean;
}

export const SMS_RETRY_COOLDOWN_MS = 60_000;
export const SMS_MAX_ATTEMPTS = 5;

export function smsDeliveryView(attempts: readonly InvitationSmsAttempt[] | null): InvitationSmsDelivery {
  const last = attempts?.at(-1);
  const interrupted =
    last?.status === 'sending' && Date.now() - Date.parse(last.startedAt ?? last.queuedAt) > 60_000;
  return {
    status: interrupted ? 'unknown' : (last?.status ?? 'unknown'),
    attemptCount: attempts?.length ?? 0,
    failureCode: interrupted ? 'acceptance_unknown' : (last?.failureCode ?? null),
    retryable:
      last?.status === 'failed' && last.retryable === true && (attempts?.length ?? 0) < SMS_MAX_ATTEMPTS,
    nextRetryAt: last ? new Date(Date.parse(last.queuedAt) + SMS_RETRY_COOLDOWN_MS).toISOString() : null,
  };
}

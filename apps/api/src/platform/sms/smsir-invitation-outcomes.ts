import type { InvitationSmsFailure } from '@taskin/contracts';

export interface InvitationSendFailure {
  readonly status: 'failed' | 'unknown';
  readonly failureCode: InvitationSmsFailure;
  readonly retryable: boolean;
}

const failed = (failureCode: InvitationSmsFailure, retryable = false): InvitationSendFailure => ({
  status: 'failed',
  failureCode,
  retryable,
});

/** SMS.ir's public status table: https://app.sms.ir/developer/help/statusCode.
 * This interprets invitation outcomes only; the shared provider/OTP implementation is unchanged.
 */
export function smsirInvitationSendFailure(cause: string): InvitationSendFailure | null {
  if (cause === 'smsir: circuit open') return failed('provider_unavailable', true);
  if (cause === 'smsir: smsir has no template for invite') return failed('template_rejected');
  const status = /^smsir: smsir status (\d+)$/.exec(cause)?.[1];
  if (status !== undefined) {
    const code = Number(status);
    if (code === 0) return failed('provider_unavailable', true);
    if (code === 20) return failed('provider_rate_limited', true);
    if (code === 104) return failed('invalid_recipient');
    if (code === 115) return failed('recipient_blocked');
    if ([113, 114, 116].includes(code)) return failed('template_rejected');
    if ([10, 11, 12, 13, 14, 15, 101, 102, 119, 121, 122, 123, 124, 125].includes(code))
      return failed('provider_configuration');
    if ([16, 103, 105, 106, 107, 108, 109, 110, 111, 112, 117, 118].includes(code))
      return failed('provider_rejected');
    return null;
  }
  const http = /^smsir: HTTP (\d+)$/.exec(cause)?.[1];
  if (http === '429') return failed('provider_rate_limited', true);
  if (http && ['401', '403', '404', '405'].includes(http)) return failed('provider_configuration');
  if (http && ['400', '422'].includes(http)) return failed('provider_rejected');
  // Timeouts, 5xx, malformed replies and unrecognised codes cannot prove a send was refused.
  return null;
}

export type InvitationDeliveryOutcome =
  | { readonly kind: 'delivered' }
  | { readonly kind: 'failed'; readonly failureCode: InvitationSmsFailure; readonly retryable: boolean }
  | { readonly kind: 'pending' | 'unknown' };

/** The deliveryState is distinct from the API envelope's status=1 (request successful). */
export function smsirInvitationDelivery(state: unknown): InvitationDeliveryOutcome {
  switch (state) {
    case 1:
      return { kind: 'delivered' };
    case 2: // Undelivered to handset.
    case 6: // Provider explicitly reports failed.
      return { kind: 'failed', failureCode: 'delivery_failed', retryable: true };
    case 4: // Not reached the operator.
      return { kind: 'failed', failureCode: 'operator_rejected', retryable: true };
    case 7:
      return { kind: 'failed', failureCode: 'recipient_blocked', retryable: false };
    case 3: // Reached operator.
    case 5: // Reached provider; neither proves handset delivery.
      return { kind: 'pending' };
    default:
      return { kind: 'unknown' };
  }
}

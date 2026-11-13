import { describe, expect, it } from 'vitest';
import { SmsUnavailableError } from '../../src/platform/sms/sms.js';
import { invitationFailure } from '../../src/platform/sms/invitation-sms-processor.js';
import { smsirInvitationDelivery } from '../../src/platform/sms/smsir-invitation-outcomes.js';

describe('SMS.ir invitation evidence and retry eligibility', () => {
  it.each([2, 4, 6])('permits a bounded retry after terminal delivery failure %s', (state) => {
    expect(smsirInvitationDelivery(state)).toMatchObject({ kind: 'failed', retryable: true });
  });

  it('does not offer a resend to a blocked recipient', () => {
    expect(smsirInvitationDelivery(7)).toEqual({
      kind: 'failed',
      failureCode: 'recipient_blocked',
      retryable: false,
    });
  });

  it.each([3, 5])('keeps intermediate delivery state %s pending', (state) => {
    expect(smsirInvitationDelivery(state)).toEqual({ kind: 'pending' });
  });

  it.each([null, undefined, 0, 8, 999, '1'])(
    'does not infer delivery or failure from unknown state %s',
    (state) => {
      expect(smsirInvitationDelivery(state)).toEqual({ kind: 'unknown' });
    },
  );

  it('only identifies the explicit handset-delivery state as delivered', () => {
    expect(smsirInvitationDelivery(1)).toEqual({ kind: 'delivered' });
  });

  it.each([0, 20])('allows retry for a confirmed transient SMS.ir refusal %s', (code) => {
    expect(invitationFailure(new SmsUnavailableError([`smsir: smsir status ${code}`]))).toMatchObject({
      status: 'failed',
      retryable: true,
    });
  });

  it.each([10, 11, 12, 13, 14, 15, 16, 101, 102, 103, 104, 113, 114, 115, 116, 123, 124])(
    'retains permanent/configuration refusal %s without enabling resend',
    (code) => {
      expect(invitationFailure(new SmsUnavailableError([`smsir: smsir status ${code}`]))).toMatchObject({
        status: 'failed',
        retryable: false,
      });
    },
  );

  it.each(['HTTP 408', 'HTTP 503', 'fetch failed', 'smsir status unknown', 'smsir status 999'])(
    'does not resend an ambiguous outcome: %s',
    (cause) => {
      expect(invitationFailure(new SmsUnavailableError([`smsir: ${cause}`]))).toMatchObject({
        status: 'unknown',
        retryable: false,
      });
    },
  );

  it('distinguishes rate limiting from bad credentials without changing shared SMS error behavior', () => {
    expect(invitationFailure(new SmsUnavailableError(['smsir: HTTP 429']))).toMatchObject({
      failureCode: 'provider_rate_limited',
      retryable: true,
    });
    expect(invitationFailure(new SmsUnavailableError(['smsir: HTTP 401']))).toMatchObject({
      failureCode: 'provider_configuration',
      retryable: false,
    });
  });
});

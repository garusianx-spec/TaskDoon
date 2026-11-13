import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AppConfig } from '../../config/app-config.js';
import { SecretBox } from '../crypto/crypto.js';
import { invitations } from '../db/schema/all.js';
import { UnitOfWork } from '../db/unit-of-work.js';
import { OutboxWriter, type OutboxEventMap } from '../outbox/outbox-writer.js';
import { SmsService, SmsUnavailableError } from './sms.js';
import type { InvitationSmsAttempt } from './invitation-sms-state.js';
import {
  smsirInvitationDelivery,
  smsirInvitationSendFailure,
  type InvitationSendFailure,
} from './smsir-invitation-outcomes.js';

type Reference = NonNullable<OutboxEventMap['notification.sms']['invitation']>;

/** Interpretation is invitation-only. Generic SMS routing, templates, OTP and reset stay untouched. */
export function invitationFailure(error: unknown): InvitationSendFailure {
  if (error instanceof SmsUnavailableError && error.causes.length > 0) {
    const outcomes = error.causes.map(smsirInvitationSendFailure);
    if (outcomes.every((entry) => entry !== null))
      return outcomes.find((entry) => !entry.retryable) ?? outcomes[0]!;
  }
  // Timeout/connection loss might follow acceptance. Never auto-resend an ambiguous result.
  return { status: 'unknown', failureCode: 'acceptance_unknown', retryable: false };
}

@Injectable()
export class InvitationSmsProcessor {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sms: SmsService,
    private readonly box: SecretBox,
    private readonly outbox: OutboxWriter,
    private readonly config: AppConfig,
  ) {}

  async send(payload: OutboxEventMap['notification.sms']): Promise<void> {
    const ref = payload.invitation;
    if (!ref || payload.template !== 'invite') return;
    const claimed = await this.change(ref, (last, row) => {
      if (last.status !== 'queued' || row.status !== 'pending' || row.expiresAt <= new Date()) return null;
      return { ...last, status: 'sending', startedAt: new Date().toISOString() };
    });
    if (!claimed) return;
    let outcome: InvitationSmsAttempt;
    try {
      const tokens = { ...payload.tokens };
      for (const key of payload.sealed ?? []) if (tokens[key]) tokens[key] = this.box.open(tokens[key]);
      // The existing configured service and SMS.ir adapter perform the send. No routing override.
      const receipt = await this.sms.send({ to: payload.to, template: 'invite', tokens });
      outcome = {
        ...claimed,
        status: receipt.provider === 'console' ? 'unknown' : 'sent',
        provider: receipt.provider,
        messageId: receipt.messageId,
        completedAt: new Date().toISOString(),
        ...(receipt.provider === 'console' ? { failureCode: 'test_transport' as const } : {}),
      };
    } catch (error) {
      outcome = { ...claimed, ...invitationFailure(error), completedAt: new Date().toISOString() };
    }
    await this.change(ref, (last) => (last.status === 'sending' ? outcome : null), true);
  }

  /** Read-only SMS.ir report lookup. Never sends; only a matching report can confirm delivery. */
  async report(ref: Reference): Promise<void> {
    const last = await this.uow.run({ workspaceId: ref.workspaceId, userId: null }, async ({ tx }) => {
      const [row] = await tx
        .select()
        .from(invitations)
        .where(and(eq(invitations.workspaceId, ref.workspaceId), eq(invitations.id, ref.id)));
      return row?.smsAttempts?.find((entry) => entry.number === ref.attempt);
    });
    if (!last || last.status !== 'sent' || last.provider !== 'smsir' || !last.messageId) return;
    const response = await fetch(`https://api.sms.ir/v1/send/${encodeURIComponent(last.messageId)}`, {
      headers: { accept: 'application/json', 'x-api-key': this.config.env.SMSIR_API_KEY ?? '' },
      signal: AbortSignal.timeout(5_000),
    });
    const body = (await response.json().catch(() => null)) as {
      status?: number;
      data?: { messageId?: number; deliveryState?: number; deliveryDateTime?: number | null };
    } | null;
    if (!response.ok || body?.status !== 1 || String(body.data?.messageId) !== last.messageId)
      throw new Error('Invitation SMS report unavailable');
    const outcome = smsirInvitationDelivery(body.data?.deliveryState);
    if (outcome.kind === 'delivered' || outcome.kind === 'failed') {
      await this.change(ref, (current) =>
        current.status === 'sent'
          ? {
              ...current,
              status: outcome.kind,
              completedAt: new Date().toISOString(),
              ...(outcome.kind === 'failed'
                ? { failureCode: outcome.failureCode, retryable: outcome.retryable }
                : {}),
            }
          : null,
      );
      return;
    }
    // An absent, unfamiliar or non-final report never turns an acknowledgement into delivery.
    throw new Error('Invitation SMS delivery not yet confirmed');
  }

  private async change(
    ref: Reference,
    update: (last: InvitationSmsAttempt, row: typeof invitations.$inferSelect) => InvitationSmsAttempt | null,
    scheduleReport = false,
  ): Promise<InvitationSmsAttempt | null> {
    return this.uow.run({ workspaceId: ref.workspaceId, userId: null }, async ({ tx }) => {
      const [row] = await tx
        .select()
        .from(invitations)
        .where(and(eq(invitations.workspaceId, ref.workspaceId), eq(invitations.id, ref.id)))
        .for('update');
      const attempts = row?.smsAttempts;
      const index = attempts?.findIndex((entry) => entry.number === ref.attempt) ?? -1;
      const last = attempts?.[index];
      if (!row || !attempts || !last) return null;
      const next = update(last, row);
      if (!next) return null;
      await tx
        .update(invitations)
        .set({ smsAttempts: attempts.map((entry, i) => (i === index ? next : entry)) })
        .where(eq(invitations.id, ref.id));
      if (scheduleReport && next.status === 'sent' && next.provider === 'smsir' && next.messageId) {
        await this.outbox.add(tx, {
          type: 'notification.sms.report',
          workspaceId: ref.workspaceId,
          aggregateType: 'invitation',
          aggregateId: ref.id,
          payload: ref,
        });
      }
      return next;
    });
  }
}

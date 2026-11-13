'use client';

import type { Department, Invitation, InvitationChannel } from '@taskin/contracts';
import { useRef, useState } from 'react';
import { newIdempotencyKey } from '@/lib/api-client';
import { problemMessage } from '@/lib/api-problem';
import { DEPARTMENTS, roleLabel } from '@/data/reference';
import { cn } from '@/lib/utils';
import { CHANNEL_LABELS, formatRecipient } from '@taskin/text';
import { Button, IconButton, RelativeTime } from '@/components/ui';
import { MobileIcon, SmsIcon, TrashIcon } from '@/components/icons';

/** Envelope for email, handset for SMS — the same glyph on chips and in the pending queue. */
export const CHANNEL_ICONS: Readonly<Record<InvitationChannel, typeof SmsIcon>> = {
  email: SmsIcon,
  sms: MobileIcon,
};

export function PendingInvitationRow({
  invitation,
  departments,
  onRevoke,
  onRetrySms,
}: {
  readonly invitation: Invitation;
  readonly departments: readonly Department[];
  readonly onRevoke?: (invitationId: string) => void;
  readonly onRetrySms?: (invitationId: string, commandId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flight = useRef(false);
  const command = useRef<{ attempt: number; key: string } | null>(null);
  const delivery = invitation.smsDelivery;
  const status = delivery?.status ?? 'unknown';
  const statusText = {
    queued: 'پیامک در صف ارسال است.',
    sending: 'در حال ارسال پیامک…',
    sent: 'پیامک ارسال شد.',
    delivered: 'پیامک تحویل شد.',
    failed: 'پیامک دعوت ارسال نشد.',
    unknown: 'وضعیت ارسال پیامک مشخص نیست.',
  }[status];
  const reason = delivery?.failureCode
    ? {
        provider_rejected: 'سرویس پیامک درخواست را نپذیرفت.',
        provider_unavailable: 'سرویس پیامک در دسترس نیست.',
        provider_rate_limited: 'سرویس پیامک درخواست‌های زیادی دریافت کرده است؛ کمی بعد دوباره تلاش کنید.',
        provider_configuration: 'تنظیمات یا اعتبار سرویس پیامک نیاز به بررسی مدیر سرویس دارد.',
        template_rejected: 'الگو یا پارامترهای پیامک دعوت نیاز به بررسی مدیر سرویس دارد.',
        invalid_recipient: 'سرویس پیامک شماره گیرنده را نامعتبر اعلام کرد.',
        recipient_blocked: 'گیرنده در فهرست مسدود سرویس پیامک است؛ ارسال دوباره مجاز نیست.',
        operator_rejected: 'سرویس پیامک نرسیدن پیام به اپراتور را تأیید کرد.',
        delivery_failed: 'سرویس پیامک تحویل به گیرنده را ناموفق اعلام کرد.',
        acceptance_unknown: 'پاسخ قطعی دریافت نشد؛ برای جلوگیری از پیامک تکراری، ارسال دوباره فعال نیست.',
        test_transport: 'این دعوت در محیط آزمایشی ثبت شده و پیامک واقعی ارسال نشده است.',
      }[delivery.failureCode]
    : null;
  const retry = async () => {
    if (!onRetrySms || flight.current) return;
    const attempt = delivery?.attemptCount ?? 0;
    if (command.current?.attempt !== attempt) command.current = { attempt, key: newIdempotencyKey() };
    flight.current = true;
    setBusy(true);
    setError(null);
    try {
      await onRetrySms(invitation.id, command.current.key);
    } catch (cause) {
      setError(problemMessage(cause, 'ارسال دوباره انجام نشد. دوباره تلاش کنید.'));
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const departmentName =
    departments.find((entry) => entry.id === invitation.department)?.name ??
    DEPARTMENTS.find((entry) => entry.id === invitation.department)?.name ??
    '';
  const Icon = CHANNEL_ICONS[invitation.channel];
  const display = formatRecipient(invitation);
  return (
    <li
      data-channel={invitation.channel}
      className="flex items-center gap-2.5 rounded-lg border border-secondary bg-surface px-2.5 py-2"
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-fg-tertiary"
        title={`ارسال با ${CHANNEL_LABELS[invitation.channel]}`}
      >
        <Icon size={16} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'truncate text-caption font-semibold text-fg-primary latin-inline',
            invitation.channel === 'sms' && 'numeric',
          )}
        >
          {display}
        </span>
        <span className="truncate text-micro text-fg-tertiary numeric">
          {`${CHANNEL_LABELS[invitation.channel]}، ${roleLabel(invitation.role)}، ${departmentName}، `}
          <RelativeTime iso={invitation.invitedAt} />
        </span>
        <span className="text-micro text-fg-tertiary">دعوت‌نامه ثبت شد.</span>
        {invitation.channel === 'sms' && (
          <>
            <span
              className={cn(
                'text-caption',
                status === 'failed' ? 'text-status-blocked' : 'text-fg-secondary',
              )}
            >
              {statusText}
            </span>
            {reason && <span className="text-micro text-fg-tertiary">{reason}</span>}
            {onRetrySms && delivery?.retryable && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2 self-start"
                disabled={busy}
                onClick={() => void retry()}
              >
                ارسال دوباره پیامک
              </Button>
            )}
            {error && (
              <span role="alert" className="text-caption text-status-blocked">
                {error}
              </span>
            )}
          </>
        )}
      </span>
      {onRevoke && (
        <IconButton
          label={`لغو دعوت ${display}`}
          icon={<TrashIcon size={16} />}
          size="sm"
          className="size-11 hover:text-status-blocked"
          onClick={() => onRevoke(invitation.id)}
        />
      )}
    </li>
  );
}

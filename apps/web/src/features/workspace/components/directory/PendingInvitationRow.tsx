'use client';

import type { Invitation,InvitationChannel } from '@taskin/contracts';
import { DEPARTMENTS,roleLabel } from '@/data/reference';
import { cn } from '@/lib/utils';
import {
CHANNEL_LABELS,
formatRecipient
} from '@taskin/text';
import { IconButton,RelativeTime } from '@/components/ui';
import { MobileIcon,SmsIcon,TrashIcon } from '@/components/icons';


/** Envelope for email, handset for SMS — the same glyph on chips and in the pending queue. */
export const CHANNEL_ICONS: Readonly<Record<InvitationChannel, typeof SmsIcon>> = {
  email: SmsIcon,
  sms: MobileIcon,
};

export function PendingInvitationRow({
  invitation,
  onRevoke,
}: {
  readonly invitation: Invitation;
  readonly onRevoke: (invitationId: string) => void;
}) {
  const departmentName = DEPARTMENTS.find((entry) => entry.id === invitation.department)?.name ?? '';
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
            'latin-inline truncate text-caption font-semibold text-fg-primary',
            invitation.channel === 'sms' && 'numeric',
          )}
        >
          {display}
        </span>
        <span className="numeric truncate text-micro text-fg-tertiary">
          {`${CHANNEL_LABELS[invitation.channel]}، ${roleLabel(invitation.role)}، ${departmentName}، `}
          <RelativeTime iso={invitation.invitedAt} />
        </span>
      </span>
      <IconButton
        label={`لغو دعوت ${display}`}
        icon={<TrashIcon size={16} />}
        size="sm"
        className="hover:text-status-blocked"
        onClick={() => onRevoke(invitation.id)}
      />
    </li>
  );
}

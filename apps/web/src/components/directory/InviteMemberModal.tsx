'use client';

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import type { DepartmentId, Invitation, InvitationChannel, InvitationRecipient, RoleId } from '@taskin/contracts';
import type { InvitationDraft } from '@/store/workspace-reducer';
import { directory } from '@/store/directory';
import { DEPARTMENTS, ROLES, roleLabel } from '@/data/reference';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import {
  CHANNEL_LABELS,
  formatRecipient,
  looksLikePhone,
  normaliseIranMobile,
  parseRecipient,
  splitRecipients,
} from '@taskin/text';
import { useNamespacedId } from '@/hooks/useId';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { Badge, Button, IconButton, Modal, RelativeTime, Select, Textarea } from '@/components/ui';
import { CloseIcon, MobileIcon, SendIcon, SmsIcon, TrashIcon, UserAddIcon } from '@/components/icons';

export interface InviteMemberModalProps {
  readonly open: boolean;
  readonly invitations: readonly Invitation[];
  readonly onClose: () => void;
  readonly onSubmit: (draft: InvitationDraft) => void;
  readonly onRevoke: (invitationId: string) => void;
}

/** Separator keys that commit what has been typed so far. */
const COMMIT_KEYS = ['Enter', ',', '،', ';', '؛', ' '];
const INVITABLE_ROLES = ROLES.filter((role) => !role.locked);

/** Envelope for email, handset for SMS — the same glyph on chips and in the pending queue. */
export const CHANNEL_ICONS: Readonly<Record<InvitationChannel, typeof SmsIcon>> = {
  email: SmsIcon,
  sms: MobileIcon,
};

/** Members' addresses, normalised, so an entry is recognised however it is written. */
/** Addresses of people already in the workspace, read when a recipient is added. */
const memberEmails = () => new Set(directory.users().map((user) => user.email.toLowerCase()));
const memberMobiles = () => new Set(directory.users().map((user) => normaliseIranMobile(user.phone)).filter(Boolean));

/** A rejected entry and why — rendered with the entry bidi-isolated inside Persian copy. */
interface Problem {
  readonly token: string;
  readonly reason: string;
}

/**
 * Invites colleagues by email or Iranian mobile number, with a role and department. Each entry
 * is classified as it is committed: emails are invited by email; mobile numbers (written as
 * `09…`, `+98…` or `0098…`, in Persian or Latin digits) are normalised and invited by SMS.
 * A typo, an existing member or a pending invite is flagged on the entry itself instead of
 * failing the whole batch.
 */
export function InviteMemberModal({ open, invitations, onClose, onSubmit, onRevoke }: InviteMemberModalProps) {
  const [recipients, setRecipients] = useState<readonly InvitationRecipient[]>([]);
  const [pendingText, setPendingText] = useState('');
  const [problems, setProblems] = useState<readonly Problem[]>([]);
  const [role, setRole] = useState<RoleId>('member');
  const [department, setDepartment] = useState<DepartmentId>('engineering');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const id = useNamespacedId('invite-');

  useResetOnOpen(open, () => {
    setRecipients([]);
    setPendingText('');
    setProblems([]);
    setRole('member');
    setDepartment('engineering');
    setMessage('');
    setTouched(false);
  });

  /** Validates raw tokens and adds the good ones. Returns the list as it will be after commit. */
  const commit = (raw: string): readonly InvitationRecipient[] => {
    const tokens = splitRecipients(raw);
    if (tokens.length === 0) return recipients;

    const accepted: InvitationRecipient[] = [];
    const rejected: Problem[] = [];
    for (const token of tokens) {
      const parsed = parseRecipient(token);
      if (!parsed.ok) {
        rejected.push({ token, reason: parsed.reason });
        continue;
      }
      const { address, channel } = parsed.recipient;
      if ([...recipients, ...accepted].some((entry) => entry.address === address)) continue;
      const members = channel === 'sms' ? memberMobiles() : memberEmails();
      if (members.has(address)) rejected.push({ token, reason: 'از قبل عضو سازمان است.' });
      else if (invitations.some((invitation) => invitation.address === address))
        rejected.push({ token, reason: 'دعوت‌نامه در انتظار دارد.' });
      else accepted.push(parsed.recipient);
    }

    const next = [...recipients, ...accepted];
    setRecipients(next);
    setProblems(rejected);
    setPendingText('');
    return next;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (COMMIT_KEYS.includes(event.key)) {
      if (!pendingText.trim()) {
        if (event.key === 'Enter') event.preventDefault();
        return;
      }
      // A space inside a half-typed phone number is grouping (`0912 123 …`), not a separator.
      if (event.key === ' ' && looksLikePhone(pendingText) && !normaliseIranMobile(pendingText)) return;
      event.preventDefault();
      commit(pendingText);
    } else if (event.key === 'Backspace' && pendingText === '' && recipients.length > 0) {
      setRecipients((current) => current.slice(0, -1));
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    // A single entry pastes as text; anything that splits into several is committed at once.
    if (splitRecipients(text).length < 2) return;
    event.preventDefault();
    commit(`${pendingText} ${text}`);
  };

  const submit = () => {
    setTouched(true);
    const finalList = pendingText.trim() ? commit(pendingText) : recipients;
    if (finalList.length === 0) return;
    onSubmit({ recipients: finalList, role, department, message: message.trim() });
  };

  const emptyError = touched && recipients.length === 0 && problems.length === 0;
  const byEmail = recipients.filter((entry) => entry.channel === 'email').length;
  const bySms = recipients.length - byEmail;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="دعوت همکار"
      description="همکاران را با ایمیل یا شماره موبایل دعوت کنید و نقش و دپارتمان آن‌ها را از همین ابتدا تعیین کنید."
      icon={<UserAddIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit} iconStart={<SendIcon size={18} />}>
            {recipients.length > 1 ? `ارسال ${formatCount(recipients.length)} دعوت‌نامه` : 'ارسال دعوت‌نامه'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-recipients`} className="text-body-sm font-medium text-fg-secondary">
            ایمیل یا شماره موبایل همکاران
          </label>
          <div
            className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-primary bg-surface px-2 py-1.5 shadow-xs transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand"
            onClick={() => inputRef.current?.focus()}
          >
            {recipients.map((recipient) => {
              const Icon = CHANNEL_ICONS[recipient.channel];
              const display = formatRecipient(recipient);
              return (
                <span
                  key={recipient.address}
                  data-channel={recipient.channel}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-secondary bg-sunken pe-1 ps-2 text-caption font-medium text-fg-primary"
                >
                  <Icon size={13} className="shrink-0 text-fg-tertiary" />
                  <span className="sr-only">{`${CHANNEL_LABELS[recipient.channel]}: `}</span>
                  <span className={cn('latin-inline', recipient.channel === 'sms' && 'numeric')}>{display}</span>
                  <IconButton
                    label={`حذف ${display}`}
                    icon={<CloseIcon size={12} />}
                    size="xs"
                    className="size-5"
                    onClick={(event) => {
                      event.stopPropagation();
                      setRecipients((current) => current.filter((entry) => entry.address !== recipient.address));
                    }}
                  />
                </span>
              );
            })}
            <input
              ref={inputRef}
              id={`${id}-recipients`}
              type="text"
              dir="ltr"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={pendingText}
              onChange={(event) => setPendingText(event.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onBlur={() => pendingText.trim() && commit(pendingText)}
              placeholder={recipients.length === 0 ? 'name@company.ir · 0912 123 4567' : ''}
              aria-describedby={`${id}-hint`}
              aria-invalid={emptyError || problems.length > 0 || undefined}
              className="h-7 min-w-40 flex-1 bg-transparent px-1 text-body text-fg-primary outline-none placeholder:text-fg-placeholder focus-visible:ring-0 focus-visible:ring-offset-0"
              data-autofocus
            />
          </div>
          <p id={`${id}-hint`} className="text-caption text-fg-tertiary">
            به ایمیل‌ها دعوت‌نامه ایمیلی و به شماره‌های موبایل پیامک ارسال می‌شود. چند مورد را با ویرگول، فاصله یا
            Enter از هم جدا کنید.
          </p>
          {recipients.length > 0 && (
            <p className="numeric flex flex-wrap items-center gap-3 text-caption text-fg-secondary" aria-live="polite">
              {byEmail > 0 && (
                <span className="inline-flex items-center gap-1">
                  <SmsIcon size={14} className="text-fg-tertiary" />
                  {`${formatCount(byEmail)} دعوت با ایمیل`}
                </span>
              )}
              {bySms > 0 && (
                <span className="inline-flex items-center gap-1">
                  <MobileIcon size={14} className="text-fg-tertiary" />
                  {`${formatCount(bySms)} دعوت با پیامک`}
                </span>
              )}
            </p>
          )}
          {(problems.length > 0 || emptyError) && (
            <ul className="flex flex-col gap-0.5" role="alert">
              {emptyError && (
                <li className="text-caption text-status-blocked">دست‌کم یک ایمیل یا شماره موبایل وارد کنید.</li>
              )}
              {problems.map((problem) => (
                <li key={problem.token} className="text-caption text-status-blocked">
                  <bdi className="font-medium">{problem.token}</bdi>
                  {` ${problem.reason}`}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="نقش"
            hideLabel={false}
            value={role}
            onValueChange={setRole}
            options={INVITABLE_ROLES.map((entry) => ({
              value: entry.id,
              label: entry.name,
              description: entry.description,
            }))}
          />
          <Select
            label="دپارتمان"
            hideLabel={false}
            value={department}
            onValueChange={setDepartment}
            options={DEPARTMENTS.map((entry) => ({ value: entry.id, label: entry.name }))}
          />
        </div>

        <Textarea
          label="پیام شخصی (اختیاری)"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="چند خط خوش‌آمدگویی که همراه دعوت‌نامه ارسال می‌شود…"
          maxLength={280}
          className="min-h-20"
        />

        {invitations.length > 0 && (
          <section aria-labelledby={`${id}-pending`} className="flex flex-col gap-2 border-t border-secondary pt-4">
            <div className="flex items-center gap-2">
              <h3 id={`${id}-pending`} className="text-body-sm font-semibold text-fg-primary">
                دعوت‌های در انتظار
              </h3>
              <Badge tone="neutral" size="sm" numeric>
                {formatCount(invitations.length)}
              </Badge>
            </div>
            <ul className="flex flex-col gap-1.5">
              {invitations.map((invitation) => (
                <PendingInvitationRow key={invitation.id} invitation={invitation} onRevoke={onRevoke} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}

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

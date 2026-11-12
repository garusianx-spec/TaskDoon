'use client';

import type { Invitation } from '@taskin/contracts';
import type { InvitationDraft } from '@/store/workspace-reducer';
import { DEPARTMENTS,ROLES } from '@/data/reference';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import {
CHANNEL_LABELS,
formatRecipient
} from '@taskin/text';
import { Badge,Button,IconButton,Modal,Select,Textarea } from '@/components/ui';
import { CloseIcon,MobileIcon,SendIcon,SmsIcon,UserAddIcon } from '@/components/icons';
import { CHANNEL_ICONS,PendingInvitationRow } from '@/features/workspace/components/directory/PendingInvitationRow';
import { useInvitationForm } from '@/features/workspace/hooks/useInvitationForm';

export interface InviteMemberModalProps {
  readonly open: boolean;
  readonly invitations: readonly Invitation[];
  readonly onClose: () => void;
  readonly onSubmit: (draft: InvitationDraft) => void;
  readonly onRevoke: (invitationId: string) => void;
}
const INVITABLE_ROLES = ROLES.filter((role) => !role.locked);

/**
 * Invites colleagues by email or Iranian mobile number, with a role and department. Each entry
 * is classified as it is committed: emails are invited by email; mobile numbers (written as
 * `09…`, `+98…` or `0098…`, in Persian or Latin digits) are normalised and invited by SMS.
 * A typo, an existing member or a pending invite is flagged on the entry itself instead of
 * failing the whole batch.
 */
export function InviteMemberModal({ open, invitations, onClose, onSubmit, onRevoke }: InviteMemberModalProps) {
  const { recipients, setRecipients, pendingText, setPendingText, problems, role, setRole, department, setDepartment, message, setMessage, inputRef, id, commit, onKeyDown, onPaste, submit, emptyError, byEmail, bySms } = useInvitationForm({ open, invitations, onSubmit });


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

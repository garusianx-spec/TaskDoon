'use client';

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import type { DepartmentId, InvitationRecipient, RoleId } from '@taskin/contracts';
import { looksLikePhone, normaliseIranMobile, parseRecipient, splitRecipients } from '@taskin/text';
import { useNamespacedId } from '@/hooks/useId';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { directory } from '@/store/directory';
import type { InviteMemberModalProps } from '@/features/workspace/components/directory/InviteMemberModal';

/** Separator keys that commit what has been typed so far. */
const COMMIT_KEYS = ['Enter', ',', '،', ';', '؛', ' '];

/** Addresses of existing members, read when the recipient is added. */
const memberEmails = () => new Set(directory.users().map((user) => user.email.toLowerCase()));
const memberMobiles = () =>
  new Set(
    directory
      .users()
      .map((user) => normaliseIranMobile(user.phone))
      .filter(Boolean),
  );

/** A rejected entry and why — rendered with the entry bidi-isolated inside Persian copy. */
interface Problem {
  readonly token: string;
  readonly reason: string;
}

export function useInvitationForm({
  open,
  invitations,
  onSubmit,
}: Pick<InviteMemberModalProps, 'open' | 'invitations' | 'onSubmit'>) {
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

  return {
    recipients,
    setRecipients,
    pendingText,
    setPendingText,
    problems,
    role,
    setRole,
    department,
    setDepartment,
    message,
    setMessage,
    inputRef,
    id,
    commit,
    onKeyDown,
    onPaste,
    submit,
    emptyError,
    byEmail,
    bySms,
  };
}

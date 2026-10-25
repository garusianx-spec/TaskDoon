'use client';

import { useRef, useState } from 'react';
import type { PresenceState, ProfileSettings, User } from '@taskin/contracts';
import { PRESENCE_OPTIONS, departmentName, roleLabel } from '@/data/reference';
import { cn } from '@/lib/cn';
import { profileNameError } from '@/lib/profile-name';
import { problemMessage } from '@/api/messages';
import { toPersianDigits } from '@taskin/jalali';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { Avatar, Badge, Button, Input, Modal } from '@/components/ui';
import { CloseIcon, InfoCircleIcon, ShieldIcon, UserIcon } from '@/components/icons';

export interface ProfileModalProps {
  readonly open: boolean;
  readonly user: User;
  readonly profile: ProfileSettings;
  readonly onClose: () => void;
  readonly onSave: (fullName: string, profile: ProfileSettings) => Promise<void>;
  readonly onOpenSecurity: () => void;
}

const STATUS_MAX = 80;
const STATUS_SUGGESTIONS: readonly string[] = ['در جلسه', 'دورکاری', 'در مرخصی', 'تمرکز روی کار عمیق'];

const PRESENCE_DOT: Readonly<Record<PresenceState, string>> = {
  online: 'bg-status-done',
  busy: 'bg-status-blocked',
  away: 'bg-status-progress',
  offline: 'bg-gray-400',
};

/**
 * Account name and workspace availability. Save awaits confirmation and keeps failed edits.
 */
export function ProfileModal({ open, user, profile, onClose, onSave, onOpenSecurity }: ProfileModalProps) {
  const [presence, setPresence] = useState<PresenceState>(profile.presence);
  const [statusMessage, setStatusMessage] = useState(profile.statusMessage);
  const [fullName, setFullName] = useState(user.fullName);
  const [nameError, setNameError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useResetOnOpen(
    open,
    () => {
      setPresence(profile.presence);
      setStatusMessage(profile.statusMessage);
      setFullName(user.fullName);
      setNameError(undefined);
      setSaveError(undefined);
    },
  );

  const { registerItem, onKeyDown } = useRovingFocus(PRESENCE_OPTIONS.length, 'horizontal', {
    onActivate: (index) => {
      const option = PRESENCE_OPTIONS[index];
      if (option) setPresence(option.id);
    },
  });

  const submit = async () => {
    if (busy.current) return;
    const error = profileNameError(fullName);
    if (error) {
      nameRef.current?.focus();
      setNameError(error);
      return;
    }
    busy.current = true;
    setSaving(true);
    setSaveError(undefined);
    try {
      await onSave(fullName.trim(), { presence, statusMessage: statusMessage.trim() });
    } catch (error) {
      setSaveError(problemMessage(error, 'ذخیره پروفایل ممکن نشد. دوباره تلاش کنید.'));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const close = () => { if (!busy.current) onClose(); };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title="پروفایل من"
      description="نام نمایشی، وضعیت حضور و پیامی که همکاران کنار نام شما می‌بینند."
      icon={<UserIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={close}>
            انصراف
          </Button>
          <Button loading={saving} type="submit" form="profile-settings-form">
            {saving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
          </Button>
        </>
      }
    >
      <form id="profile-settings-form" noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={saving} aria-busy={saving} className="flex min-w-0 flex-col gap-5">
        <section className="flex items-center gap-4 rounded-xl border border-secondary bg-sunken p-4">
          <Avatar
            name={user.fullName}
            initials={user.initials}
            tone={user.avatarTone}
            size="xl"
            presence={presence}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-title font-bold text-fg-primary">{user.fullName}</span>
            <span className="truncate text-caption text-fg-tertiary">{user.jobTitle}</span>
            {statusMessage.trim() && (
              <span className="truncate text-caption text-fg-secondary">{`«${statusMessage.trim()}»`}</span>
            )}
          </div>
          <Badge tone="brand" size="md" className="self-start">
            {roleLabel(user.role)}
          </Badge>
        </section>

        <Input
          ref={nameRef}
          label="نام نمایشی"
          name="fullName"
          autoComplete="name"
          required
          maxLength={160}
          value={fullName}
          onChange={(event) => { setFullName(event.target.value); setNameError(undefined); setSaveError(undefined); }}
          onFocus={() => setNameError(undefined)}
          onBlur={() => setNameError(profileNameError(fullName))}
          error={nameError}
          hint="۲ تا ۸۰ نویسه؛ این نام در همه فضاهای کاری شما نمایش داده می‌شود."
        />
        {saveError && <p role="alert" className="text-body-sm text-status-blocked">{saveError}</p>}

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ProfileField label="ایمیل سازمانی">
            {user.email ? <span className="latin-inline">{user.email}</span> : <span className="text-fg-quaternary">ثبت نشده</span>}
          </ProfileField>
          <ProfileField label="تلفن همراه">
            <span className="numeric">{toPersianDigits(user.phone)}</span>
          </ProfileField>
          <ProfileField label="دپارتمان">{departmentName(user.department)}</ProfileField>
          <ProfileField label="نقش در فضای کاری">{roleLabel(user.role)}</ProfileField>
        </dl>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-sm font-medium text-fg-secondary">وضعیت حضور</legend>
          <div role="radiogroup" aria-label="وضعیت حضور" onKeyDown={onKeyDown} className="grid grid-cols-2 gap-2">
            {PRESENCE_OPTIONS.map((option, index) => {
              const selected = option.id === presence;
              return (
                <button
                  key={option.id}
                  ref={registerItem(index)}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setPresence(option.id)}
                  className={cn(
                    'flex items-start gap-2.5 rounded-lg border p-2.5 text-start transition-colors',
                    selected ? 'border-brand bg-brand-subtle' : 'border-secondary hover:bg-hover',
                  )}
                >
                  <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', PRESENCE_DOT[option.id])} aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className={cn('text-body-sm font-semibold', selected ? 'text-fg-brand' : 'text-fg-primary')}>
                      {option.label}
                    </span>
                    <span className="text-micro text-fg-tertiary">{option.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Input
            label="پیام وضعیت"
            value={statusMessage}
            onChange={(event) => setStatusMessage(event.target.value.slice(0, STATUS_MAX))}
            placeholder="مثلاً: تا ساعت ۱۴ در جلسه هستم"
            maxLength={STATUS_MAX}
            hint={`${toPersianDigits(statusMessage.length)} از ${toPersianDigits(STATUS_MAX)} نویسه`}
            iconEnd={
              statusMessage ? (
                <button
                  type="button"
                  onClick={() => setStatusMessage('')}
                  aria-label="پاک کردن پیام وضعیت"
                  className="flex rounded text-fg-quaternary transition-colors hover:text-fg-secondary"
                >
                  <CloseIcon size={16} />
                </button>
              ) : undefined
            }
          />
          <div className="flex flex-wrap gap-1.5" aria-label="پیشنهادها">
            {STATUS_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setStatusMessage(suggestion)}
                aria-pressed={statusMessage === suggestion}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-micro font-medium transition-colors',
                  statusMessage === suggestion
                    ? 'border-brand bg-brand-subtle text-fg-brand'
                    : 'border-secondary bg-surface text-fg-tertiary hover:bg-hover hover:text-fg-secondary',
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-secondary bg-surface p-3">
          <InfoCircleIcon size={18} className="mt-0.5 shrink-0 text-fg-quaternary" />
          <p className="flex-1 text-caption text-fg-tertiary">
            نام نمایشی متعلق به حساب شماست. ایمیل، سمت و دپارتمان از فهرست اعضای سازمان خوانده می‌شوند.
          </p>
          <Button size="xs" variant="secondary" iconStart={<ShieldIcon size={14} />} onClick={onOpenSecurity}>
            امنیت و ورود
          </Button>
        </div>
      </fieldset>
      </form>
    </Modal>
  );
}

function ProfileField({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-secondary px-3 py-2">
      <dt className="text-micro text-fg-tertiary">{label}</dt>
      <dd className="truncate text-body-sm font-medium text-fg-primary">{children}</dd>
    </div>
  );
}

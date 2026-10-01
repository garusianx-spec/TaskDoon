'use client';

import { useEffect, useRef, useState } from 'react';
import type { AvatarTone, PresenceState, ProfileDraft, User } from '@/types';
import { cn } from '@/lib/cn';
import { Avatar, Button, Input, Modal } from '@/components/ui';
import { UserIcon } from '@/components/icons';

export interface EditProfileModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly user: User;
  readonly onSave: (profile: ProfileDraft) => void;
}

const TONES: ReadonlyArray<{ readonly id: AvatarTone; readonly label: string; readonly swatch: string }> = [
  { id: 'brand', label: 'برند', swatch: 'bg-brand-500' },
  { id: 'teal', label: 'سبز', swatch: 'bg-status-done' },
  { id: 'violet', label: 'بنفش', swatch: 'bg-status-review' },
  { id: 'amber', label: 'کهربایی', swatch: 'bg-status-progress' },
  { id: 'rose', label: 'قرمز', swatch: 'bg-status-blocked' },
  { id: 'slate', label: 'خاکستری', swatch: 'bg-gray-400' },
];

const PRESENCE: ReadonlyArray<{ readonly id: PresenceState; readonly label: string; readonly dot: string }> = [
  { id: 'online', label: 'آنلاین', dot: 'bg-status-done' },
  { id: 'busy', label: 'مشغول', dot: 'bg-status-blocked' },
  { id: 'away', label: 'خارج از دسترس', dot: 'bg-status-progress' },
  { id: 'offline', label: 'آفلاین', dot: 'bg-gray-400' },
];

/** Derives the two-letter monogram shown when no photo has been uploaded. */
const deriveInitials = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? '';
  return `${first}${second}` || '؟';
};

/**
 * Profile editor.
 *
 * The avatar control accepts a file and previews it locally via an object URL, which is
 * revoked on unmount. There is no upload endpoint in this build, so the preview is explicitly
 * labelled as local and the saved profile keeps the monogram — rather than silently dropping
 * a picture the user believes was stored.
 */
export function EditProfileModal({ open, onClose, user, onSave }: EditProfileModalProps) {
  const [fullName, setFullName] = useState(user.fullName);
  const [jobTitle, setJobTitle] = useState(user.jobTitle);
  const [avatarTone, setAvatarTone] = useState<AvatarTone>(user.avatarTone);
  const [presence, setPresence] = useState<PresenceState>(user.presence);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setFullName(user.fullName);
    setJobTitle(user.jobTitle);
    setAvatarTone(user.avatarTone);
    setPresence(user.presence);
  }, [open, user]);

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const initials = deriveInitials(fullName);
  const invalid = fullName.trim().length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="پروفایل من"
      description="نام، سمت و نحوه نمایش خود را در فضای کاری ویرایش کنید."
      icon={<UserIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button
            disabled={invalid}
            onClick={() => {
              onSave({
                fullName: fullName.trim(),
                jobTitle: jobTitle.trim(),
                initials,
                avatarTone,
                presence,
              });
              onClose();
            }}
          >
            ذخیره تغییرات
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <span className="relative">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="پیش‌نمایش تصویر پروفایل"
                className="size-16 rounded-full object-cover ring-1 ring-inset ring-black/[0.06]"
              />
            ) : (
              <Avatar
                name={fullName || 'کاربر'}
                initials={initials}
                tone={avatarTone}
                size="xl"
                presence={presence}
              />
            )}
          </span>

          <div className="flex flex-col gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (photoUrl) URL.revokeObjectURL(photoUrl);
                setPhotoUrl(URL.createObjectURL(file));
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                انتخاب تصویر
              </Button>
              {photoUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    URL.revokeObjectURL(photoUrl);
                    setPhotoUrl(null);
                  }}
                >
                  حذف تصویر
                </Button>
              )}
            </div>
            <p className="text-micro leading-5 text-fg-tertiary">
              {photoUrl
                ? 'پیش‌نمایش محلی است؛ در این نسخه سرویس بارگذاری تصویر فعال نیست و مونوگرام ذخیره می‌شود.'
                : 'در نبود تصویر، حروف اختصاری نام شما نمایش داده می‌شود.'}
            </p>
          </div>
        </div>

        <Input
          label="نام و نام خانوادگی"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="نام کامل خود را بنویسید"
          error={invalid ? 'نام نمی‌تواند خالی باشد.' : undefined}
        />

        <Input
          label="سمت سازمانی"
          value={jobTitle}
          onChange={(event) => setJobTitle(event.target.value)}
          placeholder="مثلاً: مدیر محصول"
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-sm font-medium text-fg-secondary">رنگ نشان کاربری</legend>
          <div role="radiogroup" aria-label="رنگ نشان کاربری" className="flex flex-wrap gap-2">
            {TONES.map((tone) => {
              const selected = avatarTone === tone.id;
              return (
                <button
                  key={tone.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAvatarTone(tone.id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-caption font-medium transition-colors',
                    selected
                      ? 'border-brand bg-brand-subtle text-fg-brand'
                      : 'border-secondary bg-surface text-fg-tertiary hover:bg-hover',
                  )}
                >
                  <span className={cn('size-2.5 rounded-full', tone.swatch)} aria-hidden="true" />
                  {tone.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-sm font-medium text-fg-secondary">وضعیت حضور</legend>
          <div role="radiogroup" aria-label="وضعیت حضور" className="flex flex-wrap gap-2">
            {PRESENCE.map((option) => {
              const selected = presence === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPresence(option.id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-caption font-medium transition-colors',
                    selected
                      ? 'border-brand bg-brand-subtle text-fg-brand'
                      : 'border-secondary bg-surface text-fg-tertiary hover:bg-hover',
                  )}
                >
                  <span className={cn('size-2 rounded-full', option.dot)} aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}

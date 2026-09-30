'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import type { AvatarTone, WorkspaceDraft } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@taskin/jalali';
import { monogram } from '@taskin/text';
import { formatFileSize } from '@/lib/format';
import { useNamespacedId } from '@/hooks/useId';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { CheckIcon, GridIcon, ImageIcon, TrashIcon } from '@/components/icons';
import { WORKSPACE_TONES, WorkspaceAvatar } from './WorkspaceAvatar';

export interface CreateWorkspaceModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** `adminPassword` is set when `requirePassword` asked for one. */
  readonly onSubmit: (draft: WorkspaceDraft, adminPassword?: string) => void;
  /** The account has no admin password yet, and owning a workspace needs one. */
  readonly requirePassword?: boolean;
  /** Offer an uploaded image as the icon (the live app shows the monogram until uploads land). */
  readonly allowIcon?: boolean;
}

const MIN_PASSWORD = 8;

const MAX_ICON_BYTES = 1024 * 1024;
const TONE_LABELS: Readonly<Record<AvatarTone, string>> = {
  brand: 'رنگ برند',
  teal: 'سبزآبی',
  violet: 'بنفش',
  amber: 'کهربایی',
  rose: 'صورتی',
  slate: 'خاکستری',
};

/**
 * "ایجاد فضای کاری جدید": name, description and an icon. Without an uploaded image the icon
 * is a two-letter monogram generated from the name as it is typed, on the chosen colour.
 * On submit the workspace is registered and becomes the active one.
 */
export function CreateWorkspaceModal({ open, onClose, onSubmit, requirePassword = false, allowIcon = true }: CreateWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [description, setDescription] = useState('');
  const [tone, setTone] = useState<AvatarTone>('brand');
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [iconError, setIconError] = useState<string | undefined>(undefined);
  const [touched, setTouched] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const id = useNamespacedId('workspace-');
  const tones = useRovingFocus(WORKSPACE_TONES.length, 'horizontal', {
    onActivate: (index) => {
      const next = WORKSPACE_TONES[index];
      if (next) setTone(next);
    },
  });

  useResetOnOpen(open, () => {
    setName('');
    setPassword('');
    setDescription('');
    setTone('brand');
    setIconUrl(null);
    setIconError(undefined);
    setTouched(false);
  });

  const nameError = touched && !name.trim() ? 'نام فضای کاری الزامی است.' : undefined;
  const passwordError =
    requirePassword && touched && password.length < MIN_PASSWORD ? `رمز مدیر دست‌کم ${toPersianDigits(MIN_PASSWORD)} نویسه باشد.` : undefined;

  const onPickIcon = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setIconError('فقط فایل تصویری (PNG، JPG، SVG یا WebP) پذیرفته می‌شود.');
    if (file.size > MAX_ICON_BYTES) {
      return setIconError(`حجم تصویر باید کمتر از ${formatFileSize(MAX_ICON_BYTES)} باشد.`);
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setIconUrl(reader.result);
        setIconError(undefined);
      }
    };
    reader.onerror = () => setIconError('خواندن تصویر ممکن نشد. دوباره تلاش کنید.');
    reader.readAsDataURL(file);
  };

  const submit = () => {
    setTouched(true);
    if (!name.trim() || (requirePassword && password.length < MIN_PASSWORD)) return;
    const draft = { name: name.trim(), description: description.trim(), tone, iconUrl: allowIcon ? iconUrl : null };
    if (requirePassword) onSubmit(draft, password);
    else onSubmit(draft);
  };

  const preview = { name, initials: monogram(name || 'فضای کاری'), tone, iconUrl };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="ایجاد فضای کاری جدید"
      description="یک فضای جدا برای تیم یا پروژه‌ای تازه. پس از ایجاد، به آن منتقل می‌شوید."
      icon={<GridIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit}>ایجاد و ورود</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 rounded-xl border border-secondary bg-sunken p-3">
          <WorkspaceAvatar workspace={preview} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="truncate text-body-sm font-semibold text-fg-primary">
              {name.trim() || 'نام فضای کاری'}
            </span>
            {allowIcon && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  id={`${id}-icon`}
                  onChange={onPickIcon}
                />
                <Button
                  size="xs"
                  variant="secondary"
                  iconStart={<ImageIcon size={14} />}
                  onClick={() => fileRef.current?.click()}
                >
                  {iconUrl ? 'تغییر تصویر' : 'بارگذاری تصویر'}
                </Button>
                {iconUrl && (
                  <Button size="xs" variant="ghost" iconStart={<TrashIcon size={14} />} onClick={() => setIconUrl(null)}>
                    حذف تصویر
                  </Button>
                )}
              </div>
            )}
            {iconError ? (
              <p className="text-caption text-status-blocked" role="alert">
                {iconError}
              </p>
            ) : (
              <p className="text-micro text-fg-tertiary">
                {allowIcon ? 'بدون تصویر، دو حرف اول نام به‌عنوان نشان نمایش داده می‌شود.' : 'دو حرف اول نام به‌عنوان نشان نمایش داده می‌شود.'}
              </p>
            )}
          </div>
        </div>

        <Input
          label="نام فضای کاری"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="مثلاً: تیم زیرساخت ابری"
          error={nameError}
          maxLength={40}
          data-autofocus
        />

        {requirePassword && (
          <Input
            label="رمز مدیر"
            type="password"
            autoComplete="new-password"
            dir="ltr"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onBlur={() => setTouched(true)}
            error={passwordError}
            hint="مالک فضای کاری برای کارهای حساس، مانند حذف فضا یا تغییر دسترسی‌ها، این رمز را وارد می‌کند."
          />
        )}

        <Textarea
          label="توضیحات (اختیاری)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="این فضای کاری برای چیست و چه کسانی در آن کار می‌کنند؟"
          maxLength={160}
          className="min-h-20"
        />

        {!iconUrl && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-body-sm font-medium text-fg-secondary">رنگ نشان</legend>
            <div role="radiogroup" aria-label="رنگ نشان" onKeyDown={tones.onKeyDown} className="flex flex-wrap gap-2">
              {WORKSPACE_TONES.map((entry, index) => {
                const selected = entry === tone;
                return (
                  <button
                    key={entry}
                    ref={tones.registerItem(index)}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={TONE_LABELS[entry]}
                    title={TONE_LABELS[entry]}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setTone(entry)}
                    className={cn(
                      'relative rounded-xl ring-offset-2 ring-offset-surface transition-shadow',
                      selected ? 'ring-2 ring-brand' : 'hover:ring-2 hover:ring-gray-300',
                    )}
                  >
                    <WorkspaceAvatar workspace={{ ...preview, tone: entry, iconUrl: null }} size="sm" />
                    {selected && (
                      <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-brand-solid text-fg-on-brand">
                        <CheckIcon size={10} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>
    </Modal>
  );
}

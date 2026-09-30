'use client';

import { useState } from 'react';
import type { PasswordResetChannel, PasswordResetIssued, PlatformUserDetail } from '@taskin/contracts';
import { adminApi } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { dateTimeLabel, phoneLabel } from '@/admin/format';
import { problemMessage } from '@/api/messages';
import { Button, Modal } from '@/components/ui';
import { CopyIcon, KeyIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

/**
 * Issues a single-use password reset code. The password itself is never shown, set or read by
 * the admin: the person sets a new one with the code. `manual` shows the code once, here, to hand
 * over in person; closing the dialog forgets it.
 */
export function ResetPasswordDialog({ user, open, onClose, onIssued }: { readonly user: PlatformUserDetail; readonly open: boolean; readonly onClose: () => void; readonly onIssued: () => void }) {
  const { call } = useAdmin();
  const [channel, setChannel] = useState<PasswordResetChannel>('sms');
  const [issued, setIssued] = useState<PasswordResetIssued | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const close = () => {
    setIssued(null);
    setError(null);
    setCopied(null);
    onClose();
  };

  const issue = async () => {
    setBusy(true);
    setError(null);
    try {
      setIssued(await call(() => adminApi.issueReset(user.id, channel)));
      onIssued();
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (what: 'code' | 'link', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
    } catch {
      setCopied(null);
    }
  };

  const channels: readonly { readonly id: PasswordResetChannel; readonly title: string; readonly description: string; readonly disabled?: boolean }[] = [
    { id: 'sms', title: 'ارسال پیوند با پیامک', description: `به ${phoneLabel(user.phone)}` },
    { id: 'email', title: 'ارسال پیوند با ایمیل', description: user.email ?? 'این کاربر ایمیل ثبت‌شده ندارد', disabled: !user.email },
    { id: 'manual', title: 'نمایش یک‌باره کد', description: 'برای تحویل حضوری؛ فقط همین یک بار نشان داده می‌شود' },
  ];

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      icon={<KeyIcon size={20} />}
      title="بازنشانی رمز عبور"
      description="رمز فعلی تا وقتی کاربر با کد، رمز تازه‌ای بگذارد کار نمی‌کند. رمز عبور هرگز دیده یا تعیین نمی‌شود."
      footer={
        issued ? (
          <Button key="done" onClick={close}>
            متوجه شدم
          </Button>
        ) : (
          <>
            <Button key="cancel" variant="secondary" onClick={close}>
              انصراف
            </Button>
            <Button key="issue" loading={busy} onClick={() => void issue()}>
              صدور کد بازنشانی
            </Button>
          </>
        )
      }
    >
      {issued ? (
        <div className="flex flex-col gap-3" role="status">
          {issued.channel === 'manual' && issued.code && issued.link ? (
            <>
              <p className="text-body-sm text-fg-secondary">این کد را فقط به خود کاربر بدهید. پس از بستن این پنجره دیگر نمایش داده نمی‌شود.</p>
              <div className="flex items-center gap-2 rounded-lg border border-secondary bg-sunken p-3">
                <code dir="ltr" aria-label="کد بازنشانی" className="flex-1 break-all text-start font-mono text-body-sm text-fg-primary">
                  {issued.code}
                </code>
                <Button variant="secondary" size="xs" iconStart={<CopyIcon size={14} />} onClick={() => void copy('code', issued.code ?? '')}>
                  {copied === 'code' ? 'کپی شد' : 'کپی کد'}
                </Button>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-secondary bg-sunken p-3">
                <code dir="ltr" aria-label="پیوند بازنشانی" className="flex-1 break-all text-start font-mono text-caption text-fg-secondary">
                  {issued.link}
                </code>
                <Button variant="secondary" size="xs" iconStart={<CopyIcon size={14} />} onClick={() => void copy('link', issued.link ?? '')}>
                  {copied === 'link' ? 'کپی شد' : 'کپی پیوند'}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-body-sm text-fg-secondary">
              پیوند بازنشانی به <span dir="ltr">{issued.sentTo}</span> فرستاده شد.
            </p>
          )}
          <p className="text-caption text-fg-tertiary">اعتبار تا {dateTimeLabel(issued.expiresAt)}؛ یک‌بارمصرف. کد قبلی، اگر بود، باطل شد.</p>
        </div>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-body-sm font-medium text-fg-secondary">روش تحویل کد</legend>
          {channels.map((option) => (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                channel === option.id ? 'border-brand bg-brand-subtle' : 'border-secondary hover:bg-hover',
                option.disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name="reset-channel"
                className="mt-1 accent-fg-brand"
                checked={channel === option.id}
                disabled={option.disabled}
                onChange={() => setChannel(option.id)}
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-body-sm font-semibold text-fg-primary">{option.title}</span>
                <span className="text-caption text-fg-tertiary" dir="auto">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
          {error && (
            <p role="alert" className="text-caption text-status-blocked">
              {error}
            </p>
          )}
        </fieldset>
      )}
    </Modal>
  );
}

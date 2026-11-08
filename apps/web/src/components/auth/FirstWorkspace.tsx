'use client';

import { useState, type FormEvent } from 'react';
import type { MeUser } from '@taskin/contracts';
import { session } from '@/api/session';
import { problemMessage } from '@/api/messages';
import type { LiveStore } from '@/store/live/live-store';
import { Button } from '@/components/ui';
import { AuthInput as Input, PasswordInput } from '@/components/auth/AuthFields';
import { BriefcaseIcon, LockIcon, LogoutIcon } from '@/components/icons';
import { AuthCard } from './AuthCard';

/**
 * A new account belongs to no workspace yet: create one (and become its owner), or wait for an
 * invitation. Owners hold an admin password as a second factor, so a first one is set here.
 */
export function FirstWorkspace({ store, user }: { readonly store: LiveStore; readonly user: MeUser | null }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsPassword = !user?.hasPassword && !session.current?.user.hasPassword;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('نام فضای کاری را بنویسید.');
      return;
    }
    if (needsPassword && password.length < 8) {
      setError('رمز مدیر دست‌کم ۸ نویسه است.');
      return;
    }
    setBusy(true);
    setError(null);
    store
      .createFirstWorkspace(name.trim(), needsPassword ? password : null)
      .catch((failure: unknown) => setError(problemMessage(failure)))
      .finally(() => setBusy(false));
  };

  return (
    <AuthCard
      labelledBy="first-workspace-title"
      title={user ? `${user.fullName}، خوش آمدید` : 'خوش آمدید'}
      description="هنوز عضو هیچ فضای کاری نیستید. فضای کاری تیم خود را بسازید، یا منتظر دعوت همکاران بمانید."
    >
      <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={onSubmit} noValidate><fieldset disabled={busy} className="auth-fields">
        <p className="auth-inline-note">با ساخت این فضا، مالک آن می‌شوید و می‌توانید اعضا و دسترسی‌ها را مدیریت کنید. اگر دعوت‌نامه دارید، همان پیوند دعوت را باز کنید؛ نیازی به ساخت فضای تازه نیست.</p>
        <Input label="نام فضای کاری" name="workspace" maxLength={40} value={name} onChange={(event) => setName(event.target.value)} iconStart={<BriefcaseIcon size={18} />} />
        {needsPassword && (
          <PasswordInput
            label="رمز مدیر"
            name="adminPassword"
            autoComplete="new-password"
            hint="مالک فضای کاری برای کارهای حساس (حذف فضا، تغییر دسترسی‌ها) این رمز را دوباره وارد می‌کند. ورود همچنان با پیامک است."
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            iconStart={<LockIcon size={18} />}
          />
        )}
        {error && (
          <p role="alert" className="text-caption text-status-blocked">
            {error}
          </p>
        )}
        <Button type="submit" fullWidth size="lg" loading={busy}>
          ساخت فضای کاری
        </Button>
        <Button variant="ghost" type="button" iconStart={<LogoutIcon size={18} />} onClick={() => void store.signOut()}>
          خروج از حساب
        </Button>
        <Button variant="link" type="button" onClick={() => { setBusy(true); void store.signedIn().catch((failure: unknown) => setError(problemMessage(failure))).finally(() => setBusy(false)); }}>بررسی دوبارهٔ عضویت در تیم</Button>
      </fieldset></form>
    </AuthCard>
  );
}

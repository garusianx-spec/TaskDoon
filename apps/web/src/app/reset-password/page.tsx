'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { completePasswordReset } from '@/admin/api';
import { problemMessage } from '@/api/messages';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button, Input } from '@/components/ui';
import { LockIcon } from '@/components/icons';

type State = { readonly kind: 'reading' } | { readonly kind: 'missing' } | { readonly kind: 'form'; readonly token: string } | { readonly kind: 'done' };

/**
 * The link in a password reset SMS or email, or a code an operator handed over: the person
 * chooses a new password. The code leaves the address bar as soon as the page reads it. This page
 * sits outside the workspace app: no session is needed, and none is started.
 */
export default function ResetPasswordPage() {
  const [state, setState] = useState<State>({ kind: 'reading' });
  const [manualCode, setManualCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) window.history.replaceState(null, '', window.location.pathname);
    setState(token ? { kind: 'form', token } : { kind: 'missing' });
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const token = state.kind === 'form' ? state.token : manualCode.trim();
    if (!token) {
      setError('کد بازنشانی را وارد کنید.');
      return;
    }
    if (password.length < 8) {
      setError('رمز عبور دست‌کم ۸ نویسه باشد، با حروف و عدد یا نماد.');
      return;
    }
    if (password !== repeat) {
      setError('تکرار رمز عبور با خود آن یکی نیست.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await completePasswordReset(token, password);
      setPassword('');
      setRepeat('');
      setState({ kind: 'done' });
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === 'reading') {
    return (
      <AuthCard labelledBy="reset-title" title="گذاشتن رمز عبور تازه">
        <div role="progressbar" aria-label="بارگذاری" className="mx-auto size-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </AuthCard>
    );
  }

  if (state.kind === 'done') {
    return (
      <AuthCard labelledBy="reset-title" title="رمز عبور تازه ذخیره شد" description="برای امنیت، همه نشست‌های حساب بسته شد. دوباره با شماره موبایل وارد شوید.">
        <Link
          href="/feed"
          className="rounded-lg bg-brand-solid px-4 py-2.5 text-center text-body font-semibold text-fg-on-brand shadow-xs transition-colors hover:bg-brand-solid-hover"
        >
          ورود به تسک‌دون
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard labelledBy="reset-title" title="گذاشتن رمز عبور تازه" description="دست‌کم ۸ نویسه، با حروف و عدد یا نماد. این کد فقط یک بار کار می‌کند.">
      <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)} noValidate>
        {state.kind === 'missing' && (
          <Input label="کد بازنشانی" name="code" dir="ltr" autoComplete="off" value={manualCode} onChange={(event) => setManualCode(event.target.value)} />
        )}
        <Input
          label="رمز عبور تازه"
          name="new-password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          iconStart={<LockIcon size={18} />}
        />
        <Input
          label="تکرار رمز عبور"
          name="repeat-password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          iconStart={<LockIcon size={18} />}
          error={error ?? undefined}
        />
        <Button type="submit" fullWidth size="lg" loading={busy}>
          ذخیره رمز عبور
        </Button>
      </form>
    </AuthCard>
  );
}

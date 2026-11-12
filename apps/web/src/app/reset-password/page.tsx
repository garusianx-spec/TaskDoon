'use client';

import Link from 'next/link';
import { useEffect,useState,type FormEvent } from 'react';
import { completePasswordReset } from '@/features/admin/api/admin-api';
import { problemMessage } from '@/lib/api-problem';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { Button } from '@/components/ui';
import { AuthFormError,AuthInput as Input,PasswordInput } from '@/features/auth/components/AuthFields';
import { LockIcon } from '@/components/icons';

type State = { readonly kind: 'reading' } | { readonly kind: 'missing' } | { readonly kind: 'form'; readonly token: string } | { readonly kind: 'done' };
type Feedback = { readonly target: 'code' | 'password' | 'repeat' | 'form'; readonly message: string };

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
  const [error, setError] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const errorFor = (target: Feedback['target']) => error?.target === target ? error.message : undefined;

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) window.history.replaceState(null, '', window.location.pathname);
    setState(token ? { kind: 'form', token } : { kind: 'missing' });
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const token = state.kind === 'form' ? state.token : manualCode.trim();
    if (!token) {
      setError({ target: 'code', message: 'کد بازنشانی را وارد کنید.' });
      return;
    }
    if (password.length < 8) {
      setError({ target: 'password', message: 'رمز عبور دست‌کم ۸ نویسه باشد، با حروف و عدد یا نماد.' });
      return;
    }
    if (password !== repeat) {
      setError({ target: 'repeat', message: 'تکرار رمز عبور با خود آن یکی نیست.' });
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
      setError({ target: 'form', message: problemMessage(failure) });
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
      <form aria-busy={busy} className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)} noValidate><fieldset disabled={busy} className="auth-fields">
        {state.kind === 'missing' && (
          <Input label="کد بازنشانی" name="code" dir="ltr" autoComplete="off" value={manualCode} onChange={(event) => { setManualCode(event.target.value); setError(null); }} error={errorFor('code')} />
        )}
        <PasswordInput
          label="رمز عبور تازه"
          name="new-password"
          dir="ltr"
          autoComplete="new-password"
          value={password}
          onChange={(event) => { setPassword(event.target.value); setError(null); }}
          iconStart={<LockIcon size={18} />}
          error={errorFor('password')}
        />
        <PasswordInput
          label="تکرار رمز عبور"
          name="repeat-password"
          dir="ltr"
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => { setRepeat(event.target.value); setError(null); }}
          iconStart={<LockIcon size={18} />}
          error={errorFor('repeat')}
        />
        <AuthFormError message={errorFor('form')} />
        <Button type="submit" fullWidth size="lg" loading={busy}>
          ذخیره رمز عبور
        </Button>
      </fieldset></form>
    </AuthCard>
  );
}

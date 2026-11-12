'use client';

import { useState } from 'react';
import { session } from '@/features/auth/api/session';
import { problemMessage } from '@/lib/api-problem';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { Button, Input } from '@/components/ui';

/** Verification proves the current profile address before it can receive password recovery. */
export function RecoveryEmail({
  email,
  open,
}: {
  readonly email: string | null | undefined;
  readonly open: boolean;
}) {
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useResetOnOpen(open, () => {
    setSent(false);
    setVerified(false);
    setCode('');
    setError(null);
    setBusy(false);
  });
  const attempt = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="security-recovery-email" className="flex flex-col gap-3">
      <h3 id="security-recovery-email" className="text-title-sm font-semibold text-fg-primary">
        ایمیل بازیابی رمز مدیر
      </h3>
      <p className="text-caption text-fg-tertiary">
        برای بازیابی رمز مدیر، ایمیل پروفایل خود را تأیید کنید. تغییر ایمیل، تأیید قبلی را لغو می‌کند.
      </p>
      {email ? (
        <>
          <p className="break-all text-body-sm text-fg-secondary" dir="ltr">
            {email}
          </p>
          {!sent && !verified && (
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={() =>
                void attempt(async () => {
                  await session.requestEmailVerification();
                  setSent(true);
                })
              }
            >
              ارسال کد تأیید ایمیل
            </Button>
          )}
          {sent && !verified && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (code.trim())
                  void attempt(async () => {
                    await session.confirmEmailVerification(code.trim());
                    setCode('');
                    setVerified(true);
                  });
              }}
            >
              <Input
                label="کد تأیید ایمیل"
                dir="ltr"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                hint="کد را از ایمیل تأیید کپی کنید."
              />
              <Button size="sm" loading={busy} type="submit" disabled={!code.trim()}>
                تأیید ایمیل بازیابی
              </Button>
            </form>
          )}
          {verified && (
            <p role="status" className="text-caption text-status-done">
              ایمیل بازیابی تأیید شد.
            </p>
          )}
          {error && (
            <p role="alert" className="text-caption text-status-blocked">
              {error}
            </p>
          )}
        </>
      ) : (
        <p className="text-caption text-fg-tertiary">
          ابتدا ایمیل خود را در پروفایل ثبت کنید، سپس برای تأیید آن به این بخش برگردید.
        </p>
      )}
    </section>
  );
}

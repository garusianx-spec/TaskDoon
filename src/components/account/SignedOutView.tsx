'use client';

import { WORKSPACE } from '@/data/workspace';
import { Button } from '@/components/ui';
import { LockIcon, LogoutIcon } from '@/components/icons';

export interface SignedOutViewProps {
  readonly onSignIn: () => void;
  readonly fullName: string;
}

/**
 * Post-logout screen.
 *
 * There is no auth backend in this build, so rather than routing to a credential form that
 * cannot verify anything, the shell renders this confirmation with a single way back in. It
 * occupies the whole viewport, which is what actually matters: the workspace, its data and
 * the navigation chrome are gone until the user signs in again.
 */
export function SignedOutView({ onSignIn, fullName }: SignedOutViewProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-brand-subtle text-fg-brand">
        <LogoutIcon size={30} />
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="text-display font-extrabold text-fg-primary">از حساب خارج شدید</h1>
        <p className="max-w-md text-body text-fg-tertiary">
          {`${fullName} عزیز، نشست شما در فضای کاری «${WORKSPACE.name}» بسته شد. برای ادامه کار دوباره وارد شوید.`}
        </p>
      </div>

      <Button size="lg" iconStart={<LockIcon size={18} />} onClick={onSignIn}>
        ورود دوباره به فضای کاری
      </Button>

      <p className="max-w-sm text-caption leading-6 text-fg-quaternary">
        در این نسخه سرویس احراز هویت متصل نیست؛ ورود دوباره، وضعیت فضای کاری را از نو
        بارگذاری می‌کند.
      </p>
    </main>
  );
}

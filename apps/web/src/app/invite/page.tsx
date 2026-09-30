'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';

/**
 * The link in an invitation SMS or email (`/invite?token=…`). The live store keeps the token
 * through the sign-in screen and accepts it before loading, so by the time this page renders the
 * account has joined — and the invited workspace is the one open. All that is left is the desk.
 */
export default function InvitePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/feed');
  }, [router]);

  return (
    <AuthCard labelledBy="invite-title" title="پیوستن به فضای کاری" description="در حال باز کردن فضای کاری…">
      <div role="progressbar" aria-label="بارگذاری" className="mx-auto size-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
    </AuthCard>
  );
}

import Link from 'next/link';
import { PublicSurface } from '@/components/public/PublicSurface';

/** Unknown addresses stay public and do not initialize a workspace session. */
export default function NotFound() {
  return (
    <PublicSurface>
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <p className="text-display font-extrabold text-fg-brand numeric">۴۰۴</p>
        <h1 className="text-heading font-bold text-fg-primary">این صفحه پیدا نشد</h1>
        <p className="max-w-md text-body text-fg-tertiary">
          نشانی را بررسی کنید یا از صفحهٔ اصلی مسیر تازه‌ای پیدا کنید.
        </p>
        <Link
          href="/"
          className="rounded-lg bg-brand-solid px-4 py-2.5 text-body font-semibold text-fg-on-brand shadow-xs transition-colors hover:bg-brand-solid-hover"
        >
          بازگشت به صفحهٔ اصلی
        </Link>
      </main>
    </PublicSurface>
  );
}

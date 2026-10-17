import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';

/** Public unknown addresses never mount the authenticated workspace store or sign-in gate. */
export default function NotFound() {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-6 text-center"><Link href="/" aria-label="تسک‌دون، صفحه اصلی"><Logo className="mb-6 h-8" /></Link><p className="text-display font-extrabold text-fg-brand">۴۰۴</p><h1 className="text-heading font-bold text-fg-primary">این صفحه پیدا نشد</h1><p className="max-w-md text-body leading-7 text-fg-tertiary">نشانی صفحه را بررسی کنید یا از صفحه اصلی ادامه دهید.</p><Link href="/" className="rounded-xl bg-brand-solid px-5 py-3 text-body font-semibold text-fg-on-brand shadow-xs transition-colors hover:bg-brand-solid-hover">بازگشت به صفحه اصلی</Link></main>;
}

'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center"><h1 className="text-heading font-bold">بارگذاری صفحه انجام نشد</h1><p className="max-w-md text-body leading-7 text-fg-tertiary">سرویس موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.</p><Button onClick={reset}>تلاش دوباره</Button><Link href="/" className="text-body text-fg-brand underline">صفحه اصلی</Link></main>;
}

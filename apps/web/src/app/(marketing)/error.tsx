'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function MarketingError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="marketing-state" role="alert"><p className="marketing-eyebrow">تسک‌دون</p><h1>محتوای این صفحه فعلاً در دسترس نیست</h1><p>ارتباط با سرویس محتوا برقرار نشد. کمی بعد دوباره تلاش کنید.</p><div className="marketing-actions"><Button onClick={reset}>تلاش دوباره</Button><Link className="marketing-button marketing-button-secondary" href="/">صفحه اصلی</Link></div></div>;
}

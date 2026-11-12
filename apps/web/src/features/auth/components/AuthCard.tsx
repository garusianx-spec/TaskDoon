import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { ArrowRightIcon,CheckIcon,MessagesIcon,TaskSquareIcon,CalendarIcon } from '@/components/icons';
import { PublicSurface } from '@/components/public/PublicSurface';
import { DemoTask } from '@/components/public/DemoTask';
import './auth.css';

/** Shared entry surface. It owns no session or theme state and never initializes a workspace. */
export function AuthCard({ title, description, children, labelledBy }: { readonly title: string; readonly description?: ReactNode; readonly children?: ReactNode; readonly labelledBy: string }) {
  return <PublicSurface className="auth-page">
    <a href="#auth-content" className="focusable-sr-only">رفتن به فرم ورود</a>
    <main className="auth-layout">
      <div className="auth-functional">
        <nav className="auth-navigation" aria-label="ناوبری ورود">
          <Link href="/" aria-label="تسک‌دون، صفحهٔ اصلی"><Logo className="auth-logo" /></Link>
          <Link href="/" className="auth-back"><ArrowRightIcon size={17} />بازگشت به سایت</Link>
        </nav>
        <section id="auth-content" className="auth-form-panel" aria-labelledby={labelledBy}>
          <div className="auth-brand-mark" aria-hidden="true"><CheckIcon size={26} /></div>
          <header className="auth-form-heading"><h1 id={labelledBy} tabIndex={-1}>{title}</h1>{description && <p>{description}</p>}</header>
          {children}
          <p className="auth-help">برای ورود به راهنمایی نیاز دارید؟ <Link href="/contact">با ما در ارتباط باشید</Link></p>
        </section>
        <footer className="auth-footer"><span>تسک‌دون؛ فضای مشترک کارهای تیم شما</span><span>فارسی، از اولین قدم</span></footer>
      </div>
      <aside className="auth-brand-panel" aria-label="آشنایی با تسک‌دون">
        <div className="auth-brand-copy"><h2>کارها روشن.<br />تیم، هماهنگ.</h2><p>از اولین گفتگو تا آخرین قدم پروژه،<br />همه در یک فضای کاری مشترک.</p></div>
        <div className="auth-workspace-sample">
          <div className="auth-sample-header"><span className="auth-workspace-symbol"><TaskSquareIcon size={19} /></span><div><strong>فضای کاری تیم محصول</strong><span>پروژهٔ معرفی محصول</span></div><span className="auth-sample-date"><CalendarIcon size={16} />۲۴ آبان</span></div>
          <div className="auth-sample-tabs"><span><TaskSquareIcon size={16} />برد پروژه</span><span><MessagesIcon size={16} />گفتگو</span></div>
          <div className="auth-sample-body"><DemoTask /><div className="auth-sample-message"><MessagesIcon size={20} /><p>«بازخوردها همین‌جا جمع شد؛<br />قدم بعدی مشخص است.»</p></div></div>
          <p className="auth-sample-caption">پیش‌نمایش با دادهٔ نمونه</p>
        </div>
        <div className="auth-brand-bottom"><span><CheckIcon size={16} />وظایف و پروژه‌ها</span><span><CheckIcon size={16} />گفتگو و یادداشت</span><span><CheckIcon size={16} />تقویم شمسی</span></div>
      </aside>
    </main>
  </PublicSurface>;
}

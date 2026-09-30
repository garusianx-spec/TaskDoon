'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { useAdmin, useAdminMe } from '@/admin/AdminSession';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui';
import { BriefcaseIcon, LogoutIcon, MessagesIcon, PeopleIcon, ShieldIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

const SECTIONS = [
  { href: '/admin/users', label: 'کاربران و سشن‌ها', icon: PeopleIcon },
  { href: '/admin/conversations', label: 'رصد پیام‌ها و گروه‌ها', icon: MessagesIcon },
  { href: '/admin/workspaces', label: 'ورک‌اسپیس‌ها و نقش‌ها', icon: BriefcaseIcon },
  { href: '/admin/audit', label: 'گزارش بازرسی', icon: ShieldIcon },
] as const;

/** The admin shell: its own navigation, nothing of the workspace app's rail, header or overlays. */
export function AdminShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const admin = useAdminMe();
  const { signOut } = useAdmin();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b border-secondary bg-surface p-4 lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:border-b-0 lg:border-e">
        <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-start">
          <div className="flex flex-col gap-1">
            <Logo title="تسک‌دون" className="h-7 w-auto self-start" />
            <span className="text-caption font-semibold text-fg-brand">پنل مدیریت پلتفرم</span>
          </div>
          <Button variant="ghost" size="sm" className="lg:hidden" iconStart={<LogoutIcon size={16} />} onClick={() => void signOut()}>
            خروج
          </Button>
        </div>
        <nav aria-label="بخش‌های پنل مدیریت" className="-mx-1 flex gap-1 overflow-x-auto lg:mx-0 lg:flex-col lg:overflow-visible">
          {SECTIONS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-body-sm font-medium transition-colors',
                  active ? 'bg-brand-subtle text-fg-brand' : 'text-fg-secondary hover:bg-hover hover:text-fg-primary',
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden flex-col gap-2 border-t border-secondary pt-4 lg:mt-auto lg:flex">
          <p className="text-body-sm font-semibold text-fg-primary">{admin.fullName}</p>
          <p className="text-caption text-fg-tertiary">هر مشاهده در گزارش بازرسی ثبت می‌شود.</p>
          <Button variant="secondary" size="sm" iconStart={<LogoutIcon size={16} />} onClick={() => void signOut()}>
            خروج
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <Suspense fallback={null}>{children}</Suspense>
      </main>
    </div>
  );
}

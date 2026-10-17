'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SITE_SECTIONS } from './SiteDashboard';

export function SiteNavigation() {
  const pathname = usePathname();
  return <nav aria-label="مدیریت وب‌سایت" className="mb-6 flex gap-1 overflow-x-auto border-b border-secondary pb-3">{SITE_SECTIONS.map(({ path, label }) => { const href = `/admin/site${path ? `/${path}` : ''}`; const active = pathname === href || path === 'pages' && pathname.startsWith(`${href}/`); return <Link key={path} href={href} aria-current={active ? 'page' : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-body-sm font-semibold transition-colors ${active ? 'bg-brand-subtle text-fg-brand' : 'text-fg-tertiary hover:bg-hover hover:text-fg-primary'}`}>{label}</Link>; })}</nav>;
}

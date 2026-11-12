import Link from 'next/link';
import type { ReactNode } from 'react';
import { siteHref } from '@/lib/site-utils';

export function SiteLink({ href, children, className, ...rest }: { href: unknown; children: ReactNode; className?: string; 'aria-label'?: string }) {
  const safe = siteHref(href);
  if (!safe) return <span className={className}>{children}</span>;
  return <Link href={safe} className={className} {...rest}>{children}</Link>;
}

export function Arrow({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" className={`size-5 shrink-0 ${className}`} aria-hidden="true"><path d="M19 12H5m6 6-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

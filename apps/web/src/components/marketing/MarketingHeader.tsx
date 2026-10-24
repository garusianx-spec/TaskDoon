'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { SiteLink as SiteLinkType } from '@taskin/contracts';
import { MarketingLogo } from './MarketingLogo';
import { SiteLink, Arrow } from './SiteLink';

export function MarketingHeader({ links, cta, siteName, logo }: { links: SiteLinkType[]; cta: SiteLinkType | null; siteName: string; logo?: unknown }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  useEffect(() => { const onScroll = () => setScrolled(window.scrollY > 16); onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  return (
    <header className={`marketing-header ${scrolled ? 'is-scrolled' : ''}`} onKeyDown={event => { if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus(); } }}>
      <div className="marketing-container marketing-header-inner">
        <SiteLink href="/" className="marketing-brand" aria-label={`${siteName}، صفحه اصلی`}><MarketingLogo name={siteName} value={logo} /></SiteLink>
        <nav className="marketing-desktop-nav" aria-label="ناوبری اصلی">
          {links.map((link, i) => <SiteLink key={`${link.href}-${i}`} href={link.href} className={`marketing-nav-link ${pathname === link.href ? 'is-current' : ''}`}>{link.label}</SiteLink>)}
        </nav>
        <div className="marketing-header-actions">
          {cta?.href !== '/feed' && <SiteLink href="/feed" className="marketing-login">ورود</SiteLink>}
          {cta && <SiteLink href={cta.href} className="marketing-button marketing-button-primary marketing-header-cta">{cta.label}<Arrow /></SiteLink>}
          <button ref={toggle} type="button" className="marketing-menu-toggle" aria-label={open ? 'بستن فهرست' : 'باز کردن فهرست'} aria-expanded={open} aria-controls="marketing-mobile-navigation" onClick={() => setOpen(!open)}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-6"><path d={open ? 'm6 6 12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
      <div className={`marketing-mobile-shell ${open ? 'is-open' : ''}`} inert={!open}><nav id="marketing-mobile-navigation" aria-label="ناوبری موبایل" className="marketing-mobile-nav" onClick={() => setOpen(false)}>
        {links.map((link, i) => <SiteLink key={`${link.href}-${i}`} href={link.href} className="marketing-nav-link">{link.label}</SiteLink>)}
        {cta && <SiteLink href={cta.href} className="marketing-button marketing-button-primary">{cta.label}<Arrow /></SiteLink>}
      </nav></div>
    </header>
  );
}

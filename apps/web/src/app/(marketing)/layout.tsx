import type { ReactNode } from 'react';
import type { PublishedSiteDocument } from '@taskin/contracts';
import { getSiteDocuments, getSiteSettings, publicSiteFetch } from '@/lib/site-public';
import { asText, siteLinks } from '@/lib/site-utils';
import { PublicSurface } from '@/components/public/PublicSurface';
import { MarketingHeader } from '@/features/marketing/components/MarketingHeader';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import '@/features/marketing/components/marketing.css';
import '@/features/marketing/components/homepage.css';

export const dynamic = 'force-dynamic';

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const [settings, navigation, pages] = await Promise.all([
    getSiteSettings(),
    publicSiteFetch<PublishedSiteDocument>('/navigation'),
    getSiteDocuments('page'),
  ]);
  const data = navigation?.data ?? {};
  // Draft policies retain their existing approval workflow and are not dead public links.
  const available = (value: unknown) =>
    siteLinks(value).filter(
      (link) =>
        !['/terms', '/privacy'].includes(link.href) || pages.some((page) => `/${page.slug}` === link.href),
    );
  const footer = available(data.footer);
  for (const [slug, label] of [
    ['terms', 'شرایط استفاده'],
    ['privacy', 'حریم خصوصی'],
  ] as const) {
    const href = '/' + slug;
    if (pages.some((page) => page.slug === slug) && !footer.some((link) => link.href === href)) {
      footer.push({ href, label });
    }
  }
  return (
    <PublicSurface className="marketing-site">
      <a href="#marketing-main" className="focusable-sr-only">
        رفتن به محتوای اصلی
      </a>
      <MarketingHeader
        links={available(data.header)}
        cta={siteLinks([settings.headerCta ?? settings.primaryCta])[0] ?? null}
        siteName={asText(settings.siteName, 'تسک‌دون')}
        logo={settings.logo}
      />
      <main id="marketing-main" tabIndex={-1}>
        {children}
      </main>
      <MarketingFooter settings={settings} links={footer} social={siteLinks(data.social)} />
    </PublicSurface>
  );
}

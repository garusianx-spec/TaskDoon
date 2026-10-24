import type { ReactNode } from 'react';
import type { PublishedSiteDocument } from '@taskin/contracts';
import { getSiteDocuments, getSiteSettings, publicSiteFetch } from '@/lib/site-public';
import { asText, siteLinks } from '@/lib/site-utils';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import '@/components/marketing/marketing.css';
import '@/components/marketing/homepage.css';
import '@/components/marketing/shell-motion.css';

export const dynamic = 'force-dynamic';

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const [settings, navigation, pages] = await Promise.all([getSiteSettings(), publicSiteFetch<PublishedSiteDocument>('/navigation'), getSiteDocuments('page')]);
  const data = navigation?.data ?? {};
  // Draft policies retain their existing approval workflow and are not dead public links.
  const available = (value: unknown) => siteLinks(value).filter(link => !['/terms', '/privacy'].includes(link.href) || pages.some(page => `/${page.slug}` === link.href));
  return <div className="marketing-site"><a href="#marketing-main" className="focusable-sr-only">رفتن به محتوای اصلی</a><MarketingHeader links={available(data.header)} cta={siteLinks([settings.headerCta ?? settings.primaryCta])[0] ?? null} siteName={asText(settings.siteName, 'تسک‌دون')} logo={settings.logo} /><main id="marketing-main">{children}</main><MarketingFooter settings={settings} links={available(data.footer)} social={siteLinks(data.social)} /></div>;
}

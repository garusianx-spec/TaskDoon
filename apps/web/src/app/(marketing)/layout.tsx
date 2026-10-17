import type { ReactNode } from 'react';
import type { PublishedSiteDocument } from '@taskin/contracts';
import { getSiteSettings, publicSiteFetch } from '@/lib/site-public';
import { asText, siteLinks } from '@/lib/site-utils';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import '@/components/marketing/marketing.css';

export const dynamic = 'force-dynamic';

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const [settings, navigation] = await Promise.all([getSiteSettings(), publicSiteFetch<PublishedSiteDocument>('/navigation')]);
  const data = navigation?.data ?? {};
  return <div className="marketing-site"><a href="#marketing-main" className="focusable-sr-only">رفتن به محتوای اصلی</a><MarketingHeader links={siteLinks(data.header)} cta={siteLinks([settings.primaryCta])[0] ?? null} siteName={asText(settings.siteName, 'تسک‌دون')} logo={settings.logo} /><main id="marketing-main">{children}</main><MarketingFooter settings={settings} links={siteLinks(data.footer)} social={siteLinks(data.social)} /></div>;
}

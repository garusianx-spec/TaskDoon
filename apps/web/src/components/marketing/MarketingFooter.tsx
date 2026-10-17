import { MarketingLogo } from './MarketingLogo';
import type { SiteLink as SiteLinkType } from '@taskin/contracts';
import { asText } from '@/lib/site-utils';
import { SiteLink } from './SiteLink';

export function MarketingFooter({ settings, links, social }: { settings: Record<string, unknown>; links: SiteLinkType[]; social: SiteLinkType[] }) {
  const name = asText(settings.siteName, 'تسک‌دون');
  return <footer className="marketing-footer"><div className="marketing-container">
    <div className="marketing-footer-main"><div className="marketing-footer-brand"><SiteLink href="/" aria-label={name}><MarketingLogo name={name} value={settings.logo} /></SiteLink>{asText(settings.description) && <p>{asText(settings.description)}</p>}
      {asText(settings.contactEmail) && <SiteLink href={`mailto:${asText(settings.contactEmail)}`} className="marketing-footer-email">{asText(settings.contactEmail)}</SiteLink>}
      {asText(settings.contactPhone) && <SiteLink href={`tel:${asText(settings.contactPhone).replace(/\s/g, '')}`} className="marketing-footer-email">{asText(settings.contactPhone)}</SiteLink>}
      {asText(settings.businessAddress) && <p>{asText(settings.businessAddress)}</p>}
    </div><nav aria-label="پیوندهای پایین صفحه" className="marketing-footer-links">{links.map((link, index) => <SiteLink key={`${link.href}-${index}`} href={link.href}>{link.label}</SiteLink>)}</nav></div>
    <div className="marketing-footer-bottom"><p>{asText(settings.copyright, `© ${new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(new Date().getFullYear())} ${name}`)}</p><nav aria-label="شبکه‌های اجتماعی" className="marketing-social">{social.map((link, index) => <SiteLink key={`${link.href}-${index}`} href={link.href}>{link.label}</SiteLink>)}</nav><span className="marketing-footer-locale">فارسی · راست‌به‌چپ</span></div>
  </div></footer>;
}

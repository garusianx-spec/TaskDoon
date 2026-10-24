import { MarketingLogo } from './MarketingLogo';
import type { SiteLink as SiteLinkType } from '@taskin/contracts';
import { asText, siteLinks } from '@/lib/site-utils';
import { SiteLink } from './SiteLink';

export function MarketingFooter({ settings, links, social }: { settings: Record<string, unknown>; links: SiteLinkType[]; social: SiteLinkType[] }) {
  const name = asText(settings.siteName, 'تسک‌دون');
  const cta = siteLinks([settings.primaryCta])[0];
  const resources = links.filter(link => /^\/(blog|faq|help|careers|collaborate|demo-request)/.test(link.href));
  const quick = links.filter(link => !resources.includes(link) && !/^\/(contact|privacy|terms)/.test(link.href));
  const contact = links.filter(link => /^\/(contact|demo-request|help)/.test(link.href));
  const legal = links.filter(link => /^\/(privacy|terms)/.test(link.href));
  return <footer className="marketing-footer home-footer"><div className="home-container">
    <div className="home-footer-top"><div className="marketing-footer-brand"><SiteLink href="/" aria-label={name}><MarketingLogo name={name} value={settings.logo} /></SiteLink>{asText(settings.description) && <p>{asText(settings.description)}</p>}{social.length > 0 && <nav aria-label="شبکه‌های اجتماعی" className="marketing-social">{social.map((link, i) => <SiteLink key={i} href={link.href}>{link.label}</SiteLink>)}</nav>}</div>
    <div className="home-footer-columns">{[{ title: 'ارتباط با ما', items: contact }, { title: 'دسترسی سریع', items: quick }, { title: 'منابع و راهنما', items: resources }].map(group => <nav key={group.title} aria-label={group.title}><h2>{group.title}</h2>{group.items.map((link, i) => <SiteLink key={i} href={link.href}>{link.label}</SiteLink>)}{group.title === 'ارتباط با ما' && <>{asText(settings.contactEmail) && <SiteLink href={`mailto:${asText(settings.contactEmail)}`}>{asText(settings.contactEmail)}</SiteLink>}{asText(settings.contactPhone) && <SiteLink href={`tel:${asText(settings.contactPhone).replace(/\s/g, '')}`}>{asText(settings.contactPhone)}</SiteLink>}{asText(settings.businessAddress) && <p>{asText(settings.businessAddress)}</p>}</>}</nav>)}</div></div>
    {cta && <div className="home-footer-cta"><div><h2>{asText(settings.footerCtaTitle, 'همکاری منظم‌تر را از همین امروز آغاز کنید')}</h2><p>{asText(settings.footerCtaDescription, 'فضای کاری خود را در تسک‌دون ایجاد کنید و مدیریت وظایف و پروژه‌های تیمی را در یک محیط یکپارچه تجربه کنید.')}</p></div><SiteLink href={cta.href} className="marketing-button marketing-button-primary">{cta.label}</SiteLink></div>}
    <div className="home-footer-bottom"><p>{asText(settings.copyright, `© ${new Intl.DateTimeFormat('fa-IR', { year: 'numeric' }).format(new Date())} ${name}. تمامی حقوق محفوظ است.`)}</p>{legal.length > 0 && <nav aria-label="پیوندهای حقوقی">{legal.map((link, i) => <SiteLink key={i} href={link.href}>{link.label}</SiteLink>)}</nav>}</div>
  </div></footer>;
}

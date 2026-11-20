import { ArrowLeftIcon, ShieldIcon } from '@/components/icons';
import { MarketingLogo } from '@/features/marketing/components/MarketingLogo';
import type { SiteLink as SiteLinkType } from '@taskin/contracts';
import { asText, siteLinks } from '@/lib/site-utils';
import { SiteLink } from '@/features/marketing/components/SiteLink';

const ENAMAD_IMAGE_DATA =
  'data:image/png;base64,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';

export function MarketingFooter({
  settings,
  links,
  social,
}: {
  settings: Record<string, unknown>;
  links: SiteLinkType[];
  social: SiteLinkType[];
}) {
  const name = asText(settings.siteName, 'تسک‌دون');
  const cta = siteLinks([settings.primaryCta])[0];
  const resources = links.filter((link) =>
    /^\/(blog|faq|help|careers|collaborate|demo-request)/.test(link.href),
  );
  const quick = links.filter(
    (link) => !resources.includes(link) && !/^\/(contact|privacy|terms)/.test(link.href),
  );
  const contact = links.filter((link) => /^\/(contact|demo-request|help)/.test(link.href));
  const legal = links.filter((link) => /^\/(privacy|terms)/.test(link.href));
  return (
    <footer className="marketing-footer home-footer">
      <div className="home-container">
        <div className="home-footer-top">
          <div className="marketing-footer-brand">
            <SiteLink href="/" aria-label={name}>
              <MarketingLogo name={name} value={settings.logo} />
            </SiteLink>
            {asText(settings.description) && <p>{asText(settings.description)}</p>}
            {social.length > 0 && (
              <nav aria-label="شبکه‌های اجتماعی" className="marketing-social">
                {social.map((link, i) => (
                  <SiteLink key={i} href={link.href}>
                    {link.label}
                  </SiteLink>
                ))}
              </nav>
            )}
            <section aria-label="نمادهای اعتماد و مجوزها" className="enamad-badge-wrapper">
              <a
                href="https://trustseal.enamad.ir/?id=8460779&Code=Mz1009wLpLpP4iuT8MT16KyhWiAeLDSj"
                referrerPolicy="origin"
                target="_blank"
                rel="noopener"
                title="استعلام نماد اعتماد الکترونیکی ۵ ستاره تسک‌دون در سامانه اینماد"
                aria-label="نماد اعتماد الکترونیکی (اینماد) تسک‌دون"
                className="enamad-badge-link"
              >
                <div className="enamad-card">
                  <img
                    src={ENAMAD_IMAGE_DATA}
                    alt="نماد اعتماد الکترونیکی ۵ ستاره تسک‌دون"
                    width={72}
                    height={72}
                    className="object-contain"
                  />
                </div>

                <div className="enamad-info">
                  <div className="enamad-info-title">
                    <ShieldIcon size={16} className="text-blue-400" />
                    <span>نماد اعتماد الکترونیکی</span>
                  </div>
                  <span className="enamad-info-desc">احراز هویت و صلاحیت کسب‌وکار اینترنتی</span>
                  <div className="enamad-info-link">
                    <span>استعلام در سامانه اینماد</span>
                    <ArrowLeftIcon size={12} />
                  </div>
                </div>
              </a>
            </section>
          </div>
          <div className="home-footer-columns">
            {[
              { title: 'ارتباط با ما', items: contact },
              { title: 'دسترسی سریع', items: quick },
              { title: 'منابع و راهنما', items: resources },
            ].map((group) => (
              <nav key={group.title} aria-label={group.title}>
                <h2>{group.title}</h2>
                {group.items.map((link, i) => (
                  <SiteLink key={i} href={link.href}>
                    {link.label}
                  </SiteLink>
                ))}
                {group.title === 'ارتباط با ما' && (
                  <>
                    {asText(settings.contactEmail) && (
                      <SiteLink href={`mailto:${asText(settings.contactEmail)}`}>
                        {asText(settings.contactEmail)}
                      </SiteLink>
                    )}
                    {asText(settings.contactPhone) && (
                      <SiteLink href={`tel:${asText(settings.contactPhone).replace(/\s/g, '')}`}>
                        {asText(settings.contactPhone)}
                      </SiteLink>
                    )}
                    {asText(settings.businessAddress) && <p>{asText(settings.businessAddress)}</p>}
                  </>
                )}
              </nav>
            ))}
          </div>
        </div>
        {cta && (
          <div className="home-footer-cta">
            <div>
              <h2>{asText(settings.footerCtaTitle, 'همکاری منظم‌تر را از همین امروز آغاز کنید')}</h2>
              <p>
                {asText(
                  settings.footerCtaDescription,
                  'فضای کاری خود را در تسک‌دون ایجاد کنید و مدیریت وظایف و پروژه‌های تیمی را در یک محیط یکپارچه تجربه کنید.',
                )}
              </p>
            </div>
            <SiteLink href={cta.href} className="marketing-button marketing-button-primary">
              {cta.label}
            </SiteLink>
          </div>
        )}
        <div className="home-footer-bottom">
          <p>
            {asText(
              settings.copyright,
              `© ${new Intl.DateTimeFormat('fa-IR', { year: 'numeric' }).format(new Date())} ${name}. تمامی حقوق محفوظ است.`,
            )}
          </p>
          {legal.length > 0 && (
            <nav aria-label="پیوندهای حقوقی">
              {legal.map((link, i) => (
                <SiteLink key={i} href={link.href}>
                  {link.label}
                </SiteLink>
              ))}
            </nav>
          )}
        </div>
      </div>
    </footer>
  );
}

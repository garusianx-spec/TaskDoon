import type { SiteLink as SiteLinkType } from '@taskin/contracts';
import { asText, siteLinks } from '@/lib/site-utils';
import { FooterContact } from './FooterContact';
import { FooterLinks } from './FooterLinks';
import { MarketingLogo } from './MarketingLogo';
import { SiteLink } from './SiteLink';
import { TrustBadges } from './TrustBadges';

const resourcePath = /^\/(blog|faq|help|careers|collaborate|demo-request)(?:\/|[?#]|$)/;
const contactPath = /^\/(contact|demo-request|help)(?:\/|[?#]|$)/;
const legalPath = /^\/(privacy|terms)(?:\/|[?#]|$)/;

export function MarketingFooter({
  settings,
  links,
  social,
}: {
  readonly settings: Record<string, unknown>;
  readonly links: readonly SiteLinkType[];
  readonly social: readonly SiteLinkType[];
}) {
  const name = asText(settings.siteName, 'تسک‌دون');
  const description = asText(settings.description);
  const cta = siteLinks([settings.primaryCta])[0];
  const resources = links.filter(({ href }) => resourcePath.test(href));
  const quick = links.filter(
    ({ href }) => !resourcePath.test(href) && !contactPath.test(href) && !legalPath.test(href),
  );
  const configuredContact = links.filter(({ href }) => contactPath.test(href));
  const contact = configuredContact.some(({ href }) => href === '/contact')
    ? configuredContact
    : [{ href: '/contact', label: 'تماس با ما' }, ...configuredContact];
  const legal = links.filter(({ href }) => legalPath.test(href));

  return (
    <footer dir="rtl" className="border-t border-secondary bg-sunken py-8 text-fg-primary lg:py-12">
      <div className="home-container flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col items-start gap-3">
            <SiteLink
              href="/"
              aria-label={name}
              className="inline-flex min-h-11 min-w-11 items-center rounded-md"
            >
              <MarketingLogo name={name} value={settings.logo} />
            </SiteLink>
            {description && <p className="text-body-sm text-fg-secondary">{description}</p>}
            <TrustBadges />
            <FooterLinks title="شبکه‌های اجتماعی" links={social} compact />
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-2">
            <FooterContact settings={settings} links={contact} />
            <FooterLinks title="دسترسی سریع" links={quick} />
            <FooterLinks title="منابع و راهنما" links={resources} />
          </div>
        </div>
        {cta && (
          <div className="flex flex-col items-start gap-4 border-y border-secondary py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-title font-bold">
                {asText(settings.footerCtaTitle, 'همکاری منظم‌تر را از همین امروز آغاز کنید')}
              </h2>
              <p className="mt-1 text-body-sm text-fg-secondary">
                {asText(
                  settings.footerCtaDescription,
                  'فضای کاری خود را در تسک‌دون ایجاد کنید و مدیریت وظایف و پروژه‌های تیمی را در یک محیط یکپارچه تجربه کنید.',
                )}
              </p>
            </div>
            <SiteLink
              href={cta.href}
              className="marketing-button marketing-button-primary min-h-11 max-w-full shrink-0 whitespace-normal text-center"
            >
              {cta.label}
            </SiteLink>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-4 border-t border-secondary pt-3">
          <p className="text-caption text-fg-secondary">
            {asText(
              settings.copyright,
              `© ${new Intl.DateTimeFormat('fa-IR', { year: 'numeric' }).format(new Date())} ${name}. تمامی حقوق محفوظ است.`,
            )}
          </p>
          <FooterLinks title="پیوندهای حقوقی" links={legal} compact />
        </div>
      </div>
    </footer>
  );
}

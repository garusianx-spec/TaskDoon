import type { SiteLink as SiteLinkType } from '@taskin/contracts';
import { asText } from '@/lib/site-utils';
import { FooterLink, FooterLinks } from './FooterLinks';

export function FooterContact({
  settings,
  links,
}: {
  readonly settings: Record<string, unknown>;
  readonly links: readonly SiteLinkType[];
}) {
  const email = asText(settings.contactEmail).trim();
  const phone = asText(settings.contactPhone).trim();
  const address = asText(settings.businessAddress).trim();

  return (
    <section className="min-w-0 max-sm:col-span-2" aria-label="ارتباط با ما">
      <FooterLinks title="ارتباط با ما" links={links} />
      {(email || phone || address) && (
        <address className="flex min-w-0 flex-col items-start not-italic">
          {email && (
            <FooterLink href={`mailto:${email}`}>
              <bdi dir="ltr">{email}</bdi>
            </FooterLink>
          )}
          {phone && (
            <FooterLink href={`tel:${phone.replace(/[\s().-]/g, '')}`}>
              <bdi dir="ltr">{phone}</bdi>
            </FooterLink>
          )}
          {address && <p className="mt-1 text-body-sm text-fg-secondary">{address}</p>}
        </address>
      )}
    </section>
  );
}

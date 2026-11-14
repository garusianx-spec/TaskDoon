import type { ReactNode } from 'react';
import type { SiteLink as SiteLinkType } from '@taskin/contracts';
import { SiteLink } from './SiteLink';

export function FooterLink({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <SiteLink
      href={href}
      className="inline-flex min-h-11 min-w-11 max-w-full items-center rounded-md py-2 text-body-sm text-fg-secondary [overflow-wrap:anywhere] hover:text-fg-primary hover:underline"
    >
      {children}
    </SiteLink>
  );
}

export function FooterLinks({
  title,
  links,
  compact = false,
}: {
  readonly title: string;
  readonly links: readonly SiteLinkType[];
  readonly compact?: boolean;
}) {
  if (!links.length) return null;
  return (
    <nav aria-label={title} className="min-w-0">
      {!compact && <h2 className="text-body-sm font-semibold text-fg-primary">{title}</h2>}
      <ul className={compact ? 'flex flex-wrap gap-x-4' : 'mt-1 flex flex-col'}>
        {links.map(({ href, label }, index) => (
          <li key={`${href}-${index}`} className="min-w-0">
            <FooterLink href={href}>{label}</FooterLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

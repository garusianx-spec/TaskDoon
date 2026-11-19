import type { ReactNode } from 'react';
import type { PublishedSiteDocument } from '@taskin/contracts';
import { asText, siteDate, sitePath } from '@/lib/site-utils';
import { SiteLink } from './SiteLink';

/** A single destination for both the existing image and heading; one keyboard stop. */
export function BlogCard({ document, cover }: { document: PublishedSiteDocument; cover?: ReactNode }) {
  return (
    <article className="marketing-blog-card">
      <SiteLink href={sitePath(document)} className="marketing-blog-card-link" aria-label={document.title}>
        <div className="marketing-blog-card-copy">
          {asText(document.data.category) && (
            <span className="marketing-card-label">{asText(document.data.category)}</span>
          )}
          <h3>{document.title}</h3>
          <p>{document.description}</p>
          <time dateTime={document.publishedAt}>{siteDate(document.publishedAt)}</time>
        </div>
        {cover && <div className="marketing-blog-card-cover">{cover}</div>}
      </SiteLink>
    </article>
  );
}

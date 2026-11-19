import Image from 'next/image';
import type { PublishedSiteDocument, SiteSection, SiteMediaRef, SiteItem } from '@taskin/contracts';
import {
  articleCover,
  asText,
  shouldOptimizeSiteImage,
  siteDate,
  siteMediaHref,
  sitePath,
  sitePublicationDate,
  sortSiteArticles,
} from '@/lib/site-utils';
import { Arrow, SiteLink } from '@/features/marketing/components/SiteLink';
import { BlogArticleGrid } from '@/features/marketing/components/BlogArticleCard';
import { ProductPreview } from '@/features/marketing/components/ProductPreview';
import { FaqList } from '@/features/marketing/components/FaqList';
import { PricingPlans } from '@/features/marketing/components/PricingPlans';
import { LeadForm } from '@/features/marketing/components/LeadForm';
import { HomeSection } from '@/features/marketing/components/HomeSections';

export function MarketingMedia({
  media,
  priority = false,
  framed = false,
}: {
  media: SiteMediaRef;
  priority?: boolean;
  framed?: boolean;
}) {
  if (!siteMediaHref(media.src)) return null;
  const image = (
    <Image
      src={media.src}
      alt={media.alt}
      width={media.width ?? 1440}
      height={media.height ?? 1000}
      sizes="(max-width: 768px) 95vw, 1120px"
      priority={priority}
      unoptimized={!shouldOptimizeSiteImage(media.src)}
      className="marketing-product-image"
    />
  );
  return framed ? (
    <div className="marketing-screen-frame">
      <div className="marketing-screen-toolbar" aria-hidden="true">
        <span />
        <span />
        <span />
        <div>TaskDoon</div>
      </div>
      {image}
    </div>
  ) : (
    image
  );
}

export type RichTextBlock =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'checklist'; items: { text: string; checked: boolean }[] }
  | { kind: 'numbers'; items: string[]; persian: boolean };

const CHECKLIST_MD_RE = /^(?:[-*•▪◦–—]\s+)?\[([ xX])\]\s+(.+)$/;
const CHECKLIST_UNICODE_RE = /^([☐☑✅✓✔])\s+(.+)$/;
const BULLET_RE = /^[-*•▪◦–—]\s+(.+)$/;
const NUMBERED_RE = /^([۰-۹0-9]{1,2})\s*[.)\-–:]\s+(.+)$/;

function matchChecklistLine(line: string): { text: string; checked: boolean } | null {
  const md = CHECKLIST_MD_RE.exec(line);
  if (md) return { text: md[2] ?? '', checked: (md[1] ?? '').toLowerCase() === 'x' };
  const unicode = CHECKLIST_UNICODE_RE.exec(line);
  if (unicode) return { text: unicode[2] ?? '', checked: unicode[1] !== '☐' };
  return null;
}

function isNumberedSubheadingCandidate(line: string): boolean {
  return NUMBERED_RE.test(line) && line.length <= 140 && !line.endsWith('.');
}

export function parseRichTextBlocks(
  text: string,
  defaultHeadingLevel: 'h2' | 'h3' = 'h2',
): RichTextBlock[] {
  const rawParagraphs = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const blocks: RichTextBlock[] = [];
  let sawH2 = false;

  const pushBlock = (block: RichTextBlock) => {
    const prev = blocks[blocks.length - 1];
    if (prev && prev.kind === 'bullets' && block.kind === 'bullets') {
      prev.items.push(...block.items);
      return;
    }
    if (prev && prev.kind === 'checklist' && block.kind === 'checklist') {
      prev.items.push(...block.items);
      return;
    }
    blocks.push(block);
  };

  for (const raw of rawParagraphs) {
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) continue;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!;
      if (line.startsWith('### ')) {
        pushBlock({ kind: 'heading', level: 3, text: line.slice(4) });
        i += 1;
        continue;
      }
      if (line.startsWith('## ')) {
        sawH2 = true;
        pushBlock({ kind: 'heading', level: 2, text: line.slice(3) });
        i += 1;
        continue;
      }

      const firstCheck = matchChecklistLine(line);
      if (firstCheck) {
        const items: { text: string; checked: boolean }[] = [firstCheck];
        i += 1;
        while (i < lines.length) {
          const next = matchChecklistLine(lines[i]!);
          if (!next) break;
          items.push(next);
          i += 1;
        }
        pushBlock({ kind: 'checklist', items });
        continue;
      }

      const firstBullet = BULLET_RE.exec(line);
      if (firstBullet) {
        const items: string[] = [firstBullet[1] ?? ''];
        i += 1;
        while (i < lines.length) {
          if (matchChecklistLine(lines[i]!)) break;
          const next = BULLET_RE.exec(lines[i]!);
          if (!next) break;
          items.push(next[1] ?? '');
          i += 1;
        }
        pushBlock({ kind: 'bullets', items });
        continue;
      }

      const firstNumbered = NUMBERED_RE.exec(line);
      if (firstNumbered) {
        let count = 1;
        while (i + count < lines.length && NUMBERED_RE.test(lines[i + count]!)) {
          count += 1;
        }
        if (count >= 2) {
          const items: string[] = [];
          const persian = /[۰-۹]/.test(firstNumbered[1] ?? '');
          for (let j = 0; j < count; j += 1) {
            const match = NUMBERED_RE.exec(lines[i + j]!);
            items.push(match?.[2] ?? lines[i + j]!);
          }
          pushBlock({ kind: 'numbers', items, persian });
          i += count;
          continue;
        }
        if (isNumberedSubheadingCandidate(line)) {
          const level: 2 | 3 = defaultHeadingLevel === 'h3' || sawH2 ? 3 : 2;
          pushBlock({ kind: 'heading', level, text: line });
          i += 1;
          continue;
        }
      }

      const paraLines: string[] = [line];
      i += 1;
      while (i < lines.length) {
        const nextLine = lines[i]!;
        if (
          nextLine.startsWith('### ') ||
          nextLine.startsWith('## ') ||
          matchChecklistLine(nextLine) ||
          BULLET_RE.test(nextLine) ||
          (NUMBERED_RE.test(nextLine) &&
            (isNumberedSubheadingCandidate(nextLine) ||
              (i + 1 < lines.length && NUMBERED_RE.test(lines[i + 1]!))))
        ) {
          break;
        }
        paraLines.push(nextLine);
        i += 1;
      }
      pushBlock({ kind: 'paragraph', lines: paraLines });
    }
  }

  return blocks;
}

/** A deliberately small text format: React escapes all input; HTML is never interpreted. */
export function RichText({
  text,
  headingLevel = 'h2',
}: {
  text: string;
  headingLevel?: 'h2' | 'h3';
}) {
  const blocks = parseRichTextBlocks(text, headingLevel);
  return (
    <div className="marketing-prose">
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          return block.level === 3 ? <h3 key={index}>{block.text}</h3> : <h2 key={index}>{block.text}</h2>;
        }
        if (block.kind === 'bullets') {
          return (
            <ul key={index}>
              {block.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'checklist') {
          return (
            <ul key={index} className="marketing-prose-checklist">
              {block.items.map((item, i) => (
                <li key={i} className={item.checked ? 'is-checked' : undefined}>
                  <span className="marketing-checklist-box" aria-hidden="true">
                    {item.checked ? '✓' : ''}
                  </span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'numbers') {
          return (
            <ol key={index} className={block.persian ? 'is-persian' : undefined}>
              {block.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={index}>
            {block.lines.map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function SectionHeading({ section }: { section: SiteSection }) {
  if (!section.title && !section.description && !section.subtitle) return null;
  return (
    <div className={`marketing-section-heading ${section.layout === 'center' ? 'is-centered' : ''}`}>
      {section.title && <h2>{section.title}</h2>}
      {section.description && <p className="marketing-section-description">{section.description}</p>}
    </div>
  );
}

function SectionActions({ section }: { section: SiteSection }) {
  return section.cta || section.secondaryCta ? (
    <div className="marketing-actions">
      {section.cta && (
        <SiteLink href={section.cta.href} className="marketing-button marketing-button-primary">
          {section.cta.label}
          <Arrow />
        </SiteLink>
      )}
      {section.secondaryCta && (
        <SiteLink href={section.secondaryCta.href} className="marketing-button marketing-button-secondary">
          {section.secondaryCta.label}
        </SiteLink>
      )}
    </div>
  ) : null;
}

function ItemCards({
  items,
  variant = 'default',
}: {
  items: SiteItem[];
  variant?: 'default' | 'steps' | 'benefits';
}) {
  return (
    <div className={`marketing-card-grid marketing-card-grid-${variant}`}>
      {items.map((item, index) => (
        <article className="marketing-card" key={item.id ?? index}>
          {item.media ? (
            <div className="marketing-card-media">
              <MarketingMedia media={item.media} />
            </div>
          ) : (
            <div className="marketing-card-number" aria-hidden="true">
              {new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2 }).format(index + 1)}
            </div>
          )}
          {item.label && <span className="marketing-card-label">{item.label}</span>}
          <h3>
            {item.href ? (
              <SiteLink href={item.href}>
                {item.title}
                <Arrow />
              </SiteLink>
            ) : (
              item.title
            )}
          </h3>
          {item.description && <p>{item.description}</p>}
        </article>
      ))}
    </div>
  );
}

export function DocumentCards({ documents }: { documents: PublishedSiteDocument[] }) {
  if (documents.length > 0 && documents.every((document) => document.kind === 'article')) {
    return <BlogArticleGrid articles={documents} featuredSingle />;
  }
  return (
    <div className="marketing-card-grid">
      {documents.map((document) => {
        const path = sitePath(document);
        const image =
          articleCover(document.data) ??
          document.sections.find((section) => section.visible && section.media)?.media;
        const publicationDate = sitePublicationDate(document);
        return (
          <article className="marketing-card marketing-document-card" key={document.id}>
            {image && (
              <div className="marketing-card-media">
                <MarketingMedia media={image} />
              </div>
            )}
            {asText(document.data.category) && (
              <span className="marketing-card-label">{asText(document.data.category)}</span>
            )}
            <h3>
              <SiteLink href={path}>
                {document.title}
                <Arrow />
              </SiteLink>
            </h3>
            <p>{document.description}</p>
            {document.kind === 'article' && (
              <time dateTime={publicationDate}>{siteDate(publicationDate)}</time>
            )}
            {document.kind === 'job' && (
              <p className="marketing-job-tags">
                {[asText(document.data.location), asText(document.data.employmentType)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function SectionRenderer({
  section,
  documents = [],
  depth = 0,
  isPrimary = false,
}: {
  section: SiteSection;
  documents?: PublishedSiteDocument[];
  depth?: number;
  isPrimary?: boolean;
}) {
  if (!section.visible || depth > 3) return null;
  if (typeof section.data?.presentation === 'string' && section.data.presentation === `home-${section.type}`)
    return <HomeSection section={section} documents={documents} isPrimary={isPrimary} />;
  const items = section.items ?? [];
  const className = `marketing-section marketing-section-${section.type} marketing-variant-${section.variant ?? 'default'} marketing-layout-${section.layout ?? 'grid'}`;
  const source = asText(section.data?.source);
  const relevant = documents.filter((document) => document.kind === source);
  if (section.type === 'separator')
    return (
      <div className="marketing-container">
        <hr className="marketing-separator" />
      </div>
    );
  if (section.type === 'reusable') {
    const reference = documents.find(
      (document) => document.id === section.referenceId && document.kind === 'reusable',
    );
    return reference ? (
      <>
        {reference.sections.map((block) => (
          <SectionRenderer key={block.id} section={block} documents={documents} depth={depth + 1} />
        ))}
      </>
    ) : null;
  }
  if (section.type === 'hero') {
    const Heading = isPrimary ? 'h1' : 'h2';
    return (
      <section id={section.id} className={`${className} marketing-hero ${section.media ? 'has-media' : ''}`}>
        <div className="marketing-container">
          <div className="marketing-hero-content">
            {section.subtitle && (
              <p className="marketing-eyebrow">
                <span />
                {section.subtitle}
              </p>
            )}
            {section.title && <Heading>{section.title}</Heading>}
            {section.description && <p className="marketing-hero-description">{section.description}</p>}
            <SectionActions section={section} />
          </div>
          {section.media && (
            <div className="marketing-hero-media">
              <MarketingMedia media={section.media} priority={isPrimary} framed />
              <div className="marketing-hero-orbit" aria-hidden="true" />
            </div>
          )}
        </div>
      </section>
    );
  }
  return (
    <section id={section.id} className={className}>
      <div className="marketing-container">
        <SectionHeading section={section} />
        {section.type === 'rich-text' && (
          <RichText text={section.body ?? ''} headingLevel={section.title ? 'h3' : 'h2'} />
        )}
        {section.type === 'feature-grid' &&
          (items.length ? (
            <ItemCards items={items} />
          ) : (
            <DocumentCards documents={documents.filter((document) => document.kind === 'feature')} />
          ))}
        {(section.type === 'benefits' || section.type === 'steps') && (
          <ItemCards items={items} variant={section.type === 'steps' ? 'steps' : 'benefits'} />
        )}
        {section.type === 'image-text' && (
          <div className="marketing-image-text">
            <div>
              {section.body && (
                <RichText text={section.body} headingLevel={section.title ? 'h3' : 'h2'} />
              )}
              <SectionActions section={section} />
            </div>
            {section.media && <MarketingMedia media={section.media} framed />}
          </div>
        )}
        {section.type === 'video' && siteMediaHref(section.data?.videoUrl ?? section.media?.src) && (
          <video
            controls
            preload="metadata"
            className="marketing-video"
            src={asText(section.data?.videoUrl, section.media?.src)}
            poster={siteMediaHref(section.data?.poster) ?? undefined}
            aria-label={section.title ?? 'ویدئوی معرفی محصول'}
          >
            <track
              kind="captions"
              src={siteMediaHref(section.data?.captions) ?? undefined}
              srcLang="fa"
              label="فارسی"
            />
          </video>
        )}
        {section.type === 'statistics' && (
          <dl className="marketing-statistics">
            {items.map((item, index) => (
              <div key={item.id ?? index}>
                <dt>{item.title}</dt>
                <dd>{item.description}</dd>
              </div>
            ))}
          </dl>
        )}
        {section.type === 'product-preview' && <ProductPreview items={items} />}
        {section.type === 'testimonials' && (
          <div className="marketing-card-grid">
            {items.map((item, index) => (
              <figure className="marketing-card marketing-quote" key={item.id ?? index}>
                <blockquote>{item.description}</blockquote>
                <figcaption>
                  {item.title}
                  {item.label && <span>{item.label}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {section.type === 'pricing-preview' && (
          <PricingPlans
            documents={documents.filter((document) => document.kind === 'pricing')}
            comparison={section.data?.comparison === true}
          />
        )}
        {section.type === 'faq' && (
          <FaqList
            documents={documents
              .filter(
                (document) =>
                  document.kind === 'faq' &&
                  (!asText(section.data?.category) || document.data.category === section.data?.category),
              )
              .slice(0, typeof section.data?.limit === 'number' ? section.data.limit : undefined)}
            searchable={section.data?.searchable === true}
          />
        )}
        {section.type === 'logos' && (
          <div className="marketing-logos">
            {items.map((item, index) => (
              <div key={item.id ?? index}>
                {item.media ? <MarketingMedia media={item.media} /> : <span>{item.title}</span>}
              </div>
            ))}
          </div>
        )}
        {section.type === 'content-grid' &&
          (source ? (
            relevant.length ? (
              <DocumentCards documents={source === 'article' ? sortSiteArticles(relevant) : relevant} />
            ) : (
              <p className="marketing-empty">محتوایی در این بخش منتشر نشده است.</p>
            )
          ) : (
            <ItemCards items={items} />
          ))}
        {section.type === 'contact-form' && (
          <div className="marketing-form-panel">
            <LeadForm kind={section.formKind ?? 'contact'} jobId={asText(section.data?.jobId) || undefined} />
          </div>
        )}
        {section.type === 'cta' && (
          <div className="marketing-cta-body">
            {section.body && (
              <RichText text={section.body} headingLevel={section.title ? 'h3' : 'h2'} />
            )}
            <SectionActions section={section} />
          </div>
        )}
        {!['cta', 'image-text', 'hero'].includes(section.type) && <SectionActions section={section} />}
      </div>
    </section>
  );
}

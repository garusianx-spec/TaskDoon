import Image from 'next/image';
import type { PublishedSiteDocument, SiteSection, SiteMediaRef, SiteItem } from '@taskin/contracts';
import { asText, siteDate, siteMediaHref, sitePath } from '@/lib/site-utils';
import { Arrow, SiteLink } from './SiteLink';
import { ProductPreview } from './ProductPreview';
import { FaqList } from './FaqList';
import { PricingPlans } from './PricingPlans';
import { LeadForm } from './LeadForm';

export function MarketingMedia({ media, priority = false, framed = false }: { media: SiteMediaRef; priority?: boolean; framed?: boolean }) {
  if (!siteMediaHref(media.src)) return null;
  const image = <Image src={media.src} alt={media.alt} width={media.width ?? 1440} height={media.height ?? 1000} sizes="(max-width: 768px) 95vw, 1120px" priority={priority} unoptimized={!media.src.startsWith('/')} className="marketing-product-image" />;
  return framed ? <div className="marketing-screen-frame"><div className="marketing-screen-toolbar" aria-hidden="true"><span /><span /><span /><div>TaskDoon</div></div>{image}</div> : image;
}

/** A deliberately small text format: React escapes all input; HTML is never interpreted. */
export function RichText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/);
  return <div className="marketing-prose">{paragraphs.map((paragraph, index) => {
    const value = paragraph.trim();
    if (!value) return null;
    if (value.startsWith('### ')) return <h3 key={index}>{value.slice(4)}</h3>;
    if (value.startsWith('## ')) return <h2 key={index}>{value.slice(3)}</h2>;
    if (value.split('\n').every(line => /^[-*] /.test(line))) return <ul key={index}>{value.split('\n').map((line, i) => <li key={i}>{line.slice(2)}</li>)}</ul>;
    return <p key={index}>{value.split('\n').map((line, i) => <span key={i}>{i > 0 && <br />}{line}</span>)}</p>;
  })}</div>;
}

function SectionHeading({ section }: { section: SiteSection }) {
  if (!section.title && !section.description && !section.subtitle) return null;
  return <div className={`marketing-section-heading ${section.layout === 'center' ? 'is-centered' : ''}`}>
    {section.subtitle && <p className="marketing-eyebrow"><span />{section.subtitle}</p>}
    {section.title && <h2>{section.title}</h2>}
    {section.description && <p className="marketing-section-description">{section.description}</p>}
  </div>;
}

function SectionActions({ section }: { section: SiteSection }) {
  return (section.cta || section.secondaryCta) ? <div className="marketing-actions">
    {section.cta && <SiteLink href={section.cta.href} className="marketing-button marketing-button-primary">{section.cta.label}<Arrow /></SiteLink>}
    {section.secondaryCta && <SiteLink href={section.secondaryCta.href} className="marketing-button marketing-button-secondary">{section.secondaryCta.label}</SiteLink>}
  </div> : null;
}

function ItemCards({ items, variant = 'default' }: { items: SiteItem[]; variant?: 'default' | 'steps' | 'benefits' }) {
  return <div className={`marketing-card-grid marketing-card-grid-${variant}`}>{items.map((item, index) => <article className="marketing-card" key={item.id ?? index}>
    {item.media ? <div className="marketing-card-media"><MarketingMedia media={item.media} /></div> : <div className="marketing-card-number" aria-hidden="true">{new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2 }).format(index + 1)}</div>}
    {item.label && <span className="marketing-card-label">{item.label}</span>}
    <h3>{item.href ? <SiteLink href={item.href}>{item.title}<Arrow /></SiteLink> : item.title}</h3>
    {item.description && <p>{item.description}</p>}
  </article>)}</div>;
}

export function DocumentCards({ documents }: { documents: PublishedSiteDocument[] }) {
  return <div className="marketing-card-grid">{documents.map(document => {
    const path = sitePath(document);
    const media = document.data.cover as SiteMediaRef | undefined;
    const image = media && typeof media.src === 'string' ? media : document.sections.find(section => section.visible && section.media)?.media;
    return <article className="marketing-card marketing-document-card" key={document.id}>
      {image && <div className="marketing-card-media"><MarketingMedia media={image} /></div>}
      {asText(document.data.category) && <span className="marketing-card-label">{asText(document.data.category)}</span>}
      <h3><SiteLink href={path}>{document.title}<Arrow /></SiteLink></h3><p>{document.description}</p>
      {document.kind === 'article' && <time dateTime={document.publishedAt}>{siteDate(document.publishedAt)}</time>}
      {document.kind === 'job' && <p className="marketing-job-tags">{[asText(document.data.location), asText(document.data.employmentType)].filter(Boolean).join(' · ')}</p>}
    </article>;
  })}</div>;
}

export function SectionRenderer({ section, documents = [], depth = 0, isPrimary = false }: { section: SiteSection; documents?: PublishedSiteDocument[]; depth?: number; isPrimary?: boolean }) {
  if (!section.visible || depth > 3) return null;
  const items = section.items ?? [];
  const className = `marketing-section marketing-section-${section.type} marketing-variant-${section.variant ?? 'default'} marketing-layout-${section.layout ?? 'grid'}`;
  const source = asText(section.data?.source);
  const relevant = documents.filter(document => document.kind === source);
  if (section.type === 'separator') return <div className="marketing-container"><hr className="marketing-separator" /></div>;
  if (section.type === 'reusable') {
    const reference = documents.find(document => document.id === section.referenceId && document.kind === 'reusable');
    return reference ? <>{reference.sections.map(block => <SectionRenderer key={block.id} section={block} documents={documents} depth={depth + 1} />)}</> : null;
  }
  if (section.type === 'hero') {
    const Heading = isPrimary ? 'h1' : 'h2';
    return <section id={section.id} className={`${className} marketing-hero ${section.media ? 'has-media' : ''}`}><div className="marketing-container">
      <div className="marketing-hero-content">
        {section.subtitle && <p className="marketing-eyebrow"><span />{section.subtitle}</p>}
        {section.title && <Heading>{section.title}</Heading>}
        {section.description && <p className="marketing-hero-description">{section.description}</p>}
        <SectionActions section={section} />
      </div>
      {section.media && <div className="marketing-hero-media"><MarketingMedia media={section.media} priority={isPrimary} framed /><div className="marketing-hero-orbit" aria-hidden="true" /></div>}
    </div></section>;
  }
  return <section id={section.id} className={className}><div className="marketing-container">
    <SectionHeading section={section} />
    {section.type === 'rich-text' && <RichText text={section.body ?? ''} />}
    {section.type === 'feature-grid' && (items.length ? <ItemCards items={items} /> : <DocumentCards documents={documents.filter(document => document.kind === 'feature')} />)}
    {(section.type === 'benefits' || section.type === 'steps') && <ItemCards items={items} variant={section.type === 'steps' ? 'steps' : 'benefits'} />}
    {section.type === 'image-text' && <div className="marketing-image-text"><div>{section.body && <RichText text={section.body} />}<SectionActions section={section} /></div>{section.media && <MarketingMedia media={section.media} framed />}</div>}
    {section.type === 'video' && siteMediaHref(section.data?.videoUrl ?? section.media?.src) && <video controls preload="metadata" className="marketing-video" src={asText(section.data?.videoUrl, section.media?.src)} poster={siteMediaHref(section.data?.poster) ?? undefined} aria-label={section.title ?? 'ویدئوی معرفی محصول'}><track kind="captions" src={siteMediaHref(section.data?.captions) ?? undefined} srcLang="fa" label="فارسی" /></video>}
    {section.type === 'statistics' && <dl className="marketing-statistics">{items.map((item, index) => <div key={item.id ?? index}><dt>{item.title}</dt><dd>{item.description}</dd></div>)}</dl>}
    {section.type === 'product-preview' && <ProductPreview items={items} />}
    {section.type === 'testimonials' && <div className="marketing-card-grid">{items.map((item, index) => <figure className="marketing-card marketing-quote" key={item.id ?? index}><blockquote>{item.description}</blockquote><figcaption>{item.title}{item.label && <span>{item.label}</span>}</figcaption></figure>)}</div>}
    {section.type === 'pricing-preview' && <PricingPlans documents={documents.filter(document => document.kind === 'pricing')} comparison={section.data?.comparison === true} />}
    {section.type === 'faq' && <FaqList documents={documents.filter(document => document.kind === 'faq' && (!asText(section.data?.category) || document.data.category === section.data?.category)).slice(0, typeof section.data?.limit === 'number' ? section.data.limit : undefined)} searchable={section.data?.searchable === true} />}
    {section.type === 'logos' && <div className="marketing-logos">{items.map((item, index) => <div key={item.id ?? index}>{item.media ? <MarketingMedia media={item.media} /> : <span>{item.title}</span>}</div>)}</div>}
    {section.type === 'content-grid' && (source ? relevant.length ? <DocumentCards documents={relevant} /> : <p className="marketing-empty">محتوایی در این بخش منتشر نشده است.</p> : <ItemCards items={items} />)}
    {section.type === 'contact-form' && <div className="marketing-form-panel"><LeadForm kind={section.formKind ?? 'contact'} jobId={asText(section.data?.jobId) || undefined} /></div>}
    {section.type === 'cta' && <div className="marketing-cta-body">{section.body && <RichText text={section.body} />}<SectionActions section={section} /></div>}
    {!['cta', 'image-text', 'hero'].includes(section.type) && <SectionActions section={section} />}
  </div></section>;
}

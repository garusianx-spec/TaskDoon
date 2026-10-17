import type { PublishedSiteDocument } from '@taskin/contracts';
import { asText, siteDate, siteHref, sitePath } from '@/lib/site-utils';
import { getSiteSettings, safeCanonical, siteOrigin } from '@/lib/site-public';
import { SectionRenderer, DocumentCards, RichText } from './Sections';
import { SiteLink } from './SiteLink';
import { PricingPlans } from './PricingPlans';
import { FaqList } from './FaqList';
import { LeadForm } from './LeadForm';

export async function DocumentPage({ document, documents }: { document: PublishedSiteDocument; documents: PublishedSiteDocument[] }) {
  const settings = await getSiteSettings();
  const origin = siteOrigin(settings);
  const path = sitePath(document) ?? '/';
  const canonical = safeCanonical(document.seo.canonical, origin, path);
  const name = asText(settings.siteName, 'تسک‌دون');
  const sections = document.sections.filter(section => section.visible).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const firstHero = sections.findIndex(section => section.type === 'hero' && Boolean(section.title));
  const has = (type: string) => sections.some(section => section.type === type);
  const crumbs = document.seo.breadcrumbs?.length ? document.seo.breadcrumbs : path === '/' ? [] : [{ label: name, href: '/' }, { label: document.title, href: path }];
  const structured: Record<string, unknown>[] = [];
  if (document.kind === 'page' && document.slug === 'home') structured.push(
    { '@context': 'https://schema.org', '@type': 'Organization', '@id': `${origin}/#organization`, name, url: origin, ...(asText(settings.contactEmail) ? { email: asText(settings.contactEmail) } : {}) },
    { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${origin}/#website`, name, url: origin, inLanguage: 'fa-IR' },
  );
  if (crumbs.length > 0) structured.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.filter(crumb => siteHref(crumb.href)).map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.label, item: new URL(crumb.href, origin).href })) });
  if (document.kind === 'article') structured.push({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: document.title, description: document.description, mainEntityOfPage: canonical, datePublished: document.publishedAt, dateModified: document.updatedAt, inLanguage: 'fa-IR', ...(asText(document.data.author) ? { author: { '@type': 'Person', name: asText(document.data.author) } } : {}), ...(document.seo.ogImage ? { image: new URL(document.seo.ogImage, origin).href } : {}) });
  const sourceKind = document.slug === 'blog' ? 'article' : document.slug === 'help' ? 'help' : document.slug === 'careers' ? 'job' : document.slug === 'features' ? 'feature' : null;
  const sourceDocuments = sourceKind ? documents.filter(item => item.kind === sourceKind) : [];
  const legal = document.kind === 'page' && ['terms', 'privacy'].includes(document.slug);
  return <>
    {structured.map((data, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') }} />)}
    {crumbs.length > 0 && <nav className="marketing-container marketing-breadcrumbs" aria-label="مسیر صفحه"><ol>{crumbs.map((crumb, index) => <li key={index}>{index > 0 && <span aria-hidden="true">/</span>}{index === crumbs.length - 1 ? <span aria-current="page">{crumb.label}</span> : <SiteLink href={crumb.href}>{crumb.label}</SiteLink>}</li>)}</ol></nav>}
    {firstHero < 0 && <header className="marketing-container marketing-page-intro"><p className="marketing-eyebrow"><span />{name}</p><h1>{document.title}</h1>{document.description && <p>{document.description}</p>}</header>}
    {(legal || document.kind === 'article' || document.kind === 'help') && <div className="marketing-container marketing-publication-meta"><time dateTime={document.publishedAt}>{legal ? 'آخرین انتشار: ' : 'منتشرشده در '}{siteDate(document.publishedAt)}</time>{legal && <span>نسخه {new Intl.NumberFormat('fa-IR').format(document.version)}</span>}{asText(document.data.author) && <span>{asText(document.data.author)}</span>}</div>}
    {legal && sections.some(section => section.title && section.type !== 'hero') && <nav className="marketing-container marketing-toc" aria-label="فهرست بخش‌ها">{sections.filter(section => section.title && section.type !== 'hero').map(section => <SiteLink key={section.id} href={`#${section.id}`}>{section.title}</SiteLink>)}</nav>}
    {sections.map((section, index) => <SectionRenderer key={section.id} section={{ ...section, data: { ...(document.kind === 'page' && document.slug === 'faq' ? { searchable: true } : {}), ...(document.kind === 'page' && document.slug === 'pricing' ? { comparison: true } : {}), ...section.data } }} documents={documents} isPrimary={index === firstHero} />)}
    {sourceKind && !(sourceKind === 'feature' ? has('feature-grid') : sections.some(section => section.type === 'content-grid' && section.data?.source === sourceKind)) && <section className="marketing-section"><div className="marketing-container">{sourceDocuments.length ? <DocumentCards documents={sourceDocuments} /> : <p className="marketing-empty">در حال حاضر {sourceKind === 'job' ? 'فرصت شغلی فعالی' : 'محتوایی'} منتشر نشده است.</p>}</div></section>}
    {document.kind === 'page' && document.slug === 'pricing' && !has('pricing-preview') && <section className="marketing-section"><div className="marketing-container"><PricingPlans documents={documents.filter(item => item.kind === 'pricing')} comparison /></div></section>}
    {document.kind === 'page' && document.slug === 'faq' && !has('faq') && <section className="marketing-section"><div className="marketing-container"><FaqList documents={documents.filter(item => item.kind === 'faq')} searchable /></div></section>}
    {document.kind === 'job' && <section className="marketing-section"><div className="marketing-container marketing-job-detail"><div><dl className="marketing-job-attributes">{asText(document.data.location) && <div><dt>محل همکاری</dt><dd>{asText(document.data.location)}</dd></div>}{asText(document.data.employmentType) && <div><dt>نوع همکاری</dt><dd>{asText(document.data.employmentType)}</dd></div>}</dl>{Array.isArray(document.data.requirements) && <><h2>مهارت‌ها و شرایط همکاری</h2><RichText text={document.data.requirements.filter((item): item is string => typeof item === 'string').map(item => `- ${item}`).join('\n')} /></>}</div><div className="marketing-form-panel"><h2>درخواست همکاری</h2><LeadForm kind="application" jobId={document.id} /></div></div></section>}
    {document.kind === 'article' && documents.some(item => item.kind === 'article' && item.id !== document.id) && <section className="marketing-section marketing-variant-subtle"><div className="marketing-container"><div className="marketing-section-heading"><h2>بیشتر بخوانید</h2></div><DocumentCards documents={documents.filter(item => item.kind === 'article' && item.id !== document.id).slice(0, 3)} /></div></section>}
  </>;
}

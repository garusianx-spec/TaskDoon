import type { SiteContent, SiteDocumentKind } from '@taskin/contracts';

export function initialContent(kind: SiteDocumentKind): SiteContent {
  const data: Record<string, unknown> = kind === 'pricing' ? { planId: 'free', currency: 'IRR', features: [], cta: { label: 'شروع رایگان', href: '/login' } } : kind === 'faq' ? { category: 'عمومی', answer: '' } : kind === 'navigation' ? { header: [], footer: [], social: [] } : kind === 'settings' ? { siteName: 'تسک‌دون', description: '', primaryCta: { label: 'شروع رایگان', href: '/login' } } : kind === 'job' ? { employmentType: '', location: '', requirements: [] } : {};
  return { title: '', description: '', sections: [], seo: {}, data };
}

/** Empty optional controls are absent, rather than invalid empty URLs or null prices. */
export function normalizeContent(content: SiteContent): SiteContent {
  const next = structuredClone(content);
  const clean = (value: unknown, key = ''): unknown => {
    if (value === undefined || value === null && ['price', 'yearlyPrice'].includes(key)) return undefined;
    if (typeof value === 'string' && !value.trim() && ['href', 'src', 'url', 'siteUrl', 'contactEmail', 'canonical', 'ogImage', 'twitterImage', 'favicon', 'defaultOgImage', 'referenceId', 'videoUrl'].includes(key)) return undefined;
    if (Array.isArray(value)) return value.map((entry) => clean(entry));
    if (value && typeof value === 'object') {
      const result = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, clean(child, name)]).filter(([, child]) => child !== undefined));
      if (['cta', 'secondaryCta', 'primaryCta'].includes(key) && (!result.href || !result.label)) return undefined;
      if (['media', 'cover', 'logo'].includes(key) && !result.src) return undefined;
      return result;
    }
    return value;
  };
  const result = clean(next) as SiteContent;
  result.seo = Object.fromEntries(Object.entries(result.seo).filter(([, value]) => value !== ''));
  result.sections = result.sections.map((section, sortOrder) => ({ ...section, sortOrder }));
  return result;
}

export function documentPublicPath(kind: SiteDocumentKind, slug: string): string | null {
  if (kind === 'page') return slug === 'home' ? '/' : `/${slug}`;
  if (kind === 'feature') return `/features/${slug}`;
  if (kind === 'article') return `/blog/${slug}`;
  if (kind === 'help') return `/help/${slug}`;
  if (kind === 'job') return `/careers/${slug}`;
  return null;
}

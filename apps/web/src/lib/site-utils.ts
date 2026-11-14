import type { PublishedSiteDocument, SiteLink, SiteMediaRef } from '@taskin/contracts';

/** Editorial links never execute scripts or navigate to protocol-relative origins. */
export function siteHref(value: unknown): string | null {
  if (typeof value !== 'string' || /[\u0000-\u0020\\]/.test(value)) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (value.startsWith('#')) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

export function siteLinks(value: unknown): SiteLink[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SiteLink =>
    Boolean(item && typeof item === 'object' && typeof item.label === 'string' && siteHref(item.href)),
  );
}

/** Images and videos accept web resources only, even in extensible settings.data. */
export function siteMediaHref(value: unknown): string | null {
  const href = siteHref(value);
  return href && (href.startsWith('/') || /^https?:\/\//.test(href)) ? href : null;
}

/** Keep authored query strings out of the image optimizer without changing the media URL. */
export function shouldOptimizeSiteImage(src: string): boolean {
  return src.startsWith('/') && !src.startsWith('//') && !src.includes('?');
}

export function sitePath(document: Pick<PublishedSiteDocument, 'kind' | 'slug'>): string | null {
  const slug = document.slug.split('/').map(encodeURIComponent).join('/');
  switch (document.kind) {
    case 'page':
      return document.slug === 'home' ? '/' : `/${slug}`;
    case 'feature':
      return `/features/${slug}`;
    case 'article':
      return `/blog/${slug}`;
    case 'help':
      return `/help/${slug}`;
    case 'job':
      return `/careers/${slug}`;
    default:
      return null;
  }
}

export function siteDate(value: string): string {
  return new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Tehran',
  }).format(new Date(value));
}

/** The editorial date is a civil day. Existing posts use their first publication timestamp. */
export function sitePublicationDate(
  document: Pick<PublishedSiteDocument, 'kind' | 'data' | 'publishedAt'>,
): string {
  const date = document.data.publicationDate;
  if (document.kind !== 'article' || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return document.publishedAt;
  const parsed = new Date(date);
  return Number.isFinite(+parsed) && parsed.toISOString().startsWith(date) ? date : document.publishedAt;
}

const tehranDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tehran',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Sort article collections by their visible Tehran date, then by first publication. */
export function sortSiteArticles(documents: PublishedSiteDocument[]): PublishedSiteDocument[] {
  return documents
    .map((document) => {
      const date = sitePublicationDate(document);
      return { document, day: date.length === 10 ? date : tehranDay.format(new Date(date)) };
    })
    .sort(
      (a, b) => b.day.localeCompare(a.day) || b.document.publishedAt.localeCompare(a.document.publishedAt),
    )
    .map(({ document }) => document);
}

/** Read optional cover metadata, including an incomplete image while editing. */
export function articleCover(data: Record<string, unknown>, draft = false): SiteMediaRef | undefined {
  const value = data.cover;
  if (typeof value !== 'object' || value === null || !('src' in value) || typeof value.src !== 'string')
    return undefined;
  if (!draft && !siteMediaHref(value.src)) return undefined;
  return {
    src: value.src,
    alt: 'alt' in value ? asText(value.alt) : '',
    ...('width' in value && typeof value.width === 'number' ? { width: value.width } : {}),
    ...('height' in value && typeof value.height === 'number' ? { height: value.height } : {}),
  };
}

export function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

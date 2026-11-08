import type { PublishedSiteDocument, SiteLink } from '@taskin/contracts';

/** Editorial links never execute scripts or navigate to protocol-relative origins. */
export function siteHref(value: unknown): string | null {
  if (typeof value !== 'string' || /[\u0000-\u0020\\]/.test(value)) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (value.startsWith('#')) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ? value : null;
  } catch { return null; }
}

export function siteLinks(value: unknown): SiteLink[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SiteLink => Boolean(item && typeof item === 'object' && typeof item.label === 'string' && siteHref(item.href)));
}

/** Images and videos accept web resources only, even in extensible settings.data. */
export function siteMediaHref(value: unknown): string | null {
  const href = siteHref(value);
  return href && (href.startsWith('/') || /^https?:\/\//.test(href)) ? href : null;
}

export function sitePath(document: Pick<PublishedSiteDocument, 'kind' | 'slug'>): string | null {
  const slug = document.slug.split('/').map(encodeURIComponent).join('/');
  switch (document.kind) {
    case 'page': return document.slug === 'home' ? '/' : `/${slug}`;
    case 'feature': return `/features/${slug}`;
    case 'article': return `/blog/${slug}`;
    case 'help': return `/help/${slug}`;
    case 'job': return `/careers/${slug}`;
    default: return null;
  }
}

export function siteDate(value: string): string {
  return new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tehran' }).format(new Date(value));
}

export function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

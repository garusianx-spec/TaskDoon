import 'server-only';
import { cache } from 'react';
import type { Metadata } from 'next';
import type { PublishedSiteDocument, SiteDocumentKind } from '@taskin/contracts';
import { asText, siteHref, sitePath } from './site-utils';

const apiOrigin = process.env.TASKIN_API_ORIGIN ?? 'http://localhost:4000';

/** No-store is intentional: draft edits never leak and published edits require no rebuild. */
export const publicSiteFetch = cache(async <T,>(path: string): Promise<T | null> => {
  const response = await fetch(`${apiOrigin}/api/v1/public/site${path}`, {
    cache: 'no-store', signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('محتوای وب‌سایت موقتاً در دسترس نیست. لطفاً دوباره تلاش کنید.');
  // Nest/Express may serialize a missing nullable lookup as an empty 200 response.
  const body = await response.text();
  return body.trim() ? JSON.parse(body) as T : null;
});

export async function getSiteDocuments(kind?: SiteDocumentKind): Promise<PublishedSiteDocument[]> {
  return await publicSiteFetch<PublishedSiteDocument[]>(`/documents${kind ? `?kind=${kind}` : ''}`) ?? [];
}

export async function getSitePage(slug: string): Promise<PublishedSiteDocument | null> {
  return publicSiteFetch<PublishedSiteDocument>(`/pages/${encodeURIComponent(slug)}`);
}

export async function getSiteDocument(kind: SiteDocumentKind, slug: string): Promise<PublishedSiteDocument | null> {
  return publicSiteFetch<PublishedSiteDocument>(`/documents/${kind}/${encodeURIComponent(slug)}`);
}

export const getSiteSettings = cache(async () => {
  const document = await publicSiteFetch<PublishedSiteDocument>('/settings');
  return document?.data ?? {};
});

export function siteOrigin(settings: Record<string, unknown>): string {
  const candidate = process.env.SITE_URL || asText(settings.siteUrl) || 'http://localhost:3000';
  try {
    const url = new URL(candidate);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('invalid site origin');
    return url.origin;
  } catch { return 'http://localhost:3000'; }
}

export async function siteMetadata(document: PublishedSiteDocument | null): Promise<Metadata> {
  if (!document) return { title: 'صفحه پیدا نشد', robots: { index: false, follow: false } };
  const settings = await getSiteSettings();
  const origin = siteOrigin(settings);
  const path = sitePath(document) ?? '/';
  const canonical = safeCanonical(document.seo.canonical, origin, path);
  const title = document.seo.title || document.title;
  const description = document.seo.description || document.description;
  const image = document.seo.ogImage || asText(settings.defaultOgImage);
  const twitterImage = document.seo.twitterImage || image;
  const verification = asText(settings.searchConsoleVerification);
  const favicon = siteHref(settings.favicon);
  return {
    metadataBase: new URL(origin), title: { absolute: title }, description,
    ...(/^[A-Za-z0-9_-]{10,200}$/.test(verification) ? { verification: { google: verification } } : {}),
    ...(favicon ? { icons: { icon: favicon } } : {}),
    alternates: { canonical }, robots: { index: !document.seo.noIndex, follow: true },
    openGraph: {
      type: document.kind === 'article' ? 'article' : 'website', locale: 'fa_IR',
      siteName: asText(settings.siteName, 'تسک‌دون'), url: canonical,
      title: document.seo.ogTitle || title, description: document.seo.ogDescription || description,
      ...(image ? { images: [{ url: image, alt: document.title }] } : {}),
      ...(document.kind === 'article' ? { publishedTime: document.publishedAt, modifiedTime: document.updatedAt } : {}),
    },
    twitter: {
      card: twitterImage ? 'summary_large_image' : 'summary', title: document.seo.twitterTitle || title,
      description: document.seo.twitterDescription || description,
      ...(twitterImage ? { images: [twitterImage] } : {}),
    },
  };
}

export function safeCanonical(value: unknown, origin: string, path: string): string {
  if (typeof value === 'string') {
    try {
      const url = new URL(value, origin);
      if (url.origin === origin && !url.search && !url.hash) return url.href;
    } catch { /* Fall back to the document's public URL. */ }
  }
  return new URL(path, origin).href;
}

import type { MetadataRoute } from 'next';
import { getSiteDocuments, getSiteSettings, safeCanonical, siteOrigin } from '@/lib/site-public';
import { sitePath } from '@/lib/site-utils';

export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [settings, documents] = await Promise.all([getSiteSettings(), getSiteDocuments()]);
  const origin = siteOrigin(settings);
  const unique = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const document of documents) {
    const path = sitePath(document);
    if (!path || document.seo.noIndex) continue;
    const url = new URL(path, origin).href;
    if (safeCanonical(document.seo.canonical, origin, path) !== url) continue;
    unique.set(url, { url, lastModified: document.updatedAt });
  }
  return [...unique.values()];
}

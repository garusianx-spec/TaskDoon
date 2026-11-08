import type { MetadataRoute } from 'next';
import { getSiteSettings, siteOrigin } from '@/lib/site-public';

export const dynamic = 'force-dynamic';
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = siteOrigin(await getSiteSettings());
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/feed', '/tasks', '/chats', '/notes', '/calendar', '/directory', '/settings', '/more', '/invite', '/signed-out', '/reset-password'] }], sitemap: `${origin}/sitemap.xml` };
}

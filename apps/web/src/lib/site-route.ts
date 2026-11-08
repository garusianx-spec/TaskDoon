import 'server-only';
import { notFound, permanentRedirect } from 'next/navigation';
import type { SiteDocumentKind, SiteRedirect } from '@taskin/contracts';
import { getSiteDocument, getSitePage, publicSiteFetch } from './site-public';
import { siteHref } from './site-utils';

export async function resolveSiteDocument(kind: SiteDocumentKind, slug: string) {
  // The generic CMS route cannot claim any part of the private application's namespace.
  if (kind === 'page' && /^(admin|api|feed|tasks|chats|notes|calendar|directory|settings|more|invite|signed-out|reset-password)(\/|$)/.test(slug)) notFound();
  const document = kind === 'page' ? await getSitePage(slug) : await getSiteDocument(kind, slug);
  if (document) return document;
  const prefix = { feature: 'features', article: 'blog', help: 'help', job: 'careers' }[kind as 'feature' | 'article' | 'help' | 'job'];
  const path = kind === 'page' ? slug === 'home' ? '/' : `/${slug}` : `/${prefix}/${slug}`;
  const redirect = await publicSiteFetch<SiteRedirect>(`/redirects?fromPath=${encodeURIComponent(path)}`);
  if (redirect && redirect.toPath !== path && siteHref(redirect.toPath)?.startsWith('/')) permanentRedirect(redirect.toPath);
  notFound();
}

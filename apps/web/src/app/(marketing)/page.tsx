import { resolveSiteDocument } from '@/lib/site-route';
import { getSiteDocuments, getSitePage, siteMetadata } from '@/lib/site-public';
import { DocumentPage } from '@/components/marketing/DocumentPage';
import { TASKDOON_HOME_SECTIONS } from '@taskin/contracts';
import type { PublishedSiteDocument } from '@taskin/contracts';

export async function generateMetadata() { return siteMetadata(await getSitePage('home')); }

const defaultHomeDoc: PublishedSiteDocument = {
  id: 'home',
  kind: 'page',
  slug: 'home',
  title: 'تسک‌دون',
  description: 'مدیریت هوشمند وظایف، پیشبرد منظم پروژه‌ها',
  sections: TASKDOON_HOME_SECTIONS,
  seo: { title: 'تسک‌دون | مدیریت وظایف و پروژه‌ها', description: 'مدیریت هوشمند وظایف و پروژه‌ها' },
  data: {},
  version: 1,
  publishedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export default async function Homepage() {
  const [fetchedDoc, documents] = await Promise.all([
    resolveSiteDocument('page', 'home').catch(() => null),
    getSiteDocuments().catch(() => []),
  ]);
  const document = fetchedDoc ?? defaultHomeDoc;
  return <DocumentPage document={document} documents={documents} />;
}

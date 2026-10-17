import { resolveSiteDocument } from '@/lib/site-route';
import { getSiteDocuments, getSitePage, siteMetadata } from '@/lib/site-public';
import { DocumentPage } from '@/components/marketing/DocumentPage';

export async function generateMetadata() { return siteMetadata(await getSitePage('home')); }
export default async function Homepage() {
  const [document, documents] = await Promise.all([resolveSiteDocument('page', 'home'), getSiteDocuments()]);
  return <DocumentPage document={document} documents={documents} />;
}

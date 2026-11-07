import { resolveSiteDocument } from '@/lib/site-route';
import { getSiteDocuments, getSitePage, siteMetadata } from '@/lib/site-public';
import { DocumentPage } from '@/components/marketing/DocumentPage';

type Props = { params: Promise<{ slug: string[] }> };
export async function generateMetadata({ params }: Props) { return siteMetadata(await getSitePage((await params).slug.join('/'))); }
export default async function MarketingPage({ params }: Props) {
  const [document, documents] = await Promise.all([resolveSiteDocument('page', (await params).slug.join('/')), getSiteDocuments()]);
  return <DocumentPage document={document} documents={documents} />;
}

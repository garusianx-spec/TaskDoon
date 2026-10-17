import { resolveSiteDocument } from '@/lib/site-route';
import { getSiteDocuments, getSiteDocument, siteMetadata } from '@/lib/site-public';
import { DocumentPage } from '@/components/marketing/DocumentPage';

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) { return siteMetadata(await getSiteDocument('job', (await params).slug)); }
export default async function JobPage({ params }: Props) {
  const [document, documents] = await Promise.all([resolveSiteDocument('job', (await params).slug), getSiteDocuments()]);
  return <DocumentPage document={document} documents={documents} />;
}

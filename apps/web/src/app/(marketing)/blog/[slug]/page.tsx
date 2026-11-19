import { resolveSiteDocument } from '@/lib/site-route';
import { getSiteDocuments, getSiteDocument, siteMetadata } from '@/lib/site-public';
import { DocumentPage } from '@/features/marketing/components/DocumentPage';

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  return siteMetadata(await getSiteDocument('article', (await params).slug));
}
export default async function ArticlePage({ params }: Props) {
  const [document, documents] = await Promise.all([
    resolveSiteDocument('article', (await params).slug),
    getSiteDocuments(),
  ]);
  return (
    <article className="marketing-article-detail">
      <DocumentPage document={document} documents={documents} />
    </article>
  );
}

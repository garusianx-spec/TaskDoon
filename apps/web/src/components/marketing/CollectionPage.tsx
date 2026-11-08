import type { PublishedSiteDocument } from '@taskin/contracts';
import { getSiteDocuments, getSitePage } from '@/lib/site-public';
import { DocumentPage } from './DocumentPage';
import { DocumentCards } from './Sections';

/** Published collection documents remain optional; an empty collection is a valid page. */
export async function CollectionPage({ slug, kind, title }: { slug: string; kind: 'article' | 'help'; title: string }) {
  const [document, documents] = await Promise.all([getSitePage(slug), getSiteDocuments()]);
  if (document) return <DocumentPage document={document} documents={documents} />;
  const entries: PublishedSiteDocument[] = documents.filter(entry => entry.kind === kind);
  return <><header className="marketing-container marketing-page-intro"><h1>{title}</h1></header><section className="marketing-section"><div className="marketing-container">{entries.length ? <DocumentCards documents={entries} /> : <p className="marketing-empty">هنوز محتوایی در این بخش منتشر نشده است.</p>}</div></section></>;
}

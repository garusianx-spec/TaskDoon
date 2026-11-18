import type { PublishedSiteDocument } from '@taskin/contracts';
import { sortSiteArticles } from '@/lib/site-utils';
import { getSiteDocuments, getSitePage } from '@/lib/site-public';
import { BlogArticleGrid } from '@/features/marketing/components/BlogArticleCard';
import { DocumentPage } from '@/features/marketing/components/DocumentPage';
import { DocumentCards } from '@/features/marketing/components/Sections';

/** Published collection documents remain optional; an empty collection is a valid page. */
export async function CollectionPage({
  slug,
  kind,
  title,
}: {
  slug: string;
  kind: 'article' | 'help';
  title: string;
}) {
  const [document, documents] = await Promise.all([getSitePage(slug), getSiteDocuments()]);
  if (document) return <DocumentPage document={document} documents={documents} />;
  const entries: PublishedSiteDocument[] = documents.filter((entry) => entry.kind === kind);
  const isBlog = kind === 'article';
  return (
    <>
      <header
        className={`marketing-container marketing-page-intro${isBlog ? ' marketing-blog-index-intro' : ''}`}
      >
        <h1>{title}</h1>
      </header>
      <section className={`marketing-section${isBlog ? ' marketing-blog-index-section' : ''}`}>
        <div className="marketing-container">
          {entries.length ? (
            isBlog ? (
              <BlogArticleGrid articles={sortSiteArticles(entries)} featuredSingle />
            ) : (
              <DocumentCards documents={entries} />
            )
          ) : (
            <p className="marketing-empty">هنوز محتوایی در این بخش منتشر نشده است.</p>
          )}
        </div>
      </section>
    </>
  );
}

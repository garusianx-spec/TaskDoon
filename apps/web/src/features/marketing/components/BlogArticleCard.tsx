import Image from 'next/image';
import type { PublishedSiteDocument } from '@taskin/contracts';
import {
  articleCover,
  asText,
  shouldOptimizeSiteImage,
  siteDate,
  sitePath,
  sitePublicationDate,
} from '@/lib/site-utils';
import { ArrowLeftIcon } from '@/components/icons';
import { SiteLink } from '@/features/marketing/components/SiteLink';

export function BlogArticleCard({
  article,
  featured = false,
}: {
  article: PublishedSiteDocument;
  featured?: boolean;
}) {
  const path = sitePath(article);
  const cover = articleCover(article.data);
  const publicationDate = sitePublicationDate(article);
  const category = asText(article.data.category);
  const author = asText(article.data.author);
  const titleId = `blog-card-title-${article.id}`;
  const metaParts = [category, author].filter(Boolean);

  return (
    <article className={`blog-card${featured ? ' is-featured' : ''}${cover ? ' has-media' : ''}`}>
      <SiteLink href={path} className="blog-card-link" aria-labelledby={titleId}>
        <h3 id={titleId} className="blog-card-title">
          <span>{article.title}</span>
          <ArrowLeftIcon size={18} className="blog-card-arrow" />
        </h3>
        {cover && (
          <div className="blog-card-media">
            <Image
              src={cover.src}
              alt={cover.alt}
              width={cover.width ?? 1440}
              height={cover.height ?? 960}
              sizes={
                featured
                  ? '(max-width: 800px) 94vw, 560px'
                  : '(max-width: 760px) 94vw, (max-width: 1024px) 46vw, 360px'
              }
              unoptimized={!shouldOptimizeSiteImage(cover.src)}
              className="blog-card-image"
            />
          </div>
        )}
      </SiteLink>
      <div className="blog-card-meta">
        <time dateTime={publicationDate}>{siteDate(publicationDate)}</time>
        {metaParts.map((part, index) => (
          <span key={index} className="blog-card-meta-item">
            <span aria-hidden="true">·</span>
            <span>{part}</span>
          </span>
        ))}
      </div>
      {article.description && <p className="blog-card-excerpt">{article.description}</p>}
    </article>
  );
}

export function BlogArticleGrid({
  articles,
  featuredSingle = false,
}: {
  articles: PublishedSiteDocument[];
  featuredSingle?: boolean;
}) {
  const countVariant =
    articles.length === 1 && featuredSingle ? 'single' : articles.length === 2 ? 'double' : 'multi';

  return (
    <div className={`blog-grid blog-grid-${countVariant}`}>
      {articles.map((article) => (
        <BlogArticleCard
          key={article.id}
          article={article}
          featured={articles.length === 1 && featuredSingle}
        />
      ))}
    </div>
  );
}

import Image from 'next/image';
import type { ReactNode } from 'react';
import type { PublishedSiteDocument, SiteMediaRef, SiteSection } from '@taskin/contracts';
import { asText, shouldOptimizeSiteImage, siteDate, siteMediaHref, sitePath } from '@/lib/site-utils';
import { ArrowLeftIcon, ShieldIcon, PeopleIcon, CalendarIcon } from '@/components/icons';
import { SiteLink } from '@/features/marketing/components/SiteLink';
import { FaqList } from '@/features/marketing/components/FaqList';
import { PricingPlans } from '@/features/marketing/components/PricingPlans';
import { ProductJourney } from '@/features/marketing/components/ProductJourney';
import { WorkspacePreview } from '@/features/marketing/components/WorkspacePreview';
import { BlogCard } from './BlogCard';

const FEATURE_PREVIEWS = new Map([
  ['tasks', '/marketing/tasks.png'],
  ['chat', '/marketing/chat.png'],
  ['notes', '/marketing/notes.png'],
  ['calendar', '/marketing/calendar.png'],
]);

function Media({ media, priority = false }: { media: SiteMediaRef; priority?: boolean }) {
  return siteMediaHref(media.src) ? (
    <Image
      src={media.src}
      alt={media.alt}
      width={media.width ?? 1440}
      height={media.height ?? 960}
      sizes="(max-width: 768px) 94vw, 1160px"
      preload={priority}
      unoptimized={!shouldOptimizeSiteImage(media.src)}
    />
  ) : null;
}
function Actions({ section }: { section: SiteSection }) {
  return (
    <div className="marketing-actions home-actions">
      {section.cta && (
        <SiteLink href={section.cta.href} className="marketing-button marketing-button-primary">
          {section.cta.label}
          <ArrowLeftIcon size={18} />
        </SiteLink>
      )}
      {section.secondaryCta && (
        <SiteLink href={section.secondaryCta.href} className="marketing-button marketing-button-secondary">
          {section.secondaryCta.label}
        </SiteLink>
      )}
    </div>
  );
}
function Heading({ section, hero = false }: { section: SiteSection; hero?: boolean }) {
  const Tag = hero ? 'h1' : 'h2';
  return (
    <div className="home-heading">
      <Tag>{section.title}</Tag>
      {section.description && <p>{section.description}</p>}
    </div>
  );
}

function Trust() {
  return (
    <div className="home-trust">
      <div>
        <h2>همکاری، با دسترسی‌های روشن</h2>
        <p>عضویت، مسئولیت و دسترسی در همان فضایی تعریف می‌شوند که کار اتفاق می‌افتد.</p>
        <SiteLink href="/security">
          آشنایی با امنیت و دسترسی‌ها
          <ArrowLeftIcon size={18} />
        </SiteLink>
      </div>
      <ul>
        <li>
          <ShieldIcon size={22} />
          <span>
            <strong>ورود با تأیید شماره موبایل</strong>کد یک‌بارمصرف و امکان مدیریت نشست‌های حساب
          </span>
        </li>
        <li>
          <PeopleIcon size={22} />
          <span>
            <strong>نقش‌های مشخص برای اعضا</strong>کنترل دسترسی در سطح فضای کاری
          </span>
        </li>
        <li>
          <CalendarIcon size={22} />
          <span>
            <strong>فارسی، در جریان روزانهٔ کار</strong>رابط راست‌به‌چپ و تقویم هجری شمسی
          </span>
        </li>
      </ul>
    </div>
  );
}

/** Published sections keep their IDs, content, visibility and ordering. Sample proof is never promoted. */
export function HomeSection({
  section,
  documents,
  isPrimary,
}: {
  section: SiteSection;
  documents: PublishedSiteDocument[];
  isPrimary: boolean;
}) {
  const items = section.items ?? [];
  const wrap = (children: ReactNode, className = '') => (
    <section id={section.id} className={`home-section home-${section.type} ${className}`}>
      <div className="home-container">{children}</div>
    </section>
  );
  if (section.type === 'hero')
    return (
      <section id={section.id} className="home-hero">
        <div className="home-container">
          <div className="home-hero-copy">
            <Heading section={section} hero={isPrimary} />
            <Actions section={section} />
          </div>
          {section.media ? (
            <div className="home-authored-hero-media">
              <Media media={section.media} priority={isPrimary} />
            </div>
          ) : (
            <WorkspacePreview />
          )}
        </div>
      </section>
    );
  if (section.type === 'steps' && section.data?.workflow === 'message-to-task')
    return wrap(
      <>
        <Heading section={section} />
        <ProductJourney />
      </>,
      'home-workflow',
    );
  if (section.type === 'benefits' || section.type === 'steps')
    return wrap(
      <>
        <Heading section={section} />
        <div className={`home-outcomes ${section.type === 'steps' ? 'home-start-steps' : ''}`}>
          {items.map((item, index) => (
            <article key={item.id ?? index}>
              {section.type === 'steps' && (
                <span className="home-step-number">{new Intl.NumberFormat('fa-IR').format(index + 1)}</span>
              )}
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </>,
    );
  if (section.type === 'feature-grid')
    return wrap(
      <>
        <Heading section={section} />
        <div className="home-capabilities">
          {items.map((item, index) => {
            const fallback = FEATURE_PREVIEWS.get(item.id ?? '');
            const media =
              item.media ??
              (fallback && {
                src: fallback,
                alt: `${item.title} در محیط تسک‌دون، با دادهٔ نمونه`,
                width: 1440,
                height: 960,
              });
            return (
              <article key={item.id ?? index}>
                <div className="home-capability-copy">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  {item.href && (
                    <SiteLink href={item.href}>
                      بررسی این قابلیت
                      <ArrowLeftIcon size={18} />
                    </SiteLink>
                  )}
                </div>
                {media && (
                  <div className="home-capability-media">
                    <Media media={media} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </>,
    );
  if (section.type === 'image-text' && section.data?.workflow === 'message-to-task')
    return wrap(
      <>
        <Heading section={section} />
        <ProductJourney />
      </>,
      'home-workflow',
    );
  if (section.type === 'product-preview')
    return wrap(
      <>
        <Heading section={section} />
        <WorkspacePreview />
      </>,
    );
  if (section.type === 'video') {
    const video = siteMediaHref(section.data?.videoUrl);
    if (!video)
      return wrap(
        <>
          <Heading section={section} />
          <ProductJourney />
        </>,
        'home-workflow',
      );
    return wrap(
      <>
        <Heading section={section} />
        <video
          className="marketing-video"
          controls
          preload="metadata"
          src={video}
          aria-label={section.title ?? 'معرفی تسک‌دون'}
        >
          <track
            kind="captions"
            src={siteMediaHref(section.data?.captions) ?? undefined}
            srcLang="fa"
            label="فارسی"
          />
        </video>
      </>,
    );
  }
  if (section.type === 'logos')
    return items.length
      ? wrap(
          <div className="marketing-logos">
            {items.map((item, index) => (
              <div key={item.id ?? index}>{item.media ? <Media media={item.media} /> : item.title}</div>
            ))}
          </div>,
        )
      : null;
  if (section.type === 'testimonials')
    return section.data?.sampleContent === true
      ? wrap(<Trust />, 'home-trust-section')
      : items.length
        ? wrap(
            <>
              <Heading section={section} />
              <div className="home-published-quotes">
                {items.map((item, index) => (
                  <figure key={item.id ?? index}>
                    <blockquote>{item.description}</blockquote>
                    <figcaption>
                      {item.title}
                      {item.label && <span>{item.label}</span>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>,
          )
        : wrap(<Trust />, 'home-trust-section');
  if (section.type === 'pricing-preview')
    return wrap(
      <>
        <div className="home-section-title-row">
          <Heading section={section} />
          <SiteLink className="home-text-link" href="/pricing">
            مقایسهٔ طرح‌ها
            <ArrowLeftIcon size={18} />
          </SiteLink>
        </div>
        <PricingPlans documents={documents.filter((document) => document.kind === 'pricing')} />
      </>,
    );
  if (section.type === 'faq')
    return wrap(
      <div className="home-faq-layout">
        <div>
          <Heading section={section} />
          <p className="home-faq-contact">
            پاسخ دیگری لازم دارید؟ <SiteLink href="/contact">پرسش خود را بپرسید</SiteLink>
          </p>
        </div>
        <FaqList
          documents={documents
            .filter(
              (document) =>
                document.kind === 'faq' &&
                (!asText(section.data?.category) || document.data.category === section.data?.category),
            )
            .slice(0, typeof section.data?.limit === 'number' ? section.data.limit : 6)}
        />
      </div>,
    );
  if (section.type === 'content-grid') {
    const source = asText(section.data?.source, 'article');
    const articles = documents
      .filter((document) => document.kind === source)
      .slice(0, typeof section.data?.limit === 'number' ? section.data.limit : 3);
    return wrap(
      <>
        <div className="home-section-title-row">
          <Heading section={section} />
          <Actions section={section} />
        </div>
        <div className="home-articles">
          {articles.map((article) =>
            article.kind === 'article' ? (
              <BlogCard
                key={article.id}
                document={article}
                cover={
                  article.data.cover && typeof article.data.cover === 'object' ? (
                    <Media media={article.data.cover as SiteMediaRef} />
                  ) : undefined
                }
              />
            ) : (
              <article key={article.id}>
                {Boolean(article.data.cover) && typeof article.data.cover === 'object' && (
                  <div className="home-article-cover">
                    <Media media={article.data.cover as SiteMediaRef} />
                  </div>
                )}
                <time dateTime={article.publishedAt}>{siteDate(article.publishedAt)}</time>
                <h3>
                  <SiteLink href={sitePath(article)}>
                    {article.title}
                    <ArrowLeftIcon size={18} />
                  </SiteLink>
                </h3>
                <p>{article.description}</p>
              </article>
            ),
          )}
        </div>
        {!articles.length && (
          <div className="home-editorial-empty">
            <h3>نوشته‌های تازه، پس از انتشار اینجا هستند</h3>
            <p>در این بخش فقط محتوای منتشرشدهٔ تیم تسک‌دون نمایش داده می‌شود.</p>
            <SiteLink href="/features">
              تا آن زمان، امکانات محصول را بشناسید
              <ArrowLeftIcon size={17} />
            </SiteLink>
          </div>
        )}
      </>,
    );
  }
  if (section.type === 'cta')
    return wrap(
      <div className="home-closing">
        <Heading section={section} />
        <Actions section={section} />
      </div>,
    );
  return null;
}

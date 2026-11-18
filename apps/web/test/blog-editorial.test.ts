import type { PublishedSiteDocument } from '@taskin/contracts';
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    createElement('a', { href, ...rest }, children),
}));

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: ImgHTMLAttributes<HTMLImageElement> & { preload?: boolean; unoptimized?: boolean }) =>
    createElement('img', { src, alt, width, height, className }),
}));

vi.mock('@/lib/site-public', () => ({
  getSitePage: vi.fn(async () => null),
  getSiteSettings: vi.fn(async () => ({ siteName: 'تسک‌دون', siteUrl: 'https://taskdoone.ir' })),
  siteOrigin: () => 'https://taskdoone.ir',
  safeCanonical: (value: unknown, origin: string, path: string) =>
    typeof value === 'string' ? value : `${origin}${path}`,
  siteMetadata: vi.fn(async (doc: PublishedSiteDocument | null) => ({
    title: { absolute: doc?.seo.title || doc?.title || 'صفحه پیدا نشد' },
  })),
}));

import { generateMetadata as generateBlogMetadata } from '@/app/(marketing)/blog/page';
import { BlogArticleGrid } from '@/features/marketing/components/BlogArticleCard';
import { DocumentPage } from '@/features/marketing/components/DocumentPage';
import { parseRichTextBlocks, RichText } from '@/features/marketing/components/Sections';

function makeArticle(
  overrides: Partial<PublishedSiteDocument> & { id: string; slug: string; title: string },
): PublishedSiteDocument {
  return {
    description: 'توضیح کوتاه برای تبدیل تصمیم‌های جلسه به کارهای قابل پیگیری در تیم.',
    kind: 'article',
    seo: {},
    data: {
      author: 'تحریریه تسک‌دون',
      category: 'مدیریت کار',
      publicationDate: '2026-04-01',
      cover: {
        src: '/marketing/tasks.png',
        alt: 'فهرست وظایف در تسک‌دون',
        width: 1440,
        height: 960,
      },
    },
    sections: [
      {
        id: 'body',
        type: 'rich-text',
        visible: true,
        sortOrder: 0,
        body: [
          'در بسیاری از جلسه‌ها تصمیم‌های مهمی گرفته می‌شود اما پیگیری روشنی ثبت نمی‌شود.',
          '۱. چرا تصمیم‌های جلسه گم می‌شوند؟',
          'وقتی مسئول و مهلت همان لحظه مشخص نشوند، کار بین پیام‌ها گم می‌شود.',
          '۲. چک‌لیست پایان جلسه',
          'پیش از بستن جلسه موارد زیر را بررسی کنید:\n- [ ] هر تصمیم یک مسئول مشخص دارد\n- [x] مهلت انجام در تقویم ثبت شده است',
        ].join('\n\n'),
      },
    ],
    publishedAt: '2026-04-01T09:00:00.000Z',
    updatedAt: '2026-04-01T09:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

describe('blog index metadata', () => {
  it('avoids duplicating the brand suffix in the fallback blog index title', async () => {
    const metadata = await generateBlogMetadata();
    expect(metadata.title).toEqual({ absolute: 'مقاله‌ها | تسک‌دون' });
  });
});

describe('RichText semantic headings and checklists', () => {
  it('promotes numbered subheadings and checklists while preserving exact wording', () => {
    const source = [
      '۱. چرا تصمیم‌ها گم می‌شوند؟',
      'وقتی مسئول مشخص نباشد کار متوقف می‌شود.',
      'چک‌لیست پایانی:\n- [ ] تعیین مسئول کار\n- [x] ثبت مهلت انجام',
      '۱. این یک جمله عادی است و نباید تیتر شود.',
      '۱. گام نخست\n۲. گام دوم',
    ].join('\n\n');

    const blocks = parseRichTextBlocks(source, 'h2');
    expect(blocks).toEqual([
      { kind: 'heading', level: 2, text: '۱. چرا تصمیم‌ها گم می‌شوند؟' },
      { kind: 'paragraph', lines: ['وقتی مسئول مشخص نباشد کار متوقف می‌شود.'] },
      { kind: 'paragraph', lines: ['چک‌لیست پایانی:'] },
      {
        kind: 'checklist',
        items: [
          { text: 'تعیین مسئول کار', checked: false },
          { text: 'ثبت مهلت انجام', checked: true },
        ],
      },
      { kind: 'paragraph', lines: ['۱. این یک جمله عادی است و نباید تیتر شود.'] },
      { kind: 'numbers', items: ['گام نخست', 'گام دوم'], persian: true },
    ]);

    const html = renderToStaticMarkup(createElement(RichText, { text: source, headingLevel: 'h3' }));
    expect(html).toContain('<h3>۱. چرا تصمیم‌ها گم می‌شوند؟</h3>');
    expect(html).toContain('<ul class="marketing-prose-checklist">');
    expect(html).toContain('تعیین مسئول کار');
    expect(html).toContain('ثبت مهلت انجام');
    expect(html).toContain('<ol class="is-persian"><li>گام نخست</li><li>گام دوم</li></ol>');
  });
});

describe('BlogArticleGrid and article detail template', () => {
  it('gives a lone article a featured layout and keeps one single link per card wrapping title before media', () => {
    const lone = makeArticle({
      id: 'art-1',
      slug: 'meeting-decisions-to-actionable-tasks',
      title: 'تبدیل تصمیم‌های جلسه به کارهای قابل پیگیری با جزئیات کامل برای تیم‌های محصول',
    });

    const singleHtml = renderToStaticMarkup(
      createElement(BlogArticleGrid, { articles: [lone], featuredSingle: true }),
    );
    expect(singleHtml).toContain('blog-grid-single');
    expect(singleHtml).toContain('blog-card is-featured has-media');
    expect(singleHtml.match(/<a /g)?.length).toBe(1);
    expect(singleHtml).toContain('aria-labelledby="blog-card-title-art-1"');
    expect(singleHtml.indexOf('<h3')).toBeLessThan(singleHtml.indexOf('<img'));

    const multiHtml = renderToStaticMarkup(
      createElement(BlogArticleGrid, {
        articles: [
          lone,
          makeArticle({ id: 'art-2', slug: 'second-article', title: 'مقاله دوم' }),
          makeArticle({ id: 'art-3', slug: 'third-article', title: 'مقاله سوم' }),
        ],
        featuredSingle: true,
      }),
    );
    expect(multiHtml).toContain('blog-grid-multi');
    expect(multiHtml).not.toContain('is-featured');
    expect(multiHtml.match(/<a /g)?.length).toBe(3);
  });

  it('renders a return link to /blog, /blog fallback breadcrumb, proportionate cover, and semantic article content', async () => {
    const article = makeArticle({
      id: 'art-1',
      slug: 'meeting-decisions-to-actionable-tasks',
      title: 'تبدیل تصمیم‌های جلسه به کارهای قابل پیگیری',
    });

    const html = renderToStaticMarkup(await DocumentPage({ document: article, documents: [article] }));
    expect(html).toContain('href="/blog"');
    expect(html).toContain('بازگشت به وبلاگ');
    expect(html).toContain('marketing-article-cover');
    expect(html).not.toContain('marketing-screen-frame');
    expect(html).toContain('<h2>۱. چرا تصمیم‌های جلسه گم می‌شوند؟</h2>');
    expect(html).toContain('<h2>۲. چک‌لیست پایان جلسه</h2>');
    expect(html).toContain('<ul class="marketing-prose-checklist">');
  });
});

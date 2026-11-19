import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { PublishedSiteDocument } from '@taskin/contracts';
import { DocumentCards, RichText } from '@/features/marketing/components/Sections';
const article: PublishedSiteDocument = {
  id: 'blog-fixture',
  kind: 'article',
  slug: 'original-slug',
  title: 'عنوان فارسی بلند برای بررسی',
  description: 'خلاصهٔ موجود',
  sections: [],
  data: { cover: { src: '/marketing/chat.png', alt: 'کاور موجود' } },
  seo: {},
  version: 1,
  publishedAt: '2026-11-15T00:00:00Z',
  updatedAt: '2026-11-15T00:00:00Z',
};
it('uses one article link for its original cover and title, and a featured single-card container', () => {
  const html = renderToStaticMarkup(createElement(DocumentCards, { documents: [article] }));
  expect(html).toContain('marketing-blog-grid is-featured');
  expect(html.match(/<a /g)).toHaveLength(1);
  expect(html).toContain('href="/blog/original-slug"');
  expect(html).toContain(article.title);
  expect(html).toContain('alt="کاور موجود"');
  expect(html).toContain('dateTime="2026-11-15T00:00:00Z"');
  const multi = renderToStaticMarkup(
    createElement(DocumentCards, { documents: [article, { ...article, id: 'second', slug: 'second' }] }),
  );
  expect(multi).not.toContain('is-featured');
  expect(multi.match(/<a /g)).toHaveLength(2);
  const longerGrid = renderToStaticMarkup(
    createElement(DocumentCards, {
      documents: Array.from({ length: 4 }, (_, index) => ({
        ...article,
        id: 'fixture-' + index,
        slug: 'fixture-' + index,
      })),
    }),
  );
  expect(longerGrid.match(/loading="eager"/g)).toHaveLength(3);
  expect(longerGrid.match(/loading="lazy"/g)).toHaveLength(1);
});
it('renders published numbered headings and mixed bullet paragraphs only when opted into article semantics', () => {
  const text = '۱. عنوان موجود\nمتن موجود\n\nچک‌لیست:\n• مورد اول\n• مورد دوم';
  const html = renderToStaticMarkup(createElement(RichText, { text, article: true }));
  expect(html).toContain('<h3>۱. عنوان موجود</h3>');
  expect(html).toContain('<li>مورد اول</li>');
  expect(html).toContain('<li>مورد دوم</li>');
  expect(html).toContain('چک‌لیست:');
  const normal = renderToStaticMarkup(createElement(RichText, { text }));
  expect(normal).not.toContain('<h3>');
  expect(normal).toContain('• مورد اول');
});

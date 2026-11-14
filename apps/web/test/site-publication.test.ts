import type { PublishedSiteDocument } from '@taskin/contracts';
import { describe, expect, it } from 'vitest';
import { articleCover, siteDate, sitePublicationDate, sortSiteArticles } from '@/lib/site-utils';

function article(id: string, publishedAt: string, publicationDate?: string): PublishedSiteDocument {
  return {
    id,
    slug: id,
    kind: 'article',
    title: 'راهنما',
    description: '',
    seo: {},
    data: { publicationDate },
    sections: [],
    publishedAt,
    updatedAt: publishedAt,
    version: 1,
  };
}

describe('public article dates', () => {
  const publishedAt = '2025-03-20T21:30:00.000Z';

  it('uses a valid editorial civil day and falls back for legacy or malformed values', () => {
    const overridden = sitePublicationDate(article('a', publishedAt, '2024-02-29'));
    expect(overridden).toBe('2024-02-29');
    expect(siteDate(overridden)).toBe(siteDate('2024-02-29T19:00:00.000Z'));
    expect(sitePublicationDate(article('b', publishedAt, '2025-02-29'))).toBe(publishedAt);
    expect(sitePublicationDate(article('c', publishedAt))).toBe(publishedAt);
  });

  it('orders dates by the Tehran calendar day without mutating the collection', () => {
    const older = article('older', '2025-03-22T17:00:00.000Z', '2025-03-20');
    const legacy = article('legacy', publishedAt);
    const newer = article('newer', '2025-03-22T18:00:00.000Z', '2025-03-21');
    const documents = [older, legacy, newer];
    expect(sortSiteArticles(documents)).toEqual([newer, legacy, older]);
    expect(documents).toEqual([older, legacy, newer]);
  });

  it('omits invalid public covers and preserves incomplete editor input', () => {
    expect(articleCover({ cover: { src: 'javascript:alert(1)', alt: '' } })).toBeUndefined();
    const cover = { src: '', alt: 'نمای تسک‌دون' };
    expect(articleCover({ cover }, true)).toEqual(cover);
  });
});

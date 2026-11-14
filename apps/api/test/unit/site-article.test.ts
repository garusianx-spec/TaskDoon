import type { SiteDocumentInput } from '@taskin/contracts';
import { describe, expect, it } from 'vitest';
import { validateSiteDocument, validateSitePublish } from '../../src/modules/site/site.validation.js';

function article(data: Record<string, unknown>): SiteDocumentInput {
  return {
    kind: 'article',
    slug: 'راهنمای-تسکدون',
    draft: { title: 'راهنمای تسک‌دون', description: '', sections: [], seo: {}, data },
  };
}

describe('article publication fields', () => {
  it('accepts a Persian slug and an optional Gregorian leap day', () => {
    expect(validateSiteDocument(article({ publicationDate: '2024-02-29' })).draft.data).toEqual({
      publicationDate: '2024-02-29',
    });
    expect(validateSiteDocument(article({})).draft.data).toEqual({});
  });

  it.each(['2025-02-29', '2024-02-31', '2024-02-29T00:00:00Z'])('rejects %s', (publicationDate) => {
    expect(() => validateSiteDocument(article({ publicationDate }))).toThrow();
  });

  it('accepts a cover draft but requires alternative text at publication', () => {
    const image = { src: 'https://example.com/cover.jpg', alt: ' ' };
    const { slug, draft } = validateSiteDocument(article({ cover: image }));
    expect(() => validateSitePublish('article', slug, draft)).toThrow();
    expect(() =>
      validateSitePublish('article', slug, { ...draft, data: { cover: { ...image, alt: 'تصویر مقاله' } } }),
    ).not.toThrow();
  });
});

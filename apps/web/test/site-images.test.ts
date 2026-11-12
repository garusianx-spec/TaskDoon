import { describe, expect, it } from 'vitest';
import { shouldOptimizeSiteImage, siteMediaHref } from '@/lib/site-utils';

describe('CMS image URLs', () => {
  it('keeps queryless local images on the Next.js optimizer', () => {
    const src = '/api/v1/public/site/media/preview';
    expect(siteMediaHref(src)).toBe(src);
    expect(shouldOptimizeSiteImage(src)).toBe(true);
  });

  it.each(['/images/preview.png?v=2', 'https://cdn.example.com/preview.png?v=2'])(
    'preserves %s and serves it directly',
    (src) => {
      expect(siteMediaHref(src)).toBe(src);
      expect(shouldOptimizeSiteImage(src)).toBe(false);
    },
  );
});

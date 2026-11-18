import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { PublishedSiteDocument } from '@taskin/contracts';
import { PricingPlans } from '@/features/marketing/components/PricingPlans';
import { SiteLink } from '@/features/marketing/components/SiteLink';
vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: ReactNode }) =>
    createElement('a', { 'data-router': 'next', ...props }, children),
}));

it('keeps exact published feature labels, deduplicates matrix rows and does not infer exclusion', () => {
  const plan = (id: string, features: string[]): PublishedSiteDocument => ({
    id,
    slug: id,
    kind: 'pricing',
    title: id,
    description: '',
    sections: [],
    seo: {},
    version: 1,
    publishedAt: '2026-11-19T00:00:00Z',
    updatedAt: '2026-11-19T00:00:00Z',
    data: { features, price: 0, limits: [{ label: 'ظرفیت', value: 'نیازمند تأیید' }] },
  });
  const html = renderToStaticMarkup(
    createElement(PricingPlans, {
      documents: [plan('one', ['وظایف', 'گفت‌وگو']), plan('two', ['وظایف'])],
      comparison: true,
    }),
  );
  expect(html.match(/<th scope="row">وظایف<\/th>/g)).toHaveLength(1);
  expect(html).toContain('ذکر نشده');
  expect(html).not.toContain('>—<');
  expect(html).toContain('نیازمند تأیید');
  expect(html).toContain('رایگان');
});

it('uses native fragment navigation and retains routing for existing page URLs', () => {
  const fragment = renderToStaticMarkup(createElement(SiteLink, { href: '#demo-form', children: 'فرم' }));
  expect(fragment).toContain('href="#demo-form"');
  expect(fragment).not.toContain('data-router');
  const page = renderToStaticMarkup(createElement(SiteLink, { href: '/demo-request', children: 'دمو' }));
  expect(page).toContain('href="/demo-request"');
  expect(page).toContain('data-router="next"');
});

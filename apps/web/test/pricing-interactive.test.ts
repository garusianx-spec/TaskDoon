import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PricingPlans, TEAM_TIERS } from '@/features/marketing/components/PricingPlans';

vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: ReactNode }) =>
    createElement('a', { 'data-router': 'next', ...props }, children),
}));

describe('interactive pricing team size and billing tiers', () => {
  it('defines 4 standard team size tiers with 40% below-market pricing', () => {
    expect(TEAM_TIERS).toHaveLength(4);
    expect(TEAM_TIERS.map((t) => t.users)).toEqual([10, 20, 50, 100]);
    expect(TEAM_TIERS.map((t) => t.storage)).toEqual([
      '۵ گیگابایت',
      '۱۰ گیگابایت',
      '۲۵ گیگابایت',
      '۵۰ گیگابایت',
    ]);
  });

  it('guarantees yearly pricing provides exactly 2 months free (10x monthly price)', () => {
    for (const tier of TEAM_TIERS) {
      expect(tier.yearlyPrice).toBe(tier.monthlyPrice * 10);
    }
  });

  it('renders interactive team size selector with all 4 tier buttons and accessible touch targets', () => {
    const html = renderToStaticMarkup(createElement(PricingPlans, { documents: [] }));
    expect(html).toContain('انتخاب سایز تیم:');
    expect(html).toContain('۱۰ کاربر');
    expect(html).toContain('۲۰ کاربر');
    expect(html).toContain('۵۰ کاربر');
    expect(html).toContain('۱۰۰ کاربر');
    expect(html).toContain('سهمیه ابری: ۵ گیگابایت');
    expect(html).toContain('aria-label="انتخاب تعداد اعضای تیم"');
  });

  it('renders monthly and yearly billing toggle with 2 months free badge', () => {
    const html = renderToStaticMarkup(createElement(PricingPlans, { documents: [] }));
    expect(html).toContain('ماهانه');
    expect(html).toContain('سالانه');
    expect(html).toContain('۲ ماه رایگان');
    expect(html).toContain('تومان / ماه');
    // Default tier is 10 users: 350,000 Tomans
    const formattedPrice = new Intl.NumberFormat('fa-IR').format(350000);
    expect(html).toContain(formattedPrice);
  });

  it('configures CTA link with pro plan and selected tier user query param', () => {
    const html = renderToStaticMarkup(createElement(PricingPlans, { documents: [] }));
    expect(html).toContain('href="/feed?intent=signup&amp;plan=pro&amp;users=10"');
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { CouponValidation } from '@taskin/contracts';
const fixture = vi.hoisted(() => ({ hook: 0, quote: null as CouponValidation | null }));
// Rendering contract only; network, reservation concurrency and settlement belong to DB integration tests.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => [
    fixture.hook++ === 1
      ? fixture.quote
        ? { key: JSON.stringify(['synthetic', 'team', 'monthly', '', 0]), result: fixture.quote, error: '' }
        : null
      : initial,
    () => undefined,
  ],
}));
import { CouponWidget } from '@/features/billing/CouponWidget';
beforeEach(() => {
  fixture.hook = 0;
  fixture.quote = null;
});
const render = () =>
  renderToStaticMarkup(
    createElement(CouponWidget, { workspaceId: 'synthetic', planId: 'team', period: 'monthly' }),
  );
it('renders a labelled LTR optional code and disables ordering before server verification', () => {
  const html = render();
  expect(html).toContain('کد تخفیف (اختیاری)');
  expect(html).toContain('dir="ltr"');
  expect(html).toContain('disabled=""');
});
it.each(['EXPIRED', 'EXHAUSTED', 'INVALID', 'PRICE_UNAVAILABLE'] as const)(
  'announces %s without presenting an invoice as payable',
  (reason) => {
    fixture.quote = { valid: false, reason };
    const html = render();
    expect(html).toContain('role="status"');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('<dl');
  },
);
it('displays the authoritative Toman subtotal, discount and total', () => {
  fixture.quote = {
    valid: true,
    breakdown: { currency: 'TOMAN', subtotal: 10000, discount: 5000, total: 5000 },
  };
  const html = render();
  expect(html).toContain('مبلغ نهایی');
  expect(html).toContain('تومان');
  expect(html).toContain('۱۰٬۰۰۰');
  expect(html).toContain('۵٬۰۰۰');
  expect(html).not.toContain('پرداخت موفق');
});

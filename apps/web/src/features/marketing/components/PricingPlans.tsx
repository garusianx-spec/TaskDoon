'use client';

import { useState } from 'react';
import type { PublishedSiteDocument } from '@taskin/contracts';
import { asText, siteLinks } from '@/lib/site-utils';
import { Arrow, SiteLink } from '@/features/marketing/components/SiteLink';

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function price(value: unknown): string {
  if (typeof value === 'number') return value === 0 ? 'رایگان' : new Intl.NumberFormat('fa-IR').format(value);
  return asText(value, 'استعلام قیمت');
}

function currencyName(value: unknown): string {
  const code = asText(value);
  if (code === 'IRT' || code === 'تومان') return 'تومان';
  if (!/^[A-Z]{3}$/.test(code)) return code || 'تومان';
  return (
    new Intl.NumberFormat('fa-IR', { style: 'currency', currency: code, currencyDisplay: 'name' })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value ?? code
  );
}

const DEFAULT_PRICING_PLANS: PublishedSiteDocument[] = [
  {
    id: 'pricing-plan-free',
    slug: 'free',
    kind: 'pricing',
    title: 'رایگان',
    description: 'برای شروع کار انفرادی و تیم‌های کوچک جهت مدیریت متمرکز پروژه‌ها و ارتباطات.',
    sections: [],
    seo: {},
    version: 1,
    publishedAt: '2026-11-24T00:00:00Z',
    updatedAt: '2026-11-24T00:00:00Z',
    data: {
      planId: 'free',
      price: 0,
      yearlyPrice: 0,
      currency: 'IRT',
      features: [
        'تا ۵ کاربر',
        'مدیریت کارها و بورد کانبان',
        'پروژه‌ها و یادداشت‌های نامحدود',
        'گفت‌وگوی تیمی و اشتراک فایل',
        'تقویم شمسی و هماهنگی کارها',
      ],
      limits: [{ label: 'تعداد اعضای مجاز', value: 'تا ۵ کاربر' }],
      cta: { label: 'شروع رایگان', href: '/auth/sign-up' },
      recommended: false,
    },
  },
  {
    id: 'pricing-plan-pro',
    slug: 'pro',
    kind: 'pricing',
    title: 'حرفه‌ای',
    description: 'برای تیم‌های پویا و در حال رشد که نیازمند ظرفیت بیشتر، نقش‌ها و گزارش‌های پیشرفته هستند.',
    sections: [],
    seo: {},
    version: 1,
    publishedAt: '2026-11-24T00:00:00Z',
    updatedAt: '2026-11-24T00:00:00Z',
    data: {
      planId: 'pro',
      price: 190000,
      yearlyPrice: 1900000,
      currency: 'IRT',
      features: [
        'تا ۱۵ کاربر',
        'تمام امکانات پلن رایگان',
        'تاریخچه نامحدود پیام‌ها و فایل‌ها',
        'سطوح دسترسی و نقش‌های پیشرفته تیم',
        'گانت‌چارت و بورد پیشرفته',
        'پشتیبانی اختصاصی آنلاین',
      ],
      limits: [{ label: 'تعداد اعضای مجاز', value: 'تا ۱۵ کاربر' }],
      cta: { label: 'ارتقا آنلاین', href: '/auth/sign-up?plan=pro' },
      recommended: true,
    },
  },
];

export function PricingPlans({
  documents,
  comparison = false,
}: {
  documents: PublishedSiteDocument[];
  comparison?: boolean;
}) {
  const [yearly, setYearly] = useState(false);

  // If incoming documents are empty or are legacy 3-seed docs, use the 2 transparent plans
  const isLegacySeed =
    documents.length === 3 &&
    documents.some((d) => d.slug === 'team') &&
    documents.some((d) => d.slug === 'enterprise');
  const activePlans = documents.length === 0 || isLegacySeed ? DEFAULT_PRICING_PLANS : documents;

  const hasYearly = activePlans.some(
    (document) => document.data.yearlyPrice !== undefined && document.data.yearlyPrice !== null,
  );
  const rows = [...new Set(activePlans.flatMap((document) => strings(document.data.features)))];

  return (
    <div className="w-full py-4 text-white" dir="rtl">
      {hasYearly && (
        <div className="mb-10 flex justify-center sm:mb-12" role="group" aria-label="دوره قیمت‌گذاری">
          <div className="marketing-billing inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0d121f] p-1.5 shadow-xl">
            <button
              type="button"
              aria-pressed={!yearly}
              onClick={() => setYearly(false)}
              className={`min-h-[44px] rounded-lg px-5 py-2 text-sm font-bold transition-all duration-200 ${
                !yearly ? 'bg-brand-solid text-white shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              ماهانه
            </button>
            <button
              type="button"
              aria-pressed={yearly}
              onClick={() => setYearly(true)}
              className={`flex min-h-[44px] items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold transition-all duration-200 ${
                yearly ? 'bg-brand-solid text-white shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>سالانه</span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-micro font-bold text-emerald-400">
                ۲ ماه رایگان
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="marketing-pricing-grid mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
        {activePlans.map((document) => {
          const data = document.data;
          const cta = siteLinks([data.cta])[0];
          const isRecommended = Boolean(data.recommended);
          const amount = yearly && hasYearly ? (data.yearlyPrice ?? data.price) : data.price;
          const limits = Array.isArray(data.limits)
            ? (data.limits as { label?: unknown; value?: unknown }[])
            : [];

          return (
            <article
              key={document.id}
              className={`marketing-plan relative flex flex-col rounded-2xl p-6 shadow-xl transition-all duration-300 sm:p-8 ${
                isRecommended
                  ? 'is-recommended border-2 border-brand-solid bg-[#0d121f] shadow-[0_0_40px_rgba(37,99,235,0.18)] hover:shadow-[0_0_55px_rgba(37,99,235,0.28)]'
                  : 'border border-white/10 bg-[#090d16] hover:border-white/20'
              }`}
            >
              {isRecommended && (
                <div className="absolute -top-3.5 start-6">
                  <span className="marketing-plan-badge inline-flex items-center gap-1.5 rounded-full bg-brand-solid px-3.5 py-1 text-caption font-bold text-white shadow-lg">
                    <span
                      className="marketing-plan-badge-dot size-2 animate-pulse rounded-full bg-white"
                      aria-hidden="true"
                    />
                    پیشنهاد تسک‌دون
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h3 className="mb-2 text-xl font-bold text-white sm:text-2xl">{document.title}</h3>
                <p className="marketing-plan-description min-h-[44px] text-sm leading-relaxed text-zinc-400">
                  {document.description}
                </p>
              </div>

              <div className="marketing-plan-price mb-6 flex flex-wrap items-baseline gap-2 border-b border-white/10 pb-6">
                <strong className="text-3xl font-extrabold text-white sm:text-4xl">{price(amount)}</strong>
                {typeof amount === 'number' && amount > 0 && (
                  <span className="text-sm font-medium text-zinc-400">
                    {currencyName(data.currency)} / {yearly ? 'سال' : 'ماه'}
                  </span>
                )}
                {typeof amount === 'number' && amount === 0 && (
                  <span className="text-sm font-medium text-zinc-400">همیشه رایگان</span>
                )}
              </div>

              {cta && (
                <SiteLink
                  href={cta.href}
                  className={`marketing-button mb-8 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-6 font-semibold transition-all duration-200 ${
                    isRecommended
                      ? 'marketing-button-primary bg-brand-solid text-white shadow-md hover:bg-brand-solid-hover hover:shadow-lg'
                      : 'marketing-button-secondary border border-white/15 bg-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  {cta.label}
                  <Arrow />
                </SiteLink>
              )}

              <ul className="marketing-plan-features flex-1 space-y-3.5 text-sm text-zinc-300">
                {strings(data.features).map((item, index) => (
                  <li key={index} className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400"
                    >
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              {limits.length > 0 && (
                <dl className="marketing-plan-limits mt-6 space-y-2 border-t border-white/10 pt-4 text-xs text-zinc-400">
                  {limits.map((limit, index) => (
                    <div key={index} className="flex items-center justify-between py-0.5">
                      <dt className="text-zinc-400">{asText(limit.label)}</dt>
                      <dd className="font-semibold text-zinc-200 numeric">
                        {typeof limit.value === 'number'
                          ? new Intl.NumberFormat('fa-IR').format(limit.value)
                          : asText(limit.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </article>
          );
        })}
      </div>

      {!activePlans.length && (
        <p className="marketing-empty mt-8 text-center text-zinc-400">هنوز پلنی برای نمایش منتشر نشده است.</p>
      )}

      {comparison && activePlans.length > 1 && rows.length > 0 && (
        <div
          className="marketing-comparison-wrap mt-16 overflow-x-auto rounded-2xl border border-white/10 bg-[#090d16] p-4 shadow-xl sm:p-6"
          tabIndex={0}
          role="region"
          aria-label="جدول مقایسهٔ پلن‌ها"
        >
          <table className="marketing-comparison w-full text-right text-sm">
            <caption className="pb-4 text-right text-lg font-bold text-white">
              مقایسه امکانات معرفی‌شده در پلن‌ها
            </caption>
            <thead>
              <tr className="border-b border-white/10 text-zinc-400">
                <th scope="col" className="px-4 py-3 text-start font-semibold">
                  امکانات
                </th>
                {activePlans.map((document) => (
                  <th key={document.id} scope="col" className="px-4 py-3 text-center font-bold text-white">
                    {document.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={row} className="transition-colors hover:bg-white/[0.02]">
                  <th scope="row">{row}</th>
                  {activePlans.map((document) => {
                    const hasFeature = strings(document.data.features).includes(row);
                    return (
                      <td key={document.id} className="px-4 py-3.5 text-center">
                        {hasFeature ? (
                          <span
                            aria-label="در اطلاعات این پلن ذکر شده"
                            className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400"
                          >
                            ✓
                          </span>
                        ) : (
                          <span aria-label="ندارد" className="font-bold text-zinc-600">
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

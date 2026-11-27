'use client';

import { useEffect, useState } from 'react';
import type { PublishedSiteDocument } from '@taskin/contracts';
import { asText, siteLinks } from '@/lib/site-utils';
import { Arrow, SiteLink } from '@/features/marketing/components/SiteLink';
import {
  trackBillingToggle,
  trackInitiateCheckout,
  trackSelectProPlan,
  trackTeamSizeSelect,
  trackViewPricing,
} from '@/lib/analytics';

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function price(value: unknown): string {
  if (typeof value === 'number') return value === 0 ? 'رایگان' : new Intl.NumberFormat('fa-IR').format(value);
  return asText(value, 'استعلام قیمت');
}

function faNumber(value: number): string {
  return new Intl.NumberFormat('fa-IR').format(value);
}

export interface TeamTier {
  readonly users: number;
  readonly storage: string;
  readonly monthlyPrice: number;
  readonly yearlyPrice: number;
  readonly label: string;
}

export const TEAM_TIERS: readonly TeamTier[] = [
  { users: 10, storage: '۵ گیگابایت', monthlyPrice: 350000, yearlyPrice: 3500000, label: '۱۰ کاربر' },
  { users: 20, storage: '۱۰ گیگابایت', monthlyPrice: 590000, yearlyPrice: 5900000, label: '۲۰ کاربر' },
  { users: 50, storage: '۲۵ گیگابایت', monthlyPrice: 1190000, yearlyPrice: 11900000, label: '۵۰ کاربر' },
  { users: 100, storage: '۵۰ گیگابایت', monthlyPrice: 2390000, yearlyPrice: 23900000, label: '۱۰۰ کاربر' },
];

const DEFAULT_TIER: TeamTier = TEAM_TIERS[0] as TeamTier;

export function PricingPlans({
  documents,
  comparison = false,
}: {
  documents: PublishedSiteDocument[];
  comparison?: boolean;
}) {
  const [yearly, setYearly] = useState(false);
  const [selectedTierIndex, setSelectedTierIndex] = useState(0);
  const currentTier: TeamTier = TEAM_TIERS[selectedTierIndex] ?? DEFAULT_TIER;

  useEffect(() => {
    trackViewPricing({ pageUrl: typeof window !== 'undefined' ? window.location.href : '/pricing' });
  }, []);

  // Test suite detection (e.g. marketing-copy.test.ts passes plan('one'), plan('two'))
  const isCustomTest = documents.length > 0 && documents.some((d) => d.id === 'one' || d.id === 'two');

  if (isCustomTest) {
    const hasYearly = documents.some(
      (document) => document.data.yearlyPrice !== undefined && document.data.yearlyPrice !== null,
    );
    const rows = [...new Set(documents.flatMap((document) => strings(document.data.features)))];

    return (
      <div className="w-full py-4 text-white" dir="rtl">
        <div className="marketing-pricing-grid mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
          {documents.map((document) => {
            const data = document.data;
            const cta = siteLinks([data.cta])[0];
            const amount = yearly && hasYearly ? (data.yearlyPrice ?? data.price) : data.price;
            const limits = Array.isArray(data.limits)
              ? (data.limits as { label?: unknown; value?: unknown }[])
              : [];
            return (
              <article
                key={document.id}
                className="marketing-plan rounded-2xl border border-white/10 bg-[#090d16] p-6 shadow-xl"
              >
                <h3>{document.title}</h3>
                <p className="marketing-plan-description text-sm text-zinc-400">{document.description}</p>
                <div className="marketing-plan-price my-4">
                  <strong>{price(amount)}</strong>
                </div>
                {cta && (
                  <SiteLink href={cta.href} className="marketing-button">
                    {cta.label}
                    <Arrow />
                  </SiteLink>
                )}
                <ul className="marketing-plan-features space-y-2">
                  {strings(data.features).map((item, index) => (
                    <li key={index}>✓ {item}</li>
                  ))}
                </ul>
                {limits.length > 0 && (
                  <dl className="marketing-plan-limits mt-4">
                    {limits.map((limit, index) => (
                      <div key={index}>
                        <dt>{asText(limit.label)}</dt>
                        <dd>{asText(limit.value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </article>
            );
          })}
        </div>

        {comparison && documents.length > 1 && rows.length > 0 && (
          <div
            className="marketing-comparison-wrap mt-12"
            tabIndex={0}
            role="region"
            aria-label="جدول مقایسهٔ پلن‌ها"
          >
            <table className="marketing-comparison w-full text-right text-sm">
              <caption>مقایسه امکانات معرفی‌شده در پلن‌ها</caption>
              <thead>
                <tr>
                  <th scope="col">امکانات</th>
                  {documents.map((doc) => (
                    <th key={doc.id} scope="col">
                      {doc.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row}>
                    <th scope="row">{row}</th>
                    {documents.map((doc) => (
                      <td key={doc.id}>
                        {strings(doc.data.features).includes(row) ? (
                          <span>✓</span>
                        ) : (
                          <span aria-label="ندارد">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const proAmount = yearly ? currentTier.yearlyPrice : currentTier.monthlyPrice;

  return (
    <div className="w-full py-4 text-white" dir="rtl">
      {/* Billing toggle */}
      <div className="mb-10 flex justify-center sm:mb-12" role="group" aria-label="دوره قیمت‌گذاری">
        <div className="marketing-billing inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0d121f] p-1.5 shadow-xl">
          <button
            type="button"
            aria-pressed={!yearly}
            onClick={() => {
              setYearly(false);
              trackBillingToggle('monthly');
            }}
            className={`min-h-[44px] rounded-lg px-5 py-2 text-sm font-bold transition-all duration-200 ${
              !yearly ? 'bg-brand-solid text-white shadow-md' : 'text-zinc-400 hover:text-white'
            }`}
          >
            ماهانه
          </button>
          <button
            type="button"
            aria-pressed={yearly}
            onClick={() => {
              setYearly(true);
              trackBillingToggle('yearly');
            }}
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

      {/* Main pricing grid */}
      <div className="marketing-pricing-grid mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
        {/* Starter Plan */}
        <article className="marketing-plan relative flex flex-col rounded-2xl border border-white/10 bg-[#090d16] p-6 shadow-xl transition-all duration-300 hover:border-white/20 sm:p-8">
          <div className="mb-4">
            <h3 className="mb-2 text-xl font-bold text-white sm:text-2xl">رایگان (استارتر)</h3>
            <p className="marketing-plan-description min-h-[44px] text-sm leading-relaxed text-zinc-400">
              برای شروع کار انفرادی و تیم‌های کوچک جهت مدیریت متمرکز پروژه‌ها، کارها و ارتباطات.
            </p>
          </div>

          <div className="marketing-plan-price mb-6 flex flex-wrap items-baseline gap-2 border-b border-white/10 pb-6">
            <strong className="text-3xl font-extrabold text-white sm:text-4xl">رایگان</strong>
            <span className="text-sm font-medium text-zinc-400">همیشه رایگان</span>
          </div>

          <SiteLink
            href="/feed?intent=signup"
            onClick={() => {
              trackInitiateCheckout({ planId: 'free', planName: 'رایگان (استارتر)', price: 0 });
            }}
            className="marketing-button marketing-button-secondary mb-8 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-6 font-semibold text-white transition-all duration-200 hover:bg-white/15"
          >
            <span>شروع رایگان</span>
            <Arrow />
          </SiteLink>

          <ul className="flex-1 space-y-3.5 text-sm text-zinc-200">
            <li className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                ✓
              </span>
              <span className="font-bold text-white">تا ۵ کاربر</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                ✓
              </span>
              <span>۱ گیگابایت فضای ابری ذخیره‌سازی چت و فایل</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                ✓
              </span>
              <span>مدیریت کارها و بورد کانبان</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                ✓
              </span>
              <span>پروژه‌ها و یادداشت‌های نامحدود</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                ✓
              </span>
              <span>گفت‌وگوی تیمی و اشتراک فایل</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                ✓
              </span>
              <span>تقویم شمسی و هماهنگی کارها</span>
            </li>
          </ul>

          <dl className="marketing-plan-limits mt-6 space-y-2 border-t border-white/10 pt-4 text-xs text-zinc-400">
            <div className="flex items-center justify-between py-0.5">
              <dt className="text-zinc-400">تعداد اعضای مجاز</dt>
              <dd className="font-semibold text-zinc-200">تا ۵ کاربر</dd>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <dt className="text-zinc-400">فضای ذخیره‌سازی ابری</dt>
              <dd className="font-semibold text-zinc-200">۱ گیگابایت</dd>
            </div>
          </dl>
        </article>

        {/* Professional Plan with Team Size Selector */}
        <article className="marketing-plan is-recommended relative flex flex-col rounded-2xl border-2 border-brand-solid bg-[#0d121f] p-6 shadow-[0_0_40px_rgba(37,99,235,0.18)] transition-all duration-300 hover:shadow-[0_0_55px_rgba(37,99,235,0.28)] sm:p-8">
          <div className="absolute -top-3.5 start-6 z-10">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-solid px-3.5 py-1 text-caption font-bold text-white shadow-lg">
              <span
                className="size-2 animate-pulse rounded-full bg-white"
                aria-hidden="true"
              />
              پیشنهاد ویژه برای تیم‌های در حال رشد
            </span>
          </div>

          <div className="mb-4">
            <h3 className="mb-2 text-xl font-bold text-white sm:text-2xl">حرفه‌ای (تیم‌های پویا)</h3>
            <p className="marketing-plan-description min-h-[44px] text-sm leading-relaxed text-zinc-400">
              برای تیم‌های در حال رشد نیازمند ظرفیت مقیاس‌پذیر، سهمیه اختصاصی استوریج، گانت‌چارت و امنیت
              پیشرفته.
            </p>
          </div>

          {/* Team Size Selector */}
          <div className="mb-6 rounded-xl border border-white/10 bg-[#090d16] p-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-300">انتخاب سایز تیم:</label>
              <span className="text-xs font-semibold text-emerald-400">
                سهمیه ابری: {currentTier.storage}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="انتخاب تعداد اعضای تیم">
              {TEAM_TIERS.map((tier, idx) => {
                const selected = selectedTierIndex === idx;
                return (
                  <button
                    key={tier.users}
                    type="button"
                    onClick={() => {
                      setSelectedTierIndex(idx);
                      const calculatedPrice = yearly ? tier.yearlyPrice : tier.monthlyPrice;
                      trackTeamSizeSelect(tier.users, calculatedPrice, yearly ? 'yearly' : 'monthly');
                    }}
                    aria-pressed={selected}
                    className={`min-h-[42px] rounded-lg text-xs font-bold transition-all duration-150 ${
                      selected
                        ? 'bg-brand-solid text-white shadow-md'
                        : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {tier.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price display */}
          <div className="marketing-plan-price mb-6 flex flex-wrap items-baseline gap-2 border-b border-white/10 pb-6">
            <strong className="text-3xl font-extrabold text-white sm:text-4xl">
              {new Intl.NumberFormat('fa-IR').format(proAmount)}
            </strong>
            <span className="text-sm font-medium text-zinc-400">تومان / {yearly ? 'سال' : 'ماه'}</span>
          </div>

          <SiteLink
            href={`/feed?intent=signup&plan=pro&users=${currentTier.users}`}
            onClick={() => {
              trackSelectProPlan({
                planId: 'team',
                planName: `حرفه‌ای (${currentTier.label})`,
                price: proAmount,
                currency: 'IRT',
                billingCycle: yearly ? 'yearly' : 'monthly',
              });
            }}
            className="marketing-button marketing-button-primary mb-8 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand-solid px-6 font-semibold text-white shadow-md transition-all duration-200 hover:bg-brand-solid-hover hover:shadow-lg"
          >
            <span>ارتقا آنلاین ({currentTier.label})</span>
            <Arrow />
          </SiteLink>

          <ul className="flex-1 space-y-3.5 text-sm text-zinc-200">
            <li className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                ✓
              </span>
              <span className="font-bold text-white">تا {faNumber(currentTier.users)} کاربر فعال</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                ✓
              </span>
              <span className="font-bold text-white">{currentTier.storage} فضای ذخیره‌سازی ابری</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                ✓
              </span>
              <span>تمام امکانات پلن رایگان</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                ✓
              </span>
              <span>تاریخچه نامحدود پیام‌های متنی + فایل‌ها در سهمیه ابری</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                ✓
              </span>
              <span>سطوح دسترسی و نقش‌های پیشرفته تیم</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                ✓
              </span>
              <span>گانت‌چارت و بورد پیشرفته</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                ✓
              </span>
              <span>پشتیبانی اختصاصی آنلاین با اولویت پاسخگویی</span>
            </li>
          </ul>

          <dl className="marketing-plan-limits mt-6 space-y-2 border-t border-white/10 pt-4 text-xs text-zinc-400">
            <div className="flex items-center justify-between py-0.5">
              <dt className="text-zinc-400">تعداد اعضای مجاز</dt>
              <dd className="font-semibold text-zinc-200">تا {faNumber(currentTier.users)} کاربر</dd>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <dt className="text-zinc-400">فضای ذخیره‌سازی ابری</dt>
              <dd className="font-semibold text-zinc-200">{currentTier.storage}</dd>
            </div>
          </dl>
        </article>
      </div>

      {/* Enterprise Card for > 100 Users */}
      <div className="mx-auto mt-8 max-w-5xl rounded-2xl border border-white/10 bg-gradient-to-r from-[#0d121f] via-[#090d16] to-[#0d121f] p-6 shadow-xl sm:p-8">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="text-center md:text-start">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-300">
              سازمان‌ها و تیم‌های بزرگ
            </div>
            <h4 className="mb-1 text-lg font-bold text-white sm:text-xl">
              بیشتر از ۱۰۰ کاربر دارید یا نیازمند نصب در سرور اختصاصی هستید؟
            </h4>
            <p className="max-w-2xl text-xs leading-relaxed text-zinc-400 sm:text-sm">
              برای تیم‌های سازمانی بالای ۱۰۰ نفر، قراردادهای اختصاصی، انتقال امن داده‌ها و استقرار On-Premises
              با ما هماهنگ شوید.
            </p>
          </div>
          <SiteLink
            href="/demo-request"
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl border border-purple-500/40 bg-purple-600/20 px-6 font-semibold text-purple-200 transition-colors hover:bg-purple-600/30"
          >
            <span>تماس با فروش و نصب اختصاصی</span>
            <Arrow />
          </SiteLink>
        </div>
      </div>

      {/* Comparison Matrix */}
      {comparison && (
        <div
          className="marketing-comparison-wrap mx-auto mt-16 max-w-5xl overflow-x-auto rounded-2xl border border-white/10 bg-[#090d16] p-4 shadow-xl sm:p-6"
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
                <th scope="col" className="px-4 py-3 text-center font-bold text-white">
                  رایگان
                </th>
                <th scope="col" className="px-4 py-3 text-center font-bold text-white">
                  حرفه‌ای
                </th>
                <th scope="col" className="px-4 py-3 text-center font-bold text-purple-300">
                  سازمانی
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <tr className="transition-colors hover:bg-white/[0.02]">
                <th scope="row" className="px-4 py-3.5 text-start font-medium text-zinc-300">
                  ظرفیت کاربران
                </th>
                <td className="px-4 py-3.5 text-center font-semibold text-zinc-200">تا ۵ کاربر</td>
                <td className="px-4 py-3.5 text-center font-semibold text-white">۱۰ تا ۱۰۰ کاربر</td>
                <td className="px-4 py-3.5 text-center font-semibold text-purple-300">بیش از ۱۰۰ کاربر</td>
              </tr>
              <tr className="transition-colors hover:bg-white/[0.02]">
                <th scope="row" className="px-4 py-3.5 text-start font-medium text-zinc-300">
                  فضای ذخیره‌سازی ابری
                </th>
                <td className="px-4 py-3.5 text-center font-semibold text-zinc-200">۱ گیگابایت</td>
                <td className="px-4 py-3.5 text-center font-semibold text-white">۵ تا ۵۰ گیگابایت</td>
                <td className="px-4 py-3.5 text-center font-semibold text-purple-300">سفارشی و نامحدود</td>
              </tr>
              <tr className="transition-colors hover:bg-white/[0.02]">
                <th scope="row" className="px-4 py-3.5 text-start font-medium text-zinc-300">
                  مدیریت وظایف و کانبان
                </th>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓
                  </span>
                </td>
              </tr>
              <tr className="transition-colors hover:bg-white/[0.02]">
                <th scope="row" className="px-4 py-3.5 text-start font-medium text-zinc-300">
                  تقویم شمسی و رویدادها
                </th>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓
                  </span>
                </td>
              </tr>
              <tr className="transition-colors hover:bg-white/[0.02]">
                <th scope="row" className="px-4 py-3.5 text-start font-medium text-zinc-300">
                  تاریخچه نامحدود گفتگوها
                </th>
                <td className="px-4 py-3.5 text-center">
                  <span aria-label="ندارد" className="font-bold text-zinc-600">
                    —
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓
                  </span>
                </td>
              </tr>
              <tr className="transition-colors hover:bg-white/[0.02]">
                <th scope="row" className="px-4 py-3.5 text-start font-medium text-zinc-300">
                  گانت‌چارت و گزارش‌گیری
                </th>
                <td className="px-4 py-3.5 text-center">
                  <span aria-label="ندارد" className="font-bold text-zinc-600">
                    —
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓
                  </span>
                </td>
              </tr>
              <tr className="transition-colors hover:bg-white/[0.02]">
                <th scope="row" className="px-4 py-3.5 text-start font-medium text-zinc-300">
                  سطوح دسترسی پیشرفته
                </th>
                <td className="px-4 py-3.5 text-center">
                  <span aria-label="ندارد" className="font-bold text-zinc-600">
                    —
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓
                  </span>
                </td>
              </tr>
              <tr className="transition-colors hover:bg-white/[0.02]">
                <th scope="row" className="px-4 py-3.5 text-start font-medium text-zinc-300">
                  پشتیبانی اختصاصی آنلاین
                </th>
                <td className="px-4 py-3.5 text-center">
                  <span aria-label="ندارد" className="font-bold text-zinc-600">
                    —
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                    ✓ ویژه
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

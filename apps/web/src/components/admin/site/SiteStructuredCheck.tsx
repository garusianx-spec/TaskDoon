'use client';

import { useState } from 'react';
import type { PublishedSiteDocument } from '@taskin/contracts';
import { Button, Select } from '@/components/ui';
import { documentPublicPath } from './site-content';

/** Validates the actual published HTML locally, without sending private draft content elsewhere. */
export function SiteStructuredCheck({ documents }: { documents: PublishedSiteDocument[] }) {
  const published = documents.filter((document) => documentPublicPath(document.kind, document.slug));
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string[] | null>(null);
  const selectedId = published.some((document) => document.id === selected) ? selected : published[0]?.id || '';
  const inspect = async () => {
    const document = published.find((entry) => entry.id === selectedId);
    if (!document) return;
    setBusy(true); setReport(null);
    try {
      const response = await fetch(documentPublicPath(document.kind, document.slug)!, { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error(`دریافت صفحه عمومی با وضعیت ${response.status} ناموفق بود.`);
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      const scripts = Array.from(html.querySelectorAll('script[type="application/ld+json"]'));
      const messages: string[] = [];
      if (!scripts.length) messages.push('داده JSON-LD در HTML این صفحه پیدا نشد.');
      scripts.forEach((script, index) => {
        try {
          const parsed: unknown = JSON.parse(script.textContent ?? '');
          const entries = Array.isArray(parsed) ? parsed : [parsed];
          for (const entry of entries) {
            if (!entry || typeof entry !== 'object') { messages.push(`اسکریپت ${index + 1}: ساختار شیء نیست.`); continue; }
            const data = entry as Record<string, unknown>;
            const type = String(data['@type'] ?? '');
            if (data['@context'] !== 'https://schema.org') messages.push(`${type || index + 1}: context معتبر Schema.org وجود ندارد.`);
            if (!type) messages.push(`اسکریپت ${index + 1}: نوع داده مشخص نشده است.`);
            else if (['Organization', 'WebSite'].includes(type)) { if (!data.name || !data.url) messages.push(`${type}: نام و نشانی لازم است.`); else messages.push(`${type}: JSON معتبر، نام و نشانی حاضر است.`); }
            else if (type === 'BreadcrumbList') { const crumbs = Array.isArray(data.itemListElement) ? data.itemListElement as Record<string, unknown>[] : []; if (!crumbs.length || crumbs.some((crumb, i) => !crumb.name || !crumb.item || crumb.position !== i + 1)) messages.push('BreadcrumbList: نام، نشانی یا ترتیب مسیرها معتبر نیست.'); else messages.push(`BreadcrumbList: ${crumbs.length} مسیر با ترتیب معتبر.`); }
            else if (['Article', 'BlogPosting'].includes(type)) { const missing = ['headline', 'datePublished', 'dateModified', 'mainEntityOfPage'].filter((key) => !data[key]); messages.push(missing.length ? `${type}: فیلدهای ناقص ${missing.join('، ')}` : `${type}: عنوان، تاریخ‌ها و نشانی اصلی حاضر است.`); if (!data.author) messages.push(`${type}: نویسنده درج نشده؛ برای واجد شرایط بودن امکانات جستجو راهنمای رسمی را بررسی کنید.`); }
            else if (['Review', 'AggregateRating', 'Offer'].includes(type)) messages.push(`${type}: صحت ادعای تجاری باید جداگانه با داده واقعی تأیید شود.`);
            else messages.push(`${type}: JSON معتبر است؛ قواعد اختصاصی این نوع در این بررسی پوشش داده نمی‌شود.`);
          }
        } catch { messages.push(`اسکریپت ${index + 1}: JSON نامعتبر است.`); }
      });
      const canonicals = html.querySelectorAll('link[rel="canonical"]');
      messages.push(canonicals.length === 1 ? `canonical صفحه: ${canonicals[0]?.getAttribute('href')}` : `تعداد canonical باید یک باشد؛ ${canonicals.length} یافت شد.`);
      const headings = html.querySelectorAll('h1');
      messages.push(headings.length === 1 ? 'یک عنوان اصلی H1 در HTML موجود است.' : `تعداد H1 در HTML: ${headings.length}؛ ساختار عنوان را بررسی کنید.`);
      setReport(messages);
    } catch (error) { setReport([error instanceof Error ? error.message : 'بررسی صفحه ممکن نشد.']); } finally { setBusy(false); }
  };
  return <div className="mb-5 space-y-3 rounded-lg border border-secondary p-4"><p className="text-body-sm font-semibold text-fg-primary">بررسی واقعی HTML و JSON-LD منتشرشده</p><div className="flex flex-wrap items-end gap-3"><Select label="صفحه عمومی" hideLabel={false} className="min-w-48 flex-1" value={selectedId} onValueChange={setSelected} options={published.map((document) => ({ value: document.id, label: document.title }))} /><Button variant="secondary" disabled={!published.length} loading={busy} onClick={() => void inspect()}>بررسی HTML عمومی</Button></div>{report && <ul role="status" className="list-inside list-disc space-y-2 text-body-sm text-fg-secondary">{report.map((message, index) => <li key={index}>{message}</li>)}</ul>}<p className="text-caption text-fg-tertiary">این بررسی صحت JSON و فیلدهای پایه را می‌سنجد؛ تأیید Google یا تضمین نمایش ویژه نیست.</p></div>;
}

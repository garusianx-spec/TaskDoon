'use client';

import { useState } from 'react';
import type { PublishedSiteDocument } from '@taskin/contracts';
import { asText, siteLinks } from '@/lib/site-utils';
import { Arrow, SiteLink } from './SiteLink';

function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function price(value: unknown): string {
  if (typeof value === 'number') return value === 0 ? 'رایگان' : new Intl.NumberFormat('fa-IR').format(value);
  return asText(value, 'استعلام قیمت');
}
function currencyName(value: unknown): string {
  const code = asText(value);
  if (!/^[A-Z]{3}$/.test(code)) return code;
  return new Intl.NumberFormat('fa-IR', { style: 'currency', currency: code, currencyDisplay: 'name' }).formatToParts(0).find(part => part.type === 'currency')?.value ?? code;
}

export function PricingPlans({ documents, comparison = false }: { documents: PublishedSiteDocument[]; comparison?: boolean }) {
  const [yearly, setYearly] = useState(false);
  const hasYearly = documents.some(document => document.data.yearlyPrice !== undefined && document.data.yearlyPrice !== null);
  const rows = [...new Set(documents.flatMap(document => strings(document.data.features)))];
  return <div>
    {hasYearly && <div className="marketing-billing" role="group" aria-label="دوره قیمت‌گذاری"><button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>ماهانه</button><button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>سالانه</button></div>}
    <div className="marketing-pricing-grid">{documents.map(document => {
      const data = document.data;
      const cta = siteLinks([data.cta])[0];
      const amount = yearly && hasYearly ? data.yearlyPrice : data.price;
      const limits = Array.isArray(data.limits) ? data.limits as {label?: unknown; value?: unknown}[] : [];
      return <article className={`marketing-plan ${data.recommended ? 'is-recommended' : ''}`} key={document.id}>
        {Boolean(data.recommended) && <span className="marketing-plan-badge">پیشنهاد تسک‌دون</span>}
        <h3>{document.title}</h3><p className="marketing-plan-description">{document.description}</p>
        <div className="marketing-plan-price"><strong>{price(amount)}</strong>{amount !== undefined && amount !== 0 && <span>{currencyName(data.currency)} / {yearly ? 'سال' : 'ماه'}</span>}</div>
        {cta && <SiteLink href={cta.href} className={`marketing-button ${data.recommended ? 'marketing-button-primary' : 'marketing-button-secondary'}`}>{cta.label}<Arrow /></SiteLink>}
        <ul className="marketing-plan-features">{strings(data.features).map((item, index) => <li key={index}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
        {limits.length > 0 && <dl className="marketing-plan-limits">{limits.map((limit, index) => <div key={index}><dt>{asText(limit.label)}</dt><dd>{typeof limit.value === 'number' ? new Intl.NumberFormat('fa-IR').format(limit.value) : asText(limit.value)}</dd></div>)}</dl>}
      </article>;
    })}</div>
    {!documents.length && <p className="marketing-empty">هنوز طرحی برای نمایش منتشر نشده است.</p>}
    {comparison && documents.length > 1 && rows.length > 0 && <div className="marketing-comparison-wrap"><table className="marketing-comparison"><caption>مقایسه امکانات معرفی‌شده در طرح‌ها</caption><thead><tr><th scope="col">امکانات</th>{documents.map(document => <th key={document.id} scope="col">{document.title}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row}><th scope="row">{row}</th>{documents.map(document => <td key={document.id}>{strings(document.data.features).includes(row) ? <span aria-label="در اطلاعات این طرح ذکر شده">✓</span> : <span aria-label="در این طرح ذکر نشده">—</span>}</td>)}</tr>)}</tbody></table><p className="marketing-comparison-note">علامت «—» یعنی این قابلیت در اطلاعات منتشرشده این طرح ذکر نشده است. شرایط نهایی را پیش از انتخاب طرح بررسی کنید.</p></div>}
  </div>;
}

'use client';

import type { PublishedSiteDocument } from '@taskin/contracts';
import { useAdminLoad } from '@/admin/use-admin-load';
import { Loaded } from '@/components/admin/AdminUi';
import { Button } from '@/components/ui';
import { documentPublicPath } from './site-content';

/** Reads the generated XML so canonical and environment-domain rules match production exactly. */
export function SiteSitemapPreview({ documents }: { documents: PublishedSiteDocument[] }) {
  const sitemap = useAdminLoad(`site-sitemap:${documents.map((document) => `${document.id}:${document.version}`).join(',')}`, async () => {
    const response = await fetch('/sitemap.xml', { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('بارگذاری نقشه سایت عمومی ممکن نشد.');
    const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('ساختار XML نقشه سایت معتبر نیست.');
    return Array.from(xml.getElementsByTagName('url')).map((entry) => ({ url: entry.getElementsByTagName('loc')[0]?.textContent ?? '', modified: entry.getElementsByTagName('lastmod')[0]?.textContent ?? '' }));
  });
  const byPath = new Map(documents.map((document) => [documentPublicPath(document.kind, document.slug), document]));
  return <><p className="mb-3 text-body-sm text-fg-tertiary">این فهرست از XML عمومی و نسخه واقعاً منتشرشده خوانده می‌شود. نامک ذخیره‌شده پیش‌نویس، محتوای بایگانی‌شده و صفحات noindex در آن وارد نمی‌شوند.</p><Button variant="secondary" size="sm" className="mb-3" loading={sitemap.loading} onClick={sitemap.reload}>تازه‌سازی نقشه سایت</Button><Loaded load={sitemap}>{(entries) => {
    const published = entries.flatMap((entry) => { try { const path = decodeURIComponent(new URL(entry.url).pathname); const document = byPath.get(path); return document && !document.seo.noIndex ? [{ ...entry, document }] : []; } catch { return []; } });
    return published.length ? <ul className="space-y-2 text-body-sm">{published.map((entry) => <li key={entry.document.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-canvas p-3"><a href={documentPublicPath(entry.document.kind, entry.document.slug)!} target="_blank" rel="noreferrer" className="text-fg-brand hover:underline">{entry.document.title}</a><div className="text-end"><bdi className="break-all text-caption text-fg-tertiary">{entry.url}</bdi>{entry.modified && <p className="mt-1 text-caption text-fg-tertiary">آخرین تغییر عمومی: <time dateTime={entry.modified}>{new Date(entry.modified).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })}</time></p>}</div></li>)}</ul> : <p className="text-body-sm text-fg-tertiary">هنوز صفحه منتشرشده و قابل ایندکس در نقشه سایت وجود ندارد.</p>;
  }}</Loaded></>;
}

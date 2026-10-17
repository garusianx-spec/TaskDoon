'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import type { PublishedSiteDocument, SiteContent, SiteDocument, SiteRedirect } from '@taskin/contracts';
import { siteApi } from '@/admin/site-api';
import { useAdmin } from '@/admin/AdminSession';
import { useAdminLoad } from '@/admin/use-admin-load';
import { problemMessage } from '@/api/messages';
import { Loaded, PageHeader, Panel, TABLE, TableFrame, TD, TH } from '@/components/admin/AdminUi';
import { Badge, Button, Input, Modal } from '@/components/ui';
import { SiteSitemapPreview } from './SiteSitemapPreview';
import { SiteStructuredCheck } from './SiteStructuredCheck';
import { documentPublicPath } from './site-content';

const CORE_PATHS = new Set(['/login', '/feed', '/reset-password']);

function collectLinks(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(collectLinks);
  return Object.entries(value).flatMap(([key, entry]) => key === 'href' && typeof entry === 'string' ? [entry] : collectLinks(entry));
}

function imageWarnings(content: SiteContent): string[] {
  const warnings: string[] = [];
  content.sections.filter((section) => section.visible).forEach((section, index) => {
    if (section.media?.src && !section.media.alt.trim()) warnings.push(`بخش ${index + 1}: تصویر بدون متن جایگزین`);
    section.items?.forEach((item, i) => { if (item.media?.src && !item.media.alt.trim()) warnings.push(`بخش ${index + 1}، مورد ${i + 1}: تصویر بدون متن جایگزین`); });
  });
  const cover = content.data.cover as { src?: string; alt?: string } | undefined;
  if (cover?.src && !cover.alt?.trim()) warnings.push('تصویر جلد بدون متن جایگزین');
  return warnings;
}

function diagnostics(documents: SiteDocument[], publicDocuments: PublishedSiteDocument[]) {
  const titles = new Map<string, number>();
  for (const document of documents) { const title = document.draft.seo.title?.trim(); if (title) titles.set(title, (titles.get(title) ?? 0) + 1); }
  const paths = new Set(publicDocuments.map((document) => documentPublicPath(document.kind, document.slug)).filter((path): path is string => !!path));
  return documents.filter((document) => document.status !== 'archived' && documentPublicPath(document.kind, document.slug)).map((document) => {
    const { draft } = document;
    const warnings: string[] = [];
    if (!draft.seo.title?.trim()) warnings.push('عنوان اختصاصی سئو وارد نشده');
    else if ((titles.get(draft.seo.title.trim()) ?? 0) > 1) warnings.push('عنوان سئو در محتوای دیگری تکرار شده');
    if (!draft.seo.description?.trim()) warnings.push('توضیحات متا وارد نشده');
    if (draft.seo.title && draft.seo.title.length > 70) warnings.push('عنوان طولانی است و ممکن است در نتایج کوتاه شود');
    if (draft.seo.description && draft.seo.description.length > 170) warnings.push('توضیحات طولانی است و ممکن است در نتایج کوتاه شود');
    warnings.push(...imageWarnings(draft));
    const internal = [...new Set(collectLinks({ sections: draft.sections, data: draft.data, breadcrumbs: draft.seo.breadcrumbs }))].filter((href) => href.startsWith('/') && !href.startsWith('//'));
    for (const href of internal) { const path = href.split(/[?#]/)[0] || '/'; if (!paths.has(path) && !CORE_PATHS.has(path)) warnings.push(`پیوند داخلی بدون مقصد منتشرشده: ${href}`); }
    if (draft.seo.canonical && !/^https:\/\//.test(draft.seo.canonical)) warnings.push('برای canonical نشانی کامل دامنه اصلی توصیه می‌شود');
    if (document.kind === 'article' && !draft.data.author) warnings.push('نویسنده تأییدشده درج نشده؛ نباید نویسنده ساختگی در داده ساختاریافته درج شود');
    return { document, warnings };
  });
}

export function SiteSeo() {
  const { call } = useAdmin();
  const load = useAdminLoad('site-seo', async () => { const [documents, redirects, publicDocuments] = await Promise.all([siteApi.documents(), siteApi.redirects(), siteApi.publicDocuments()]); return { documents, redirects, publicDocuments }; });
  const [query, setQuery] = useState('');
  const [fromPath, setFrom] = useState('');
  const [toPath, setTo] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState<SiteRedirect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const reports = useMemo(() => diagnostics(load.data?.documents ?? [], load.data?.publicDocuments ?? []), [load.data]);
  const submit = (event: FormEvent) => { event.preventDefault(); setError(''); setDeleting(null); setConfirm(true); };
  const redirect = async () => {
    setBusy(true); setError('');
    try { await call(async () => { if (deleting) await siteApi.deleteRedirect(deleting.id); else await siteApi.createRedirect({ fromPath, toPath }); }); setFrom(''); setTo(''); setConfirm(false); setNotice(deleting ? 'تغییر مسیر حذف شد.' : 'تغییر مسیر دائمی ذخیره شد.'); setDeleting(null); load.reload(); } catch (cause) { setError(problemMessage(cause)); } finally { setBusy(false); }
  };
  return <><PageHeader title="سئو و سلامت محتوای وب‌سایت" description="بررسی‌های محلی و قابل مشاهده؛ این گزارش امتیاز رتبه‌بندی یا داده Google نیست." actions={<><Link href="/admin/site/settings" className="text-body-sm font-semibold text-fg-brand hover:underline">تنظیمات متادیتای عمومی</Link><a href="/sitemap.xml" target="_blank" rel="noreferrer" className="text-body-sm font-semibold text-fg-brand hover:underline">نقشه سایت XML ↗</a></>} /><Panel title="بازبینی متادیتا و پیوندها"><Input label="جستجوی عنوان یا نامک" value={query} onChange={(event) => setQuery(event.target.value)} /><p className="my-3 text-caption text-fg-tertiary">هشدارها بر اساس پیش‌نویس هستند. متن عمومی و نقشه سایت فقط از نسخه منتشرشده استفاده می‌کنند. نبود عنوان اختصاصی با عنوان محتوا جایگزین می‌شود.</p><Loaded load={load}>{() => <div className="space-y-3">{reports.filter(({ document }) => `${document.title} ${document.slug}`.includes(query)).map(({ document, warnings }) => <div key={document.id} className="rounded-lg border border-secondary p-4"><div className="flex flex-wrap items-center justify-between gap-2"><Link href={`/admin/site/pages/${document.id}`} className="font-semibold text-fg-brand hover:underline">{document.title}</Link><Badge tone={document.draft.seo.noIndex ? 'neutral' : 'brand'}>{document.draft.seo.noIndex ? 'noindex' : 'قابل ایندکس پس از انتشار'}</Badge></div><div className="mt-3 rounded-lg bg-canvas p-3"><p className="text-body font-semibold text-fg-brand">{document.draft.seo.title || document.title}</p><p dir="ltr" className="mt-1 break-all text-caption text-fg-tertiary">{document.draft.seo.canonical || documentPublicPath(document.kind, document.slug)}</p><p className="mt-1 text-body-sm text-fg-secondary">{document.draft.seo.description || document.draft.description}</p></div>{warnings.length ? <ul className="mt-3 list-inside list-disc space-y-1 text-body-sm text-status-progress">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="mt-3 text-body-sm text-status-done">در بررسی محلی عنوان، توضیحات، تصاویر و پیوندها موردی یافت نشد.</p>}</div>)}</div>}</Loaded></Panel><Panel title="تغییر مسیر دائمی"><p className="mb-4 text-body-sm text-fg-tertiary">برای نشانی‌های قدیمی تغییر مسیر ۳۰۸ تعریف کنید. تغییر نامک محتوای منتشرشده به‌صورت خودکار تغییر مسیر ایجاد می‌کند.</p><form onSubmit={submit} className="flex flex-wrap items-end gap-3"><Input label="نشانی قبلی" dir="ltr" required placeholder="/old-page" value={fromPath} onChange={(event) => setFrom(event.target.value)} containerClassName="min-w-48 flex-1" /><Input label="مقصد" dir="ltr" required placeholder="/new-page" value={toPath} onChange={(event) => setTo(event.target.value)} containerClassName="min-w-48 flex-1" /><Button type="submit">ثبت تغییر مسیر</Button></form>{notice && <p role="status" className="mt-3 text-body-sm text-status-done">{notice}</p>}<Loaded load={load}>{({ redirects }) => redirects.length ? <div className="mt-4"><TableFrame label="تغییر مسیرهای وب‌سایت"><table className={TABLE}><thead><tr><th className={TH}>مبدأ</th><th className={TH}>مقصد</th><th className={TH}>نوع</th><th className={TH}>ویرایش</th></tr></thead><tbody>{redirects.map((entry) => <tr key={entry.id}><td className={TD} dir="ltr">{entry.fromPath}</td><td className={TD} dir="ltr">{entry.toPath}</td><td className={TD}>۳۰۸ دائمی</td><td className={TD}><Button size="xs" variant="ghost" onClick={() => { setFrom(entry.fromPath); setTo(entry.toPath); }}>تغییر مقصد</Button><Button size="xs" variant="ghost" onClick={() => { setDeleting(entry); setConfirm(true); setError(''); }}>حذف</Button></td></tr>)}</tbody></table></TableFrame></div> : <p className="mt-4 text-body-sm text-fg-tertiary">تغییر مسیری ثبت نشده است.</p>}</Loaded></Panel><Panel title="پیش‌نمایش نقشه سایت و canonical"><Loaded load={load}>{({ publicDocuments }) => <SiteSitemapPreview documents={publicDocuments} />}</Loaded></Panel><Panel title="داده ساختاریافته و اندازه‌گیری">{load.data && <SiteStructuredCheck documents={load.data.publicDocuments} />}<ul className="list-inside list-disc space-y-2 text-body-sm leading-7 text-fg-secondary"><li>Organization و WebSite باید فقط نام و نشانی واقعی سایت را داشته باشند.</li><li>BreadcrumbList از مسیرهای راهنمای تعریف‌شده در ویرایشگر تولید می‌شود.</li><li>Article فقط برای مقاله منتشرشده با اطلاعات واقعی نویسنده و تاریخ درج می‌شود.</li><li>بدون داده تأییدشده، Review، AggregateRating یا Offer نباید درج شود.</li><li>ثبت Search Console، بررسی Rich Results و داده واقعی Core Web Vitals به دامنه عملیاتی نیاز دارد و در این محیط تأیید نشده است.</li></ul><div className="mt-4 flex flex-wrap gap-4"><a href="https://search.google.com/test/rich-results" target="_blank" rel="noreferrer" className="text-body-sm font-semibold text-fg-brand hover:underline">آزمون رسمی Rich Results ↗</a><a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="text-body-sm font-semibold text-fg-brand hover:underline">Search Console ↗</a></div></Panel><Modal open={confirm} onClose={() => { if (!busy) setConfirm(false); }} title={deleting ? "حذف تغییر مسیر دائمی؟" : "ثبت تغییر مسیر دائمی؟"} size="sm" footer={<><Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>انصراف</Button><Button variant={deleting ? 'destructive' : 'primary'} loading={busy} onClick={() => void redirect()}>{deleting ? 'حذف تغییر مسیر' : 'ثبت تغییر مسیر'}</Button></>}><p className="text-body-sm leading-7 text-fg-secondary">{deleting ? <>تغییر مسیر از <bdi>{deleting.fromPath}</bdi> به <bdi>{deleting.toPath}</bdi> حذف می‌شود.</> : <>درخواست‌های <bdi>{fromPath}</bdi> به <bdi>{toPath}</bdi> هدایت می‌شوند.</>} تغییر مسیر دائمی می‌تواند در مرورگر و موتور جستجو ذخیره شود.</p>{error && <p role="alert" className="mt-3 text-body-sm text-status-blocked">{error}</p>}</Modal></>;
}

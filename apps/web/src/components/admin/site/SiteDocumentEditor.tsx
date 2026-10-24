'use client';

import Link from 'next/link';
import { TASKDOON_HOME_SECTIONS } from '@taskin/contracts';
import '@/components/marketing/homepage.css';
import '@/components/marketing/shell-motion.css';
import { useEffect, useState } from 'react';
import type { PublishedSiteDocument, SiteContent, SiteDocument, SiteRevision } from '@taskin/contracts';
import { siteApi } from '@/admin/site-api';
import { useAdmin } from '@/admin/AdminSession';
import { useAdminLoad } from '@/admin/use-admin-load';
import { problemMessage } from '@/api/messages';
import { Loaded, PageHeader, Panel } from '@/components/admin/AdminUi';
import { Badge, Button, Input, Modal, RelativeTime, Textarea } from '@/components/ui';
import { KINDS, SeoFields } from './SiteFields';
import { SiteDataEditor } from './SiteDataEditor';
import { SiteSectionEditor } from './SiteSectionEditor';
import { normalizeContent } from './site-content';
import { PricingPlans } from '@/components/marketing/PricingPlans';
import { FaqList } from '@/components/marketing/FaqList';
import { SectionRenderer } from '@/components/marketing/Sections';

type Pending = { type: 'publish' | 'unpublish' | 'archive' } | { type: 'restore'; revision: SiteRevision };

export function SiteDocumentEditor({ id }: { id: string }) {
  const page = useAdminLoad(`site-document:${id}`, () => siteApi.document(id));
  return <Loaded load={page}>{(document) => <Editor key={`${document.id}:${document.version}`} original={document} onSaved={() => page.reload()} />}</Loaded>;
}

function Editor({ original, onSaved }: { original: SiteDocument; onSaved: () => void }) {
  const { call } = useAdmin();
  const [document, setDocument] = useState(original);
  const [content, setContent] = useState<SiteContent>(structuredClone(original.draft));
  const [slug, setSlug] = useState(original.slug);
  const [active, setActive] = useState<'content' | 'details' | 'seo' | 'history'>('content');
  const [templateConfirm, setTemplateConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [preview, setPreview] = useState<PublishedSiteDocument | null>(null);
  const [previewContext, setPreviewContext] = useState<PublishedSiteDocument[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const dirty = slug !== document.slug || JSON.stringify(content) !== JSON.stringify(document.draft);
  const revisions = useAdminLoad(active === 'history' ? `site-revisions:${document.id}:${document.version}` : null, () => siteApi.revisions(document.id));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (cause) { setError(problemMessage(cause, 'ثبت تغییرات ممکن نشد.')); } finally { setBusy(false); }
  };
  const save = async () => {
    const saved = await call(() => siteApi.save(document.id, { kind: document.kind, slug, draft: normalizeContent(content), version: document.version }));
    setDocument(saved); setContent(structuredClone(saved.draft)); setSlug(saved.slug);
    setNotice('پیش‌نویس ذخیره شد. نسخه عمومی تا زمان انتشار تغییر نمی‌کند.');
    return saved;
  };
  const action = async () => {
    if (!pending) return;
    if (pending.type === 'publish' && dirty) throw new Error('ابتدا تغییرات پیش‌نویس را ذخیره کنید.');
    const saved = await call(() => pending.type === 'restore' ? siteApi.restore(document.id, pending.revision.id) : siteApi[pending.type](document.id));
    setDocument(saved); setContent(structuredClone(saved.draft)); setSlug(saved.slug);
    setNotice(pending.type === 'restore' ? 'نسخه قبلی به پیش‌نویس بازیابی شد. برای نمایش عمومی آن را منتشر کنید.' : pending.type === 'publish' ? 'محتوا منتشر شد؛ نسخه عمومی و متادیتا به‌روز شدند.' : pending.type === 'archive' ? 'محتوا بایگانی شد و در وب‌سایت نمایش داده نمی‌شود.' : 'انتشار محتوا لغو شد.');
    setPending(null); onSaved();
  };
  const showPreview = async () => {
    setPreviewOpen(true); setPreviewError(''); setPreview(null);
    try { const saved = dirty ? await save() : document; const [snapshot, related] = await call(() => Promise.all([siteApi.preview(saved.id), siteApi.publicDocuments()])); setPreviewContext(related.filter((entry) => entry.id !== snapshot.id)); setPreview({ ...snapshot.draft, id: snapshot.id, kind: snapshot.kind, slug: snapshot.slug, version: snapshot.version, updatedAt: snapshot.updatedAt, publishedAt: snapshot.publishedAt ?? snapshot.updatedAt }); } catch (cause) { setPreviewError(problemMessage(cause)); }
  };
  const publicPath = document.kind === 'feature' ? `/features/${document.slug}` : document.kind === 'article' ? `/blog/${document.slug}` : document.kind === 'help' ? `/help/${document.slug}` : document.kind === 'job' ? `/careers/${document.slug}` : document.slug === 'home' ? '/' : `/${document.slug}`;
  return <><PageHeader title={content.title || 'ویرایش محتوا'} description={`${KINDS[document.kind]} · نسخه ${document.version} · تغییر پیش‌نویس مستقل از محتوای منتشرشده`} actions={<><Link href="/admin/site/pages" className="rounded-lg px-3 py-2 text-body-sm text-fg-brand hover:bg-hover">بازگشت به فهرست</Link><Button variant="secondary" loading={busy} onClick={() => void run(showPreview)} data-testid="site-preview">پیش‌نمایش امن</Button><Button loading={busy} onClick={() => void run(async () => { await save(); })} data-testid="site-save">ذخیره پیش‌نویس</Button><Button variant="tertiary" disabled={busy || dirty || content.data.approvalRequired === true || document.kind === 'page' && ['terms', 'privacy'].includes(slug) && content.data.legalApproved !== true} onClick={() => setPending({ type: 'publish' })} data-testid="site-publish">انتشار</Button></>} /><div className="mb-4 flex flex-wrap items-center gap-3 text-body-sm"><Badge tone={document.status === 'published' ? 'success' : document.status === 'archived' ? 'neutral' : 'warning'}>{document.status === 'published' ? 'منتشرشده' : document.status === 'archived' ? 'بایگانی' : 'پیش‌نویس'}</Badge>{dirty && <span className="text-status-progress">تغییرات ذخیره‌نشده</span>}<span className="text-fg-tertiary">آخرین ذخیره: <RelativeTime iso={document.updatedAt} /></span>{document.published && ['page', 'article', 'feature', 'help', 'job'].includes(document.kind) && <Link href={publicPath} target="_blank" className="text-fg-brand hover:underline">مشاهده نسخه عمومی ↗</Link>}</div>{notice && <p role="status" className="mb-4 rounded-lg bg-status-done-subtle p-3 text-body-sm text-status-done">{notice}</p>}{error && <p role="alert" className="mb-4 rounded-lg bg-status-blocked-subtle p-3 text-body-sm text-status-blocked">{error}</p>}{content.data.approvalRequired === true && <p className="mb-4 rounded-lg bg-status-progress-subtle p-3 text-body-sm text-status-progress">این سند نیازمند تأیید حقوقی یا کسب‌وکار است. پس از دریافت تأیید، گزینه مربوط را در اطلاعات اختصاصی به‌روز کنید.</p>}<div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-secondary bg-surface p-1" role="tablist" aria-label="بخش‌های ویرایشگر">{([{ id: 'content', label: 'محتوا و بخش‌ها' }, { id: 'details', label: 'اطلاعات اختصاصی' }, { id: 'seo', label: 'سئو و اشتراک‌گذاری' }, { id: 'history', label: 'تاریخچه نسخه‌ها' }] as const).map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} onClick={() => setActive(tab.id)} className={`shrink-0 rounded-lg px-4 py-2 text-body-sm font-semibold ${active === tab.id ? 'bg-brand-subtle text-fg-brand' : 'text-fg-tertiary hover:bg-hover'}`}>{tab.label}</button>)}</div>{active === 'content' && <><Panel title="اطلاعات پایه"><div className="grid gap-4 sm:grid-cols-2"><Input label="عنوان محتوا" value={content.title} onChange={(event) => setContent({ ...content, title: event.target.value })} data-testid="site-title" required /><Input label="نامک / نشانی" dir="ltr" hint="home برای صفحه اصلی؛ تغییر نامک منتشرشده، تغییر مسیر دائمی ایجاد می‌کند." value={slug} onChange={(event) => setSlug(event.target.value)} data-testid="site-slug" required /></div><Textarea containerClassName="mt-4" label="توضیح کوتاه" value={content.description} onChange={(event) => setContent({ ...content, description: event.target.value })} /></Panel><Panel title="بخش‌های صفحه">{document.kind === 'page' && slug === 'home' && <div className="mb-4 rounded-lg border border-secondary p-4"><Button variant="secondary" onClick={() => setTemplateConfirm(true)} data-testid="site-home-template">بارگذاری قالب صفحه اصلی از طرح</Button><p className="mt-2 text-caption text-fg-tertiary">بخش‌های پیش‌نویس با قالب طرح جایگزین می‌شوند. نسخه عمومی تا انتشار تغییر نمی‌کند.</p></div>}<SiteSectionEditor sections={content.sections} onChange={(sections) => setContent({ ...content, sections })} /></Panel></>}{active === 'details' && <Panel title={`اطلاعات ${KINDS[document.kind]}`}><SiteDataEditor kind={document.kind} slug={slug} data={content.data} onChange={(data) => setContent({ ...content, data })} /></Panel>}{active === 'seo' && <Panel title="متادیتا و تنظیمات ایندکس"><SeoFields seo={content.seo} slug={slug} title={content.title} description={content.description} onChange={(seo) => setContent({ ...content, seo })} /></Panel>}{active === 'history' && <Panel title="نسخه‌های ذخیره‌شده"><Loaded load={revisions} empty={(entries) => entries.length === 0}>{(entries) => <ul className="divide-y divide-secondary">{entries.map((revision) => <li key={revision.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-body-sm font-semibold text-fg-primary">نسخه {revision.version} · {revision.content.title}</p><p className="mt-1 text-caption text-fg-tertiary"><RelativeTime iso={revision.createdAt} /> · {revision.action} · ویرایشگر {revision.actorId ?? 'سیستم'}</p></div><Button variant="secondary" size="sm" data-testid="site-restore" onClick={() => setPending({ type: 'restore', revision })}>بازیابی به پیش‌نویس</Button></li>)}</ul>}</Loaded></Panel>}<Panel title="چرخه انتشار"><div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={!document.published || busy} onClick={() => setPending({ type: 'unpublish' })}>لغو انتشار</Button><Button variant="ghost" disabled={document.status === 'archived' || busy} onClick={() => setPending({ type: 'archive' })}>بایگانی محتوا</Button></div><p className="mt-3 text-caption text-fg-tertiary">انتشار فقط نسخه ذخیره‌شده را عمومی می‌کند. بایگانی و لغو انتشار، دسترسی عمومی را متوقف می‌کنند. عملیات در گزارش فعالیت ثبت می‌شود.</p></Panel><Modal open={pending !== null} onClose={() => { if (!busy) setPending(null); }} title={pending?.type === 'restore' ? 'بازیابی نسخه قبلی؟' : pending?.type === 'publish' ? 'انتشار نسخه ذخیره‌شده؟' : pending?.type === 'archive' ? 'بایگانی محتوا؟' : 'لغو انتشار محتوا؟'} size="sm" dismissOnOverlayClick={false} footer={<><Button variant="secondary" disabled={busy} onClick={() => setPending(null)}>انصراف</Button><Button variant={pending?.type === 'publish' ? 'primary' : 'destructive'} loading={busy} onClick={() => void run(action)} data-testid="site-confirm">تأیید</Button></>}><p className="text-body-sm leading-7 text-fg-secondary">{pending?.type === 'restore' ? 'نسخه انتخاب‌شده جایگزین پیش‌نویس فعلی می‌شود. تغییرات ذخیره‌نشده از بین می‌روند؛ نسخه عمومی تا انتشار بعدی ثابت می‌ماند.' : pending?.type === 'publish' ? 'این نسخه برای همه بازدیدکنندگان عمومی خواهد شد. متن، قیمت‌ها و ادعاهای این محتوا را بررسی کرده‌اید؟' : 'این محتوا از دسترس عمومی وب‌سایت خارج می‌شود. نسخه‌های پیشین در تاریخچه باقی می‌مانند.'}</p></Modal><Modal open={templateConfirm} onClose={() => setTemplateConfirm(false)} title="جایگزینی بخش‌های پیش‌نویس صفحه اصلی؟" size="sm" footer={<><Button variant="secondary" onClick={() => setTemplateConfirm(false)}>انصراف</Button><Button onClick={() => { setContent({ ...content, sections: structuredClone(TASKDOON_HOME_SECTIONS) }); setTemplateConfirm(false); setNotice('قالب در پیش‌نویس بارگذاری شد. محتوا را بررسی و سپس ذخیره کنید.'); }}>جایگزینی بخش‌های پیش‌نویس</Button></>}><p className="text-body-sm leading-7">بخش‌های فعلی و تغییرات ذخیره‌نشده آن‌ها جایگزین می‌شوند. این اقدام ذخیره یا منتشر نمی‌کند. نسخه‌های ذخیره‌شده از تاریخچه قابل بازیابی‌اند.</p></Modal><Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="پیش‌نمایش خصوصی پیش‌نویس" description="این پیش‌نمایش از API محافظت‌شده مدیر بارگذاری می‌شود و پیوند عمومی ندارد." size="full"><div data-testid="site-preview-content">{previewError ? <p role="alert" className="text-body-sm text-status-blocked">{previewError}</p> : preview ? <article className="marketing-site overflow-hidden rounded-xl border border-secondary bg-canvas" onSubmitCapture={(event) => { event.preventDefault(); event.stopPropagation(); }}><header className="px-6 py-8"><h1 className="text-2xl font-bold text-fg-primary">{preview.title}</h1><p className="mt-3 text-body text-fg-secondary">{preview.description}</p></header>{preview.sections.map((section) => <SectionRenderer key={section.id} section={section} documents={[...previewContext, preview]} isPrimary={false} />)}{preview.kind === 'pricing' && <div className="p-6"><PricingPlans documents={[preview]} /></div>}{preview.kind === 'faq' && <div className="p-6"><FaqList documents={[preview]} /></div>}</article> : <p role="status" className="p-8 text-center text-body-sm text-fg-tertiary">در حال بارگذاری پیش‌نمایش…</p>}</div></Modal></>;
}

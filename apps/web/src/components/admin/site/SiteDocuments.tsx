'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { SiteContent, SiteDocumentKind } from '@taskin/contracts';
import { siteApi } from '@/admin/site-api';
import { useAdmin } from '@/admin/AdminSession';
import { useAdminLoad } from '@/admin/use-admin-load';
import { problemMessage } from '@/api/messages';
import { Loaded, PageHeader, Panel, TABLE, TableFrame, TD, TH } from '@/components/admin/AdminUi';
import { Badge, Button, Input, Modal, RelativeTime, Select, Textarea } from '@/components/ui';
import { KINDS } from './SiteFields';
import { SiteDataEditor } from './SiteDataEditor';
import { initialContent, normalizeContent } from './site-content';

export function SiteDocuments({ kind, title }: { kind?: SiteDocumentKind; title: string }) {
  const router = useRouter();
  const { call } = useAdmin();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [creating, setCreating] = useState(false);
  const [newKind, setNewKind] = useState<SiteDocumentKind>(kind ?? 'page');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState<SiteContent>(initialContent(kind ?? 'page'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const page = useAdminLoad(`site-documents:${kind ?? 'all'}:${search}`, () => siteApi.documents({ kind, q: search }));
  const create = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const document = await call(() => siteApi.create({ kind: newKind, slug, draft: normalizeContent(content) })); router.push(`/admin/site/pages/${document.id}`); } catch (cause) { setError(problemMessage(cause)); } finally { setBusy(false); }
  };
  return <><PageHeader title={title} description="محتوای وب‌سایت در پایگاه داده ذخیره می‌شود. تغییر پیش‌نویس، نسخه منتشرشده را تغییر نمی‌دهد." actions={<Button onClick={() => { setSlug(''); setContent(initialContent(kind ?? 'page')); setNewKind(kind ?? 'page'); setError(''); setCreating(true); }}>ایجاد {kind ? KINDS[kind] : 'محتوا'}</Button>} /><Panel title="جستجو و فیلتر"><form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setSearch(query); if (query === search) page.reload(); }}><Input label="عنوان یا نامک" value={query} onChange={(event) => setQuery(event.target.value)} containerClassName="min-w-48 flex-1" /><Select className="w-44" label="وضعیت انتشار" hideLabel={false} value={status} onValueChange={setStatus} options={[{ value: 'all', label: 'همه وضعیت‌ها' }, { value: 'published', label: 'منتشرشده' }, { value: 'draft', label: 'پیش‌نویس' }, { value: 'archived', label: 'بایگانی' }]} /><Button type="submit" variant="secondary">جستجو</Button></form></Panel><Panel title="محتوا"><Loaded load={page}>{(documents) => { const shown = documents.filter((document) => status === 'all' || document.status === status); return shown.length ? <TableFrame label={title}><table className={TABLE}><thead><tr><th className={TH}>عنوان</th><th className={TH}>نامک</th><th className={TH}>نوع</th><th className={TH}>وضعیت</th><th className={TH}>آخرین تغییر</th><th className={TH}>نسخه</th></tr></thead><tbody>{shown.map((document) => <tr key={document.id}><td className={TD}><Link href={`/admin/site/pages/${document.id}`} className="font-semibold text-fg-brand hover:underline">{document.title}</Link><p className="mt-1 max-w-sm truncate text-caption text-fg-tertiary">{document.draft.description}</p></td><td className={TD}><span dir="ltr">{document.slug}</span></td><td className={TD}>{KINDS[document.kind]}</td><td className={TD}><Badge tone={document.status === 'published' ? 'success' : document.status === 'archived' ? 'neutral' : 'warning'}>{document.status === 'published' ? 'منتشرشده' : document.status === 'archived' ? 'بایگانی' : 'پیش‌نویس'}</Badge></td><td className={TD}><RelativeTime iso={document.updatedAt} /></td><td className={TD}>{document.version}</td></tr>)}</tbody></table></TableFrame> : <div className="py-10 text-center"><p className="font-semibold text-fg-secondary">محتوایی پیدا نشد</p><p className="mt-2 text-body-sm text-fg-tertiary">فیلترها را تغییر دهید یا اولین محتوا را به صورت پیش‌نویس ایجاد کنید.</p></div>; }}</Loaded></Panel><Modal open={creating} onClose={() => { if (!busy) setCreating(false); }} title="ایجاد پیش‌نویس جدید" size="lg" footer={<><Button variant="secondary" disabled={busy} onClick={() => setCreating(false)}>انصراف</Button><Button type="submit" form="site-create" loading={busy}>ایجاد پیش‌نویس</Button></>}><form id="site-create" onSubmit={(event) => void create(event)} className="space-y-4">{!kind && <Select label="نوع محتوا" hideLabel={false} value={newKind} onValueChange={(value) => { setNewKind(value); setContent(initialContent(value)); }} options={Object.entries(KINDS).map(([value, label]) => ({ value: value as SiteDocumentKind, label }))} />}<Input label="عنوان" required maxLength={300} value={content.title} onChange={(event) => setContent({ ...content, title: event.target.value })} /><Input label="نامک" required maxLength={160} dir="ltr" hint="حروف فارسی یا انگلیسی، عدد، خط تیره و زیرخط؛ بدون فاصله یا /" value={slug} onChange={(event) => setSlug(event.target.value)} /><Textarea label="توضیح کوتاه" value={content.description} onChange={(event) => setContent({ ...content, description: event.target.value })} /><SiteDataEditor kind={newKind} slug={slug} data={content.data} onChange={(data) => setContent({ ...content, data })} />{error && <p role="alert" className="text-body-sm text-status-blocked">{error}</p>}</form></Modal></>;
}

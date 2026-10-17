'use client';

import Image from 'next/image';
import { useState, type FormEvent } from 'react';
import type { SiteMedia } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { useAdmin } from '@/admin/AdminSession';
import { bytesLabel, dateTimeLabel } from '@/admin/format';
import { siteApi } from '@/admin/site-api';
import { useAdminLoad } from '@/admin/use-admin-load';
import { problemMessage } from '@/api/messages';
import { Badge, Button, Input, Modal, Select } from '@/components/ui';
import { Loaded, PageHeader, Panel } from '../AdminUi';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, readonly string[]> = { 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'], 'image/gif': ['gif'] };
const PAGE_SIZE = 24;
type ArchiveFilter = 'active' | 'archived' | 'all';

export function SiteMediaLibrary() {
  return <MediaBrowser />;
}

/** Reuses the administrator's media library inside a document editor. */
export function MediaPicker({ onSelect }: { readonly onSelect: (media: SiteMedia) => void }) {
  return <MediaBrowser onSelect={onSelect} />;
}

function MediaBrowser({ onSelect }: { readonly onSelect?: (media: SiteMedia) => void }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ArchiveFilter>('active');
  const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<SiteMedia | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const media = useAdminLoad(search, () => siteApi.media(search || undefined));
  const changed = (message: string) => { setNotice(message); media.reload(); };

  return (
    <>
      <PageHeader title={onSelect ? 'انتخاب رسانه' : 'کتابخانه رسانه'} description="تصاویر سایت و متن جایگزین آن‌ها را مدیریت کنید." actions={<Button onClick={() => setUploadOpen(true)}>بارگذاری تصویر</Button>} />
      {notice && <p role="status" className="mb-4 rounded-lg bg-status-done-subtle px-3 py-2 text-body-sm text-status-done">{notice}</p>}
      <Panel title="تصاویر" actions={<Button variant="secondary" size="sm" loading={media.loading} onClick={media.reload}>تازه‌سازی</Button>}>
        <form className="mb-5 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); setPage(1); }}>
          <Input label="جستجوی رسانه" type="search" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام فایل یا متن جایگزین" containerClassName="min-w-48 flex-1" />
          {!onSelect && <Select<ArchiveFilter> className="sm:max-w-48" label="وضعیت رسانه" hideLabel={false} value={filter} onValueChange={(value) => { setFilter(value); setPage(1); }} options={[{ value: 'active', label: 'تصاویر فعال' }, { value: 'archived', label: 'بایگانی‌شده' }, { value: 'all', label: 'همه تصاویر' }]} />}
          <Button type="submit" variant="secondary">جستجو</Button>
        </form>
        <Loaded load={media}>
          {(data) => {
            const items = data.filter((item) => (onSelect || filter === 'active') ? !item.archivedAt : filter === 'archived' ? Boolean(item.archivedAt) : true);
            const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
            const currentPage = Math.min(page, totalPages);
            return items.length === 0 ? <p className="py-6 text-center text-body-sm text-fg-tertiary">تصویری پیدا نشد. یک تصویر بارگذاری کنید یا فیلتر جستجو را تغییر دهید.</p> : (
              <div aria-busy={media.loading}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((item) => (
                    <article key={item.id} className="overflow-hidden rounded-xl border border-secondary bg-surface">
                      <div className="relative aspect-video overflow-hidden bg-sunken"><Image src={item.src} alt={item.alt} fill unoptimized className="object-contain" sizes="(max-width: 640px) 100vw, 33vw" /></div>
                      <div className="flex flex-col gap-2 p-3">
                        <p dir="auto" className="truncate text-body-sm font-medium text-fg-primary" title={item.filename}>{item.filename}</p>
                        <p className="line-clamp-2 min-h-8 text-caption text-fg-tertiary">{item.alt || 'بدون متن جایگزین (تصویر تزئینی)'}</p>
                        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-caption text-fg-tertiary">{bytesLabel(item.size)}</span>{item.archivedAt && <Badge>بایگانی‌شده</Badge>}</div>
                        <div className="flex flex-wrap gap-2">
                          {onSelect && <Button size="sm" disabled={media.loading} onClick={() => onSelect(item)}>انتخاب تصویر</Button>}
                          <Button variant="secondary" size="sm" disabled={media.loading} aria-label={`ویرایش ${item.filename}`} onClick={() => setSelected(item)}>جزئیات و ویرایش</Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-caption text-fg-tertiary">{toPersianDigits(items.length)} تصویر · صفحه {toPersianDigits(currentPage)} از {toPersianDigits(totalPages)}</p><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={currentPage <= 1 || media.loading} onClick={() => setPage(currentPage - 1)}>قبلی</Button><Button variant="secondary" size="sm" disabled={currentPage >= totalPages || media.loading} onClick={() => setPage(currentPage + 1)}>بعدی</Button></div></div>
              </div>
            );
          }}
        </Loaded>
      </Panel>
      {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} onUploaded={() => { setUploadOpen(false); setFilter('active'); setPage(1); changed('تصویر با موفقیت بارگذاری شد.'); }} />}
      {selected && <MediaDetails key={selected.id} media={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); changed('اطلاعات تصویر به‌روزرسانی شد.'); }} />}
    </>
  );
}

function fileError(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_TYPES[file.type]?.includes(extension)) return 'فایل باید تصویر PNG، JPEG، WebP یا GIF با پسوند معتبر باشد.';
  if (file.size === 0 || file.size > MAX_FILE_SIZE) return 'اندازه تصویر باید بیشتر از صفر و حداکثر ۱۰ مگابایت باشد.';
  if (file.name.length > 255 || /[/\\\u0000-\u001f\u007f]/u.test(file.name)) return 'نام فایل معتبر نیست. نامی کوتاه‌تر و بدون نویسه‌های کنترلی انتخاب کنید.';
  return null;
}

function UploadDialog({ onClose, onUploaded }: { readonly onClose: () => void; readonly onUploaded: () => void }) {
  const { call } = useAdmin();
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = () => { if (!busy) onClose(); };
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || busy) return;
    const invalid = fileError(file);
    if (invalid) { setError(invalid); return; }
    setBusy(true);
    setError(null);
    try {
      setStage('آماده‌سازی بارگذاری…');
      const pending = await call(() => siteApi.mediaUpload({ filename: file.name, contentType: file.type, size: file.size, alt: alt.trim() }));
      const form = new FormData();
      for (const [key, value] of Object.entries(pending.upload.fields)) form.append(key, value);
      form.set('Content-Type', file.type);
      form.append('file', file);
      setStage('در حال بارگذاری تصویر…');
      const response = await fetch(pending.upload.url, { method: 'POST', body: form, credentials: 'omit' });
      if (!response.ok) throw new Error('بارگذاری فایل انجام نشد. اتصال به فضای ذخیره‌سازی را بررسی و دوباره تلاش کنید.');
      setStage('بررسی و ثبت تصویر…');
      await call(() => siteApi.mediaComplete(pending.media.id));
      onUploaded();
    } catch (failure) {
      setError(problemMessage(failure, failure instanceof Error ? failure.message : 'بارگذاری تصویر انجام نشد.'));
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  return (
    <Modal open onClose={close} title="بارگذاری تصویر" description="تصاویر PNG، JPEG، WebP و GIF تا ۱۰ مگابایت پذیرفته می‌شوند." footer={<><Button variant="secondary" disabled={busy} onClick={close}>انصراف</Button><Button type="submit" form="site-media-upload" loading={busy} disabled={!file}>بارگذاری</Button></>}>
      <form id="site-media-upload" onSubmit={(event) => void upload(event)} className="flex flex-col gap-4">
        <Input label="فایل تصویر" type="file" accept="image/png,image/jpeg,image/webp,image/gif" required disabled={busy} onChange={(event) => { const next = event.target.files?.[0] || null; const invalid = next ? fileError(next) : null; setFile(invalid ? null : next); setError(invalid); }} />
        {file && <p className="break-all text-caption text-fg-tertiary">{file.name} · {bytesLabel(file.size)}</p>}
        <Input label="متن جایگزین" hint="محتوای تصویر را توصیف کنید؛ برای تصویر تزئینی خالی بگذارید." maxLength={300} value={alt} onChange={(event) => setAlt(event.target.value)} disabled={busy} />
        {stage && <p role="status" className="text-body-sm text-fg-secondary">{stage}</p>}
        {error && <p role="alert" className="text-body-sm text-status-blocked">{error}</p>}
      </form>
    </Modal>
  );
}

function MediaDetails({ media, onClose, onSaved }: { readonly media: SiteMedia; readonly onClose: () => void; readonly onSaved: () => void }) {
  const { call } = useAdmin();
  const [alt, setAlt] = useState(media.alt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const close = () => { if (!busy) onClose(); };
  const save = async (archive?: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await call(() => siteApi.updateMedia(media.id, { alt: alt.trim(), ...(archive === undefined ? {} : { archive }) }));
      onSaved();
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal open={!archiveConfirm} onClose={close} title="جزئیات تصویر" size="lg" footer={<><Button variant="secondary" disabled={busy} onClick={close}>بستن</Button><Button variant={media.archivedAt ? 'secondary' : 'destructive'} disabled={busy} onClick={() => { if (media.archivedAt) void save(false); else setArchiveConfirm(true); }}>{media.archivedAt ? 'بازگردانی از بایگانی' : 'بایگانی'}</Button><Button loading={busy} onClick={() => void save()}>ذخیره متن جایگزین</Button></>}>
        <div className="flex flex-col gap-4">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-sunken"><Image src={media.src} alt={alt} fill unoptimized className="object-contain" sizes="(max-width: 768px) 100vw, 700px" /></div>
          <p dir="auto" className="break-all text-body-sm font-medium text-fg-primary">{media.filename}</p>
          <p className="text-caption text-fg-tertiary">{bytesLabel(media.size)} · {dateTimeLabel(media.createdAt)}</p>
          {media.archivedAt && <Badge>بایگانی‌شده</Badge>}
          <Input label="متن جایگزین تصویر" hint="برای تصویر تزئینی خالی بگذارید." maxLength={300} value={alt} onChange={(event) => setAlt(event.target.value)} disabled={busy} />
          <Input label="نشانی تصویر" value={media.src} readOnly dir="ltr" onFocus={(event) => event.target.select()} />
          {error && <p role="alert" className="text-body-sm text-status-blocked">{error}</p>}
        </div>
      </Modal>
      <Modal open={archiveConfirm} onClose={() => { if (!busy) setArchiveConfirm(false); }} role="alertdialog" title="بایگانی تصویر" description="تصویر از فهرست انتخاب رسانه کنار گذاشته می‌شود. تصاویر استفاده‌شده در محتوای منتشرشده قابل بایگانی نیستند." size="sm" footer={<><Button variant="secondary" disabled={busy} onClick={() => setArchiveConfirm(false)}>انصراف</Button><Button variant="destructive" loading={busy} onClick={() => void save(true)}>بایگانی تصویر</Button></>}>
        <p dir="auto" className="break-all text-body-sm text-fg-secondary">{media.filename}</p>
        {error && <p role="alert" className="mt-3 text-body-sm text-status-blocked">{error}</p>}
      </Modal>
    </>
  );
}

'use client';

import { useState } from 'react';
import type { SiteSubmission, SiteSubmissionKind } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { useAdmin } from '@/admin/AdminSession';
import { dateTimeLabel } from '@/admin/format';
import { siteApi } from '@/admin/site-api';
import { useAdminLoad } from '@/admin/use-admin-load';
import { problemMessage } from '@/api/messages';
import { Badge, Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { Fact, Loaded, PageHeader, Panel, TABLE, TD, TH, TableFrame } from '../AdminUi';

type SubmissionStatus = SiteSubmission['status'];
const STATUS_LABELS: Record<SubmissionStatus, string> = { new: 'جدید', 'in-progress': 'در حال پیگیری', closed: 'بسته‌شده', archived: 'بایگانی‌شده' };
const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as SubmissionStatus[]).map((value) => ({ value, label: STATUS_LABELS[value] }));
const PAGE_SIZE = 20;

export function SiteInbox({ kind, title }: { readonly kind: SiteSubmissionKind; readonly title: string }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SubmissionStatus | ''>('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inbox = useAdminLoad(JSON.stringify([kind, search, status, page]), () => siteApi.submissions({ kind, q: search || undefined, status: status || undefined, page, limit: PAGE_SIZE }));

  return (
    <>
      <PageHeader title={title} description="درخواست‌های ثبت‌شده در وب‌سایت را بررسی و پیگیری کنید." actions={<Button variant="secondary" loading={inbox.loading} onClick={inbox.reload}>تازه‌سازی</Button>} />
      {notice && <p role="status" className="mb-4 rounded-lg bg-status-done-subtle px-3 py-2 text-body-sm text-status-done">{notice}</p>}
      <Panel title="درخواست‌ها">
        <form className="mb-5 grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); setPage(1); }}>
          <Input label="جستجو در درخواست‌ها" type="search" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام، ایمیل یا متن درخواست" />
          <Select<SubmissionStatus | ''> label="وضعیت درخواست" hideLabel={false} value={status} options={[{ value: '', label: 'همه وضعیت‌ها' }, ...STATUS_OPTIONS]} onValueChange={(value) => { setStatus(value); setPage(1); }} />
          <Button type="submit" variant="secondary">جستجو</Button>
        </form>
        <Loaded load={inbox} empty={(data) => data.items.length === 0}>
          {(data) => (
            <div aria-busy={inbox.loading}>
              <TableFrame label={title}>
                <table className={TABLE}>
                  <thead><tr><th className={TH}>فرستنده</th><th className={TH}>موضوع و پیام</th><th className={TH}>تاریخ</th><th className={TH}>وضعیت</th><th className={TH}><span className="sr-only">اقدام</span></th></tr></thead>
                  <tbody>{data.items.map((item) => (
                    <tr key={item.id}>
                      <td className={TD}><p className="font-medium">{item.fullName}</p><p dir="ltr" className="text-start text-caption text-fg-tertiary">{item.email || item.phone || '—'}</p>{item.company && <p className="text-caption text-fg-tertiary">{item.company}</p>}</td>
                      <td className={TD}><p className="font-medium">{item.subject || 'بدون موضوع'}</p><p className="mt-1 line-clamp-2 max-w-sm break-words text-caption text-fg-tertiary">{item.message}</p></td>
                      <td className={TD}>{dateTimeLabel(item.createdAt)}</td>
                      <td className={TD}><Badge tone={item.status === 'new' ? 'brand' : item.status === 'in-progress' ? 'warning' : item.status === 'closed' ? 'success' : 'neutral'}>{STATUS_LABELS[item.status]}</Badge></td>
                      <td className={TD}><Button variant="secondary" size="sm" aria-label={`بررسی درخواست ${item.fullName}`} disabled={inbox.loading} onClick={() => setSelectedId(item.id)}>بررسی</Button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </TableFrame>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p role="status" className="text-caption text-fg-tertiary">{toPersianDigits(data.total)} درخواست · صفحه {toPersianDigits(page)} از {toPersianDigits(Math.max(1, Math.ceil(data.total / PAGE_SIZE)))}</p>
                <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1 || inbox.loading} onClick={() => setPage((value) => value - 1)}>قبلی</Button><Button variant="secondary" size="sm" disabled={page * PAGE_SIZE >= data.total || inbox.loading} onClick={() => setPage((value) => value + 1)}>بعدی</Button></div>
              </div>
            </div>
          )}
        </Loaded>
      </Panel>
      {selectedId && <SubmissionDialog key={selectedId} id={selectedId} onClose={() => setSelectedId(null)} onSaved={() => { setSelectedId(null); setPage(1); setNotice('درخواست به‌روزرسانی شد.'); inbox.reload(); }} />}
    </>
  );
}

function SubmissionDialog({ id, onClose, onSaved }: { readonly id: string; readonly onClose: () => void; readonly onSaved: () => void }) {
  const detail = useAdminLoad(id, () => siteApi.submission(id));
  if (detail.data && !detail.error) return <SubmissionEditor submission={detail.data} onClose={onClose} onSaved={onSaved} />;
  return <Modal open onClose={onClose} title="بررسی درخواست"><Loaded load={detail}>{() => null}</Loaded></Modal>;
}

function SubmissionEditor({ submission, onClose, onSaved }: { readonly submission: SiteSubmission; readonly onClose: () => void; readonly onSaved: () => void }) {
  const { call } = useAdmin();
  const [status, setStatus] = useState(submission.status);
  const [notes, setNotes] = useState(submission.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const close = () => { if (!busy) onClose(); };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await call(() => siteApi.updateSubmission(submission.id, { status, notes }));
      onSaved();
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal open={!archiveConfirm} onClose={close} title={`درخواست ${submission.fullName}`} description={dateTimeLabel(submission.createdAt)} size="lg" footer={<><Button variant="secondary" disabled={busy} onClick={close}>بستن</Button><Button loading={busy} onClick={() => { if (status === 'archived' && submission.status !== 'archived') setArchiveConfirm(true); else void save(); }}>ذخیره تغییرات</Button></>}>
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Fact label="نام و نام خانوادگی">{submission.fullName}</Fact>
            <Fact label="ایمیل"><span dir="ltr">{submission.email || '—'}</span></Fact>
            <Fact label="شماره تماس"><span dir="ltr">{submission.phone || '—'}</span></Fact>
            <Fact label="شرکت / تیم">{submission.company || '—'}</Fact>
            {submission.teamSize && <Fact label="اندازه تیم">{submission.teamSize}</Fact>}
            {submission.jobId && <Fact label="شناسه موقعیت شغلی">{submission.jobId}</Fact>}
            {submission.website && <Fact label="وب‌سایت"><span dir="ltr" className="break-all">{submission.website}</span></Fact>}
            <Fact label="رضایت برای تماس">{submission.consent ? 'ثبت شده' : 'ثبت نشده'}</Fact>
          </dl>
          <div className="rounded-lg border border-secondary bg-sunken p-4"><h3 className="mb-2 font-semibold text-fg-primary">{submission.subject || 'متن درخواست'}</h3><p className="whitespace-pre-wrap break-words text-body-sm leading-7 text-fg-secondary">{submission.message}</p></div>
          <Select<SubmissionStatus> label="وضعیت پیگیری" hideLabel={false} value={status} onValueChange={setStatus} options={STATUS_OPTIONS} disabled={busy} />
          <Textarea label="یادداشت داخلی" hint="این یادداشت فقط برای مدیران نمایش داده می‌شود." value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} maxLength={10000} disabled={busy} />
          {error && <p role="alert" className="text-body-sm text-status-blocked">{error}</p>}
        </div>
      </Modal>
      <Modal open={archiveConfirm} onClose={() => { if (!busy) setArchiveConfirm(false); }} role="alertdialog" title="بایگانی درخواست" description="این درخواست به فهرست بایگانی منتقل می‌شود. می‌توانید بعداً وضعیت آن را تغییر دهید." size="sm" footer={<><Button variant="secondary" disabled={busy} onClick={() => setArchiveConfirm(false)}>انصراف</Button><Button variant="destructive" loading={busy} onClick={() => void save()}>بایگانی و ذخیره</Button></>}>
        {error ? <p role="alert" className="text-body-sm text-status-blocked">{error}</p> : <p className="text-body-sm text-fg-secondary">{submission.fullName} · {submission.subject || 'بدون موضوع'}</p>}
      </Modal>
    </>
  );
}

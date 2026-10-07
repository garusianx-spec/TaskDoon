'use client';

import { useEffect, useRef, useState } from 'react';
import type { SystemBroadcastView } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { adminApi } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { dateTimeLabel } from '@/admin/format';
import { useAdminLoad } from '@/admin/use-admin-load';
import { problemMessage } from '@/api/messages';
import { Loaded, Panel, TableFrame, TD, TH } from '@/components/admin/AdminUi';
import { BroadcastDialog } from '@/components/admin/BroadcastDialog';
import { BROADCAST_LEVEL_LABELS } from '@/components/layout/BroadcastStrip';
import { Badge, Button, Input, Modal } from '@/components/ui';
import { AddIcon, RefreshIcon, SearchIcon } from '@/components/icons';

const LEVEL_TONE = { info: 'brand', warning: 'warning', critical: 'error' } as const;

/** Pattern: List / Index. All broadcast mutations remain behind the admin step-up. */
export default function AdminBroadcastsPage() {
  const { call } = useAdmin();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const pagingGeneration = useRef(0);
  const [dialog, setDialog] = useState<{ readonly broadcast: SystemBroadcastView | null } | null>(null);
  const [archiving, setArchiving] = useState<SystemBroadcastView | null>(null);
  const [more, setMore] = useState<{ readonly items: readonly SystemBroadcastView[]; readonly cursor: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const page = useAdminLoad(`broadcasts:${includeArchived}`, () => adminApi.broadcasts({ includeArchived }));

  useEffect(() => {
    const slash = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== '/' || target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', slash);
    return () => window.removeEventListener('keydown', slash);
  }, []);
  const refresh = () => { pagingGeneration.current += 1; setMore(null); setFailure(null); page.reload(); };
  const done = () => {
    setDialog(null);
    setNotice('اطلاعیه ذخیره شد.');
    refresh();
  };
  const toggle = async (item: SystemBroadcastView) => {
    if (busy) return;
    setBusy(item.id);
    setFailure(null);
    try {
      await call(() => adminApi.updateBroadcast(item.id, { isActive: !item.isActive }));
      setNotice(item.isActive ? 'اطلاعیه غیرفعال شد.' : 'اطلاعیه فعال شد.');
      refresh();
    } catch (error) { setFailure(problemMessage(error)); }
    finally { setBusy(null); }
  };
  const archive = async () => {
    if (!archiving || busy) return;
    setBusy(archiving.id);
    setFailure(null);
    try {
      await call(() => adminApi.archiveBroadcast(archiving.id));
      setArchiving(null);
      setNotice('اطلاعیه بایگانی شد و دیگر نمایش داده نمی‌شود.');
      refresh();
    } catch (error) { setFailure(problemMessage(error)); }
    finally { setBusy(null); }
  };
  const cursor = more ? more.cursor : page.data?.nextCursor;
  const loadMore = async () => {
    if (!cursor || busy) return;
    const generation = pagingGeneration.current;
    setBusy('more');
    setFailure(null);
    try {
      const result = await call(() => adminApi.broadcasts({ cursor, includeArchived }));
      if (generation !== pagingGeneration.current) return;
      setMore((current) => ({ items: [...(current?.items ?? []), ...result.items], cursor: result.nextCursor }));
    } catch (error) { setFailure(problemMessage(error)); }
    finally { setBusy(null); }
  };

  return (
    <div className="mx-auto w-full max-w-screen-xl text-sm leading-relaxed">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-heading font-semibold leading-tight text-fg-primary">اطلاعیه‌های سراسری</h1>
          <p className="mt-2 text-sm text-fg-secondary">اطلاعیه‌ها را زمان‌بندی کنید و نمایش آن‌ها را برای همه کاربران مدیریت کنید.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="min-h-11 text-sm" iconStart={<RefreshIcon size={18} />} onClick={refresh}>بازخوانی</Button>
          <Button className="min-h-11 text-sm" iconStart={<AddIcon size={18} />} onClick={() => setDialog({ broadcast: null })}>ساخت اطلاعیه</Button>
        </div>
      </header>
      <Panel title="اطلاعیه‌ها">
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <Input ref={searchRef} label="جستجو در اطلاعیه‌های بارگذاری‌شده" value={search} onChange={(event) => setSearch(event.target.value)}
            containerClassName="min-w-0 flex-1 basis-64" className="min-h-11 text-sm" iconStart={<SearchIcon size={18} />} />
          <label className="flex min-h-11 items-center gap-3 text-sm text-fg-secondary">
            <input type="checkbox" checked={includeArchived} className="size-5 accent-brand-600" onChange={(event) => {
              pagingGeneration.current += 1; setMore(null); setNotice(null); setFailure(null); setIncludeArchived(event.target.checked);
            }} />
            نمایش بایگانی‌شده‌ها
          </label>
        </div>
        {notice && <p role="status" className="mb-3 rounded-lg bg-status-done-subtle p-3 text-sm text-status-done">{notice}</p>}
        {failure && !archiving && <p role="alert" className="mb-3 text-sm text-status-blocked">{failure}</p>}
        <Loaded load={page}>
          {(data) => {
            const items = [...data.items, ...(more?.items ?? [])].filter((item) => item.message.toLocaleLowerCase('fa').includes(search.trim().toLocaleLowerCase('fa')));
            return (
              <>
                <TableFrame label="فهرست اطلاعیه‌ها">
                  <table className="w-full min-w-[760px] border-collapse text-start text-sm">
                    <thead><tr>
                      <th className={TH}>متن و اهمیت</th><th className={TH}>وضعیت</th><th className={TH}>بازه نمایش</th><th className={TH}>سازنده</th><th className={TH}>اقدام‌ها</th>
                    </tr></thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td className={`${TD} max-w-sm`}>
                            <p className="mb-2 whitespace-pre-wrap break-words text-sm">{item.message}</p>
                            <Badge tone={LEVEL_TONE[item.level]} size="md">{BROADCAST_LEVEL_LABELS[item.level]}</Badge>
                          </td>
                          <td className={TD}>
                            {item.archivedAt ? <Badge size="md">بایگانی‌شده</Badge> : (
                              <button type="button" role="switch" aria-checked={item.isActive} aria-label={`فعال‌بودن اطلاعیه: ${item.message.slice(0, 50)}`}
                                disabled={busy !== null} onClick={() => void toggle(item)}
                                className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-fg-secondary focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60">
                                <span className={`flex h-6 w-10 items-center rounded-full p-1 ${item.isActive ? 'bg-brand-solid' : 'bg-muted'}`} aria-hidden="true">
                                  <span className={`size-4 rounded-full bg-white ${item.isActive ? 'ms-auto' : ''}`} />
                                </span>
                                {item.isActive ? 'فعال' : 'غیرفعال'}
                              </button>
                            )}
                          </td>
                          <td className={`${TD} whitespace-nowrap`}><p>{dateTimeLabel(item.startsAt)}</p><p className="mt-1 text-fg-secondary">{item.expiresAt ? `تا ${dateTimeLabel(item.expiresAt)}` : 'بدون زمان پایان'}</p></td>
                          <td className={TD}>{item.createdByName}<p className="mt-1 text-xs text-fg-tertiary">{dateTimeLabel(item.createdAt)}</p></td>
                          <td className={TD}>
                            {!item.archivedAt && <div className="flex flex-wrap gap-2">
                              <Button variant="secondary" className="min-h-11 text-sm" onClick={() => setDialog({ broadcast: item })}>ویرایش</Button>
                              <Button variant="ghost" className="min-h-11 text-sm" onClick={() => { setFailure(null); setArchiving(item); }}>بایگانی</Button>
                            </div>}
                          </td>
                        </tr>
                      ))}
                      {items.length === 0 && <tr><td colSpan={5} className="border-b border-secondary px-4 py-10 text-center text-sm text-fg-secondary">
                        <p>{search.trim() ? 'اطلاعیه‌ای با این متن پیدا نشد.' : 'هنوز اطلاعیه‌ای ساخته نشده است.'}</p>
                        <Button variant="link" className="mt-3 min-h-11 text-sm" onClick={() => search.trim() ? setSearch('') : setDialog({ broadcast: null })}>{search.trim() ? 'پاک‌کردن جستجو' : 'ساخت اولین اطلاعیه'}</Button>
                      </td></tr>}
                    </tbody>
                  </table>
                </TableFrame>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-fg-tertiary">{toPersianDigits(data.items.length + (more?.items.length ?? 0))} اطلاعیه بارگذاری شده؛ ترتیب: تازه‌ترین</p>
                  <Button variant="secondary" className="min-h-11 text-sm" disabled={!cursor} loading={busy === 'more'} onClick={() => void loadMore()}>{cursor ? 'نمایش بیشتر' : 'همه اطلاعیه‌ها نمایش داده شد'}</Button>
                </div>
              </>
            );
          }}
        </Loaded>
      </Panel>
      {dialog && <BroadcastDialog broadcast={dialog.broadcast} onClose={() => setDialog(null)} onDone={done} />}
      {archiving && <Modal open role="alertdialog" onClose={() => { if (!busy) setArchiving(null); }} title="بایگانی اطلاعیه" size="md">
        <p className="text-sm leading-relaxed text-fg-secondary">این اطلاعیه بایگانی می‌شود و دیگر برای کاربران نمایش داده نمی‌شود.</p>
        <blockquote className="my-4 whitespace-pre-wrap break-words rounded-lg border border-secondary p-3 text-sm text-fg-primary">{archiving.message}</blockquote>
        {failure && <p role="alert" className="mb-3 text-sm text-status-blocked">{failure}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" className="min-h-11 text-sm" onClick={() => { if (!busy) setArchiving(null); }}>انصراف</Button>
          <Button variant="destructive" className="min-h-11 text-sm" loading={busy === archiving.id} onClick={() => void archive()}>بایگانی اطلاعیه</Button>
        </div>
      </Modal>}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { PlatformWorkspaceSummary } from '@taskin/contracts';
import { formatJalali, toPersianDigits } from '@taskin/jalali';
import { adminApi } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { useAdminLoad } from '@/admin/use-admin-load';
import { problemMessage } from '@/api/messages';
import { Loaded, PageHeader, Panel, TABLE, TableFrame, TD, TH } from '@/components/admin/AdminUi';
import { Badge, Button, Input } from '@/components/ui';
import { SearchIcon } from '@/components/icons';

/** «ورک‌اسپیس‌ها و نقش‌ها»: every workspace on the platform. */
export default function AdminWorkspacesPage() {
  const { call } = useAdmin();
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [more, setMore] = useState<{ items: PlatformWorkspaceSummary[]; cursor: string | null } | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const page = useAdminLoad(`q:${q}`, () => adminApi.workspaces(q));

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setMore(null);
    if (draft.trim() === q) page.reload();
    setQ(draft.trim());
  };

  const cursor = more ? more.cursor : (page.data?.nextCursor ?? null);
  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const next = await call(() => adminApi.workspaces(q, cursor));
      setMore((current) => ({ items: [...(current?.items ?? []), ...next.items], cursor: next.nextCursor }));
    } catch (error) {
      setMoreError(problemMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <PageHeader title="ورک‌اسپیس‌ها و نقش‌ها" description="ورک‌اسپیس‌های پلتفرم، نقش‌ها و ماتریس دسترسی هر کدام، و اعضا با نقش دقیقشان." />
      <Panel title="جستجو">
        <form role="search" aria-label="جستجوی ورک‌اسپیس‌ها" onSubmit={onSearch} className="flex flex-wrap items-end gap-2">
          <Input containerClassName="min-w-[16rem] flex-1" label="نام یا نشانی ورک‌اسپیس" value={draft} onChange={(event) => setDraft(event.target.value)} iconStart={<SearchIcon size={16} />} />
          <Button type="submit">جستجو</Button>
        </form>
      </Panel>
      <Panel title="ورک‌اسپیس‌ها">
        <Loaded load={page} empty={(data) => data.items.length === 0}>
          {(data) => (
            <>
              <TableFrame label="فهرست ورک‌اسپیس‌ها">
                <table className={TABLE}>
                  <thead>
                    <tr>
                      <th className={TH}>نام</th>
                      <th className={TH}>طرح</th>
                      <th className={TH}>مالک</th>
                      <th className={TH}>اعضا</th>
                      <th className={TH}>ساخته‌شده</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.items, ...(more?.items ?? [])].map((workspace) => (
                      <tr key={workspace.id}>
                        <td className={TD}>
                          <Link href={`/admin/workspaces/${workspace.id}`} className="font-semibold text-fg-brand hover:underline">
                            {workspace.name}
                          </Link>
                          <span dir="ltr" className="ms-2 text-caption text-fg-tertiary">
                            {workspace.slug}
                          </span>
                          {workspace.deletedAt && (
                            <Badge tone="error" size="sm" className="ms-2">
                              حذف‌شده
                            </Badge>
                          )}
                        </td>
                        <td className={TD}>{workspace.plan}</td>
                        <td className={TD}>
                          <Link href={`/admin/users/${workspace.ownerId}`} className="hover:underline">
                            {workspace.ownerName}
                          </Link>
                        </td>
                        <td className={TD}>{toPersianDigits(workspace.memberCount)}</td>
                        <td className={TD}>{formatJalali(workspace.createdAt, 'medium')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableFrame>
              {moreError && <p role="alert" className="mt-3 text-caption text-status-blocked">{moreError}</p>}
              {cursor && (
                <div className="mt-4 flex justify-center">
                  <Button variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>
                    نمایش بیشتر
                  </Button>
                </div>
              )}
            </>
          )}
        </Loaded>
      </Panel>
    </>
  );
}

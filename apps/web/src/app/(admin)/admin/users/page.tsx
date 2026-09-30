'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { PlatformUserSummary } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { adminApi, type UserFilters } from '@/admin/api';
import { phoneLabel, USER_STATUS } from '@/admin/format';
import { useAdmin } from '@/admin/AdminSession';
import { useAdminLoad } from '@/admin/use-admin-load';
import { Loaded, PageHeader, Panel, TABLE, TableFrame, TD, TH } from '@/components/admin/AdminUi';
import { Badge, Button, Input, RelativeTime, Select } from '@/components/ui';
import { SearchIcon } from '@/components/icons';
import { problemMessage } from '@/api/messages';

const EMPTY: UserFilters = { q: '', phone: '', email: '', status: '', platformRole: '' };

/** «کاربران و سشن‌ها»: the directory. Searches run on submit (each one is audited). */
export default function AdminUsersPage() {
  const { call } = useAdmin();
  const [draft, setDraft] = useState<UserFilters>(EMPTY);
  const [applied, setApplied] = useState<UserFilters>(EMPTY);
  const [more, setMore] = useState<{ items: PlatformUserSummary[]; cursor: string | null } | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const page = useAdminLoad(JSON.stringify(applied), () => adminApi.users(applied));

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setMore(null);
    setApplied({ ...draft });
    if (JSON.stringify(draft) === JSON.stringify(applied)) page.reload();
  };

  const cursor = more ? more.cursor : (page.data?.nextCursor ?? null);
  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const next = await call(() => adminApi.users({ ...applied, cursor }));
      setMore((current) => ({ items: [...(current?.items ?? []), ...next.items], cursor: next.nextCursor }));
    } catch (error) {
      setMoreError(problemMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <PageHeader title="کاربران و سشن‌ها" description="همه حساب‌های تسک‌دون، در همه ورک‌اسپیس‌ها. هر جستجو و مشاهده در گزارش بازرسی ثبت می‌شود." />
      <Panel title="جستجو">
        <form role="search" aria-label="جستجوی کاربران" onSubmit={onSearch} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Input label="نام، شماره یا ایمیل" value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} iconStart={<SearchIcon size={16} />} />
          <Input label="شماره موبایل" dir="ltr" inputMode="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
          <Input label="ایمیل" dir="ltr" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
          <Select
            label="وضعیت"
            hideLabel={false}
            value={draft.status || 'any'}
            onValueChange={(value) => setDraft({ ...draft, status: value === 'any' ? '' : value })}
            options={[
              { value: 'any', label: 'همه' },
              { value: 'active', label: 'فعال' },
              { value: 'suspended', label: 'معلق' },
              { value: 'deleted', label: 'حذف‌شده' },
            ]}
          />
          <Select
            label="نقش پلتفرم"
            hideLabel={false}
            value={draft.platformRole || 'any'}
            onValueChange={(value) => setDraft({ ...draft, platformRole: value === 'any' ? '' : value })}
            options={[
              { value: 'any', label: 'همه' },
              { value: 'admin', label: 'مدیر پلتفرم' },
              { value: 'user', label: 'کاربر عادی' },
            ]}
          />
          <div className="flex gap-2 sm:col-span-2 xl:col-span-5">
            <Button type="submit" iconStart={<SearchIcon size={16} />}>
              جستجو
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY);
                setMore(null);
                setApplied(EMPTY);
              }}
            >
              پاک کردن فیلترها
            </Button>
          </div>
        </form>
      </Panel>
      <Panel title="کاربران">
        <Loaded load={page} empty={(data) => data.items.length === 0}>
          {(data) => (
            <>
              <TableFrame label="فهرست کاربران">
                <table className={TABLE}>
                  <thead>
                    <tr>
                      <th className={TH}>نام</th>
                      <th className={TH}>موبایل</th>
                      <th className={TH}>ایمیل</th>
                      <th className={TH}>وضعیت</th>
                      <th className={TH}>ورک‌اسپیس</th>
                      <th className={TH}>نشست فعال</th>
                      <th className={TH}>آخرین فعالیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.items, ...(more?.items ?? [])].map((user) => (
                      <tr key={user.id}>
                        <td className={TD}>
                          <Link href={`/admin/users/${user.id}`} className="font-semibold text-fg-brand hover:underline">
                            {user.fullName}
                          </Link>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {user.isPlatformAdmin && <Badge tone="brand" size="sm">مدیر پلتفرم</Badge>}
                            {user.passwordResetRequired && <Badge tone="warning" size="sm">بازنشانی رمز در انتظار</Badge>}
                          </div>
                        </td>
                        <td className={TD}>
                          <span dir="ltr">{phoneLabel(user.phone)}</span>
                        </td>
                        <td className={TD}>{user.email ? <span dir="ltr">{user.email}</span> : '—'}</td>
                        <td className={TD}>
                          <Badge tone={USER_STATUS[user.status].tone} size="sm">
                            {USER_STATUS[user.status].label}
                          </Badge>
                        </td>
                        <td className={TD}>{toPersianDigits(user.workspaceCount)}</td>
                        <td className={TD}>{toPersianDigits(user.activeSessionCount)}</td>
                        <td className={TD}>{user.lastActiveAt ? <RelativeTime iso={user.lastActiveAt} /> : '—'}</td>
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

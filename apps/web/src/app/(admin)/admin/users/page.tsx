'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import type { PlatformModerationResult, PlatformUserSummary } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { adminApi, type UserFilters } from '@/admin/api';
import { phoneLabel, USER_STATUS } from '@/admin/format';
import { useAdmin, useAdminMe } from '@/admin/AdminSession';
import { useAdminLoad } from '@/admin/use-admin-load';
import { Loaded, PageHeader, Panel, TABLE, TableFrame, TD, TH } from '@/components/admin/AdminUi';
import { ForcePasswordResetDialog } from '@/components/admin/ForcePasswordResetDialog';
import { SessionsDrawer } from '@/components/admin/SessionsDrawer';
import { SuspendUserDialog } from '@/components/admin/SuspendUserDialog';
import { type UserAction, UserActionsMenu } from '@/components/admin/UserActionsMenu';
import { Badge, Button, Input, RelativeTime, Select } from '@/components/ui';
import { SearchIcon } from '@/components/icons';
import { problemMessage } from '@/api/messages';

const EMPTY: UserFilters = { q: '', phone: '', email: '', status: '', platformRole: '' };

/** What the directory says once a moderation action is done. */
function outcome(action: UserAction, { user, sessionsRevoked, changed }: PlatformModerationResult): string {
  const closed = sessionsRevoked > 0 ? `؛ ${toPersianDigits(sessionsRevoked)} نشست بسته شد` : '';
  switch (action) {
    case 'suspend':
      return changed ? `${user.fullName} معلق شد${closed}.` : `${user.fullName} از قبل معلق بود.`;
    case 'unsuspend':
      return changed ? `تعلیق ${user.fullName} برداشته شد.` : `${user.fullName} معلق نبود.`;
    case 'require-reset':
      return changed ? `${user.fullName} باید رمز عبور تازه‌ای بگذارد${closed}.` : `رمز ${user.fullName} از قبل در انتظار تغییر بود${closed}.`;
    default:
      return `اجبار تغییر رمز ${user.fullName} لغو شد.`;
  }
}

/** «کاربران و سشن‌ها»: the directory. Searches run on submit (each one is audited). */
export default function AdminUsersPage() {
  const { call } = useAdmin();
  const self = useAdminMe();
  const [draft, setDraft] = useState<UserFilters>(EMPTY);
  const [applied, setApplied] = useState<UserFilters>(EMPTY);
  const [more, setMore] = useState<{ items: PlatformUserSummary[]; cursor: string | null } | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const page = useAdminLoad(JSON.stringify(applied), () => adminApi.users(applied));
  /** Rows as the last moderation action left them, until the next search. */
  const [updated, setUpdated] = useState<Readonly<Record<string, PlatformUserSummary>>>({});
  const [acting, setActing] = useState<{ readonly action: UserAction; readonly user: PlatformUserSummary } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sessionsChanged = useRef(false);

  const onDone = (result: PlatformModerationResult) => {
    if (!acting) return;
    setUpdated((current) => ({ ...current, [result.user.id]: result.user }));
    setNotice(outcome(acting.action, result));
    setActing(null);
  };
  const closeSessions = () => {
    setActing(null);
    if (!sessionsChanged.current) return;
    // Session counts changed: search again (and record it, as every search is).
    sessionsChanged.current = false;
    setMore(null);
    setUpdated({});
    page.reload();
  };

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setUpdated({});
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
              { value: 'suspended', label: USER_STATUS.suspended.label },
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
        {notice && (
          <p role="status" className="mb-3 rounded-lg bg-status-done-subtle px-3 py-2 text-body-sm text-status-done">
            {notice}
          </p>
        )}
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
                      <th className={TH}>اقدام‌ها</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.items, ...(more?.items ?? [])].map((listed) => updated[listed.id] ?? listed).map((user) => (
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
                        <td className={TD}>
                          <UserActionsMenu user={user} selfId={self.userId} onAction={(action) => setActing({ action, user })} />
                        </td>
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
      {acting && (acting.action === 'suspend' || acting.action === 'unsuspend') && (
        <SuspendUserDialog user={acting.user} mode={acting.action} open onClose={() => setActing(null)} onDone={onDone} />
      )}
      {acting && (acting.action === 'require-reset' || acting.action === 'lift-reset') && (
        <ForcePasswordResetDialog user={acting.user} open onClose={() => setActing(null)} onDone={onDone} />
      )}
      <SessionsDrawer
        user={acting?.action === 'sessions' ? acting.user : null}
        onClose={closeSessions}
        onChanged={() => {
          sessionsChanged.current = true;
        }}
      />
    </>
  );
}

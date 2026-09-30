'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { PlatformAuditEntry } from '@taskin/contracts';
import { adminApi } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { AUDIT_ACTIONS, dateTimeLabel } from '@/admin/format';
import { useAdminLoad } from '@/admin/use-admin-load';
import { problemMessage } from '@/api/messages';
import { Loaded, PageHeader, Panel, TABLE, TableFrame, TD, TH } from '@/components/admin/AdminUi';
import { Button, Select } from '@/components/ui';

const ACTION_FILTERS = [
  { value: 'any', label: 'همه اقدام‌ها' },
  { value: 'admin.messages.read', label: 'خواندن پیام‌ها' },
  { value: 'admin.attachment.open', label: 'باز کردن فایل' },
  { value: 'admin.conversation', label: 'مشاهده گفتگوها' },
  { value: 'admin.sessions', label: 'نشست‌ها' },
  { value: 'admin.session.revoke', label: 'پایان یک نشست' },
  { value: 'admin.password_reset', label: 'بازنشانی رمز' },
  { value: 'admin.user', label: 'مشاهده پروفایل' },
  { value: 'admin.users', label: 'جستجوی کاربران' },
  { value: 'admin.workspace', label: 'ورک‌اسپیس‌ها' },
] as const;

type ActionFilter = (typeof ACTION_FILTERS)[number]['value'];

/** Who looked at what, from where: the platform audit log, newest first. Reading it is not logged. */
export default function AdminAuditPage() {
  const targetUserId = useSearchParams().get('targetUserId') ?? undefined;
  const { call } = useAdmin();
  const [action, setAction] = useState<ActionFilter>('any');
  const [more, setMore] = useState<{ items: PlatformAuditEntry[]; cursor: string | null } | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const filters = { targetUserId, action: action === 'any' ? undefined : action };
  const page = useAdminLoad(JSON.stringify(filters), () => adminApi.audit(filters));

  const cursor = more ? more.cursor : (page.data?.nextCursor ?? null);
  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const next = await call(() => adminApi.audit({ ...filters, cursor }));
      setMore((current) => ({ items: [...(current?.items ?? []), ...next.items], cursor: next.nextCursor }));
    } catch (error) {
      setMoreError(problemMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <PageHeader title="گزارش بازرسی" description="هر جستجو، مشاهده و اقدام مدیران پلتفرم، با نشانی IP و شناسه درخواست؛ این گزارش پاک یا ویرایش نمی‌شود." />
      <Panel
        title="رویدادها"
        actions={
          <Select<ActionFilter>
            label="نوع اقدام"
            hideLabel
            size="sm"
            value={action}
            onValueChange={(value) => {
              setMore(null);
              setAction(value);
            }}
            options={ACTION_FILTERS}
          />
        }
      >
        <Loaded load={page} empty={(data) => data.items.length === 0}>
          {(data) => (
            <>
              <TableFrame label="رویدادهای گزارش بازرسی">
                <table className={TABLE}>
                  <thead>
                    <tr>
                      <th className={TH}>زمان</th>
                      <th className={TH}>مدیر</th>
                      <th className={TH}>اقدام</th>
                      <th className={TH}>کاربر هدف</th>
                      <th className={TH}>IP</th>
                      <th className={TH}>شناسه درخواست</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.items, ...(more?.items ?? [])].map((entry) => (
                      <tr key={entry.id}>
                        <td className={TD}>{dateTimeLabel(entry.createdAt)}</td>
                        <td className={TD}>{entry.adminName}</td>
                        <td className={TD}>
                          <span className="block">{AUDIT_ACTIONS[entry.action] ?? entry.action}</span>
                          {entry.resourceType && (
                            <span dir="ltr" className="block text-start text-caption text-fg-tertiary">
                              {entry.resourceType}
                              {entry.resourceId ? ` ${entry.resourceId.slice(0, 8)}…` : ''}
                            </span>
                          )}
                        </td>
                        <td className={TD}>
                          {entry.targetUserId ? (
                            <Link href={`/admin/users/${entry.targetUserId}`} className="hover:underline">
                              {entry.targetName ?? '—'}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={TD}>
                          <span dir="ltr">{entry.ip ?? '—'}</span>
                        </td>
                        <td className={TD}>
                          <span dir="ltr" className="font-mono text-caption">
                            {entry.requestId ?? '—'}
                          </span>
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
    </>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { PlatformWorkspaceModerationResult, PlatformWorkspaceStatus, PlatformWorkspaceSummary } from '@taskin/contracts';
import { formatJalali, toPersianDigits } from '@taskin/jalali';
import { adminApi } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { WORKSPACE_STATUS } from '@/admin/format';
import { useAdminLoad } from '@/admin/use-admin-load';
import { problemMessage } from '@/api/messages';
import { Loaded, PageHeader, Panel, TABLE, TableFrame, TD, TH } from '@/components/admin/AdminUi';
import { SuspendWorkspaceDialog } from '@/components/admin/SuspendWorkspaceDialog';
import { TransferOwnershipDialog } from '@/components/admin/TransferOwnershipDialog';
import { type WorkspaceAction, WorkspaceActionsMenu } from '@/components/admin/WorkspaceActionsMenu';
import { Badge, Button, Input, Select } from '@/components/ui';
import { SearchIcon } from '@/components/icons';

/** What the list says once a workspace action is done. */
function outcome(action: Exclude<WorkspaceAction, 'view'>, { workspace, changed }: PlatformWorkspaceModerationResult): string {
  switch (action) {
    case 'suspend':
      return changed ? `${workspace.name} معلق شد؛ اعضایش دیگر به آن دسترسی ندارند.` : `${workspace.name} از قبل معلق بود.`;
    case 'unsuspend':
      return changed ? `تعلیق ${workspace.name} برداشته شد.` : `${workspace.name} معلق نبود.`;
    default:
      return `مالکیت ${workspace.name} به ${workspace.ownerName} منتقل شد.`;
  }
}

/** «ورک‌اسپیس‌ها و نقش‌ها»: every workspace on the platform, and acting on one (phase 3). */
export default function AdminWorkspacesPage() {
  const { call } = useAdmin();
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [draftStatus, setDraftStatus] = useState<PlatformWorkspaceStatus | ''>('');
  const [status, setStatus] = useState<PlatformWorkspaceStatus | ''>('');
  /** Rows as the last action left them, until the next search. */
  const [updated, setUpdated] = useState<Readonly<Record<string, PlatformWorkspaceSummary>>>({});
  const [acting, setActing] = useState<{ readonly action: Exclude<WorkspaceAction, 'view'>; readonly workspace: PlatformWorkspaceSummary } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [more, setMore] = useState<{ items: PlatformWorkspaceSummary[]; cursor: string | null } | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const page = useAdminLoad(`q:${q}|status:${status}`, () => adminApi.workspaces(q, null, status));

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setMore(null);
    setUpdated({});
    setNotice(null);
    if (draft.trim() === q && draftStatus === status) page.reload();
    setQ(draft.trim());
    setStatus(draftStatus);
  };

  const onAction = (workspace: PlatformWorkspaceSummary, action: WorkspaceAction) => {
    if (action === 'view') router.push(`/admin/workspaces/${workspace.id}`);
    else setActing({ action, workspace });
  };
  const onDone = (result: PlatformWorkspaceModerationResult) => {
    if (!acting) return;
    setUpdated((current) => ({ ...current, [result.workspace.id]: result.workspace }));
    setNotice(outcome(acting.action, result));
    setActing(null);
  };

  const cursor = more ? more.cursor : (page.data?.nextCursor ?? null);
  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const next = await call(() => adminApi.workspaces(q, cursor, status));
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
          <div className="w-44">
            <Select
              label="وضعیت"
              hideLabel={false}
              value={draftStatus || 'any'}
              onValueChange={(value) => setDraftStatus(value === 'any' ? '' : value)}
              options={[
                { value: 'any', label: 'همه' },
                { value: 'active', label: WORKSPACE_STATUS.active.label },
                { value: 'suspended', label: WORKSPACE_STATUS.suspended.label },
                { value: 'deleted', label: WORKSPACE_STATUS.deleted.label },
              ]}
            />
          </div>
          <Button type="submit">جستجو</Button>
        </form>
      </Panel>
      <Panel title="ورک‌اسپیس‌ها">
        {notice && (
          <p role="status" className="mb-3 rounded-lg bg-status-done-subtle px-3 py-2 text-body-sm text-status-done">
            {notice}
          </p>
        )}
        <Loaded load={page} empty={(data) => data.items.length === 0}>
          {(data) => (
            <>
              <TableFrame label="فهرست ورک‌اسپیس‌ها">
                <table className={TABLE}>
                  <thead>
                    <tr>
                      <th className={TH}>نام</th>
                      <th className={TH}>وضعیت</th>
                      <th className={TH}>طرح</th>
                      <th className={TH}>مالک</th>
                      <th className={TH}>اعضا</th>
                      <th className={TH}>ساخته‌شده</th>
                      <th className={TH}>اقدام‌ها</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.items, ...(more?.items ?? [])].map((listed) => updated[listed.id] ?? listed).map((workspace) => (
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
                        <td className={TD}>
                          {workspace.status && (
                            <Badge tone={WORKSPACE_STATUS[workspace.status].tone} size="sm">
                              {WORKSPACE_STATUS[workspace.status].label}
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
                        <td className={TD}>
                          <WorkspaceActionsMenu workspace={workspace} onAction={(action) => onAction(workspace, action)} />
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
        <SuspendWorkspaceDialog workspace={acting.workspace} mode={acting.action} onClose={() => setActing(null)} onDone={onDone} />
      )}
      {acting?.action === 'transfer' && (
        <TransferOwnershipDialog workspaceId={acting.workspace.id} workspaceName={acting.workspace.name} onClose={() => setActing(null)} onDone={onDone} />
      )}
    </>
  );
}

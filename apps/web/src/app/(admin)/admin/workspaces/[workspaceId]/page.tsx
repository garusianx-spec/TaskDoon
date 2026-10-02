'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { PlatformWorkspaceModerationResult } from '@taskin/contracts';
import { formatJalali, toPersianDigits } from '@taskin/jalali';
import { adminApi } from '@/admin/api';
import { dateTimeLabel, MEMBER_STATUS, phoneLabel, USER_STATUS, WORKSPACE_STATUS } from '@/admin/format';
import { useAdminLoad } from '@/admin/use-admin-load';
import { Fact, Loaded, PageHeader, Panel, TABLE, TableFrame, TD, TH } from '@/components/admin/AdminUi';
import { SuspendWorkspaceDialog } from '@/components/admin/SuspendWorkspaceDialog';
import { TransferOwnershipDialog } from '@/components/admin/TransferOwnershipDialog';
import { WorkspaceQuotaPanel } from '@/components/admin/WorkspaceQuotaPanel';
import { Badge, Button } from '@/components/ui';
import { ArrowRightIcon, CheckCircleIcon, CheckIcon, CrownIcon, LockIcon, MinusIcon, WarningIcon } from '@/components/icons';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@/data/reference';

/** A workspace: each role with its permission matrix, and who holds which role. */
export default function AdminWorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspace = useAdminLoad(workspaceId, () => adminApi.workspace(workspaceId));
  const [acting, setActing] = useState<'suspension' | 'transfer' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onDone = (result: PlatformWorkspaceModerationResult) => {
    const what = acting;
    setActing(null);
    setNotice(
      what === 'transfer'
        ? `مالکیت به ${result.workspace.ownerName} منتقل شد.`
        : result.workspace.status === 'suspended'
          ? 'فضای کاری معلق شد؛ اعضایش دیگر به آن دسترسی ندارند.'
          : 'تعلیق فضای کاری برداشته شد.',
    );
    workspace.reload();
  };

  return (
    <>
      <Link href="/admin/workspaces" className="mb-3 inline-flex items-center gap-1 text-body-sm text-fg-tertiary hover:text-fg-primary">
        <ArrowRightIcon size={16} />
        ورک‌اسپیس‌ها
      </Link>
      <Loaded load={workspace}>
        {(detail) => (
          <>
            <PageHeader
              title={detail.name}
              description={`طرح ${detail.plan} · ${toPersianDigits(detail.memberCount)} عضو · مالک: ${detail.ownerName} · ساخته‌شده ${formatJalali(detail.createdAt, 'medium')}`}
              actions={
                !detail.deletedAt && (
                  <>
                    {detail.status && (
                      <Badge tone={WORKSPACE_STATUS[detail.status].tone} size="sm">
                        {WORKSPACE_STATUS[detail.status].label}
                      </Badge>
                    )}
                    <Button variant="secondary" iconStart={<CrownIcon size={16} />} onClick={() => setActing('transfer')}>
                      انتقال مالکیت
                    </Button>
                    {detail.status === 'suspended' ? (
                      <Button variant="primary" iconStart={<CheckCircleIcon size={16} />} onClick={() => setActing('suspension')}>
                        رفع تعلیق
                      </Button>
                    ) : (
                      <Button variant="destructive" iconStart={<LockIcon size={16} />} onClick={() => setActing('suspension')}>
                        تعلیق فضای کاری
                      </Button>
                    )}
                  </>
                )
              }
            />
            {notice && (
              <p role="status" className="mb-4 rounded-lg bg-status-done-subtle px-3 py-2 text-body-sm text-status-done">
                {notice}
              </p>
            )}
            {detail.status === 'suspended' && (
              <div role="note" className="mb-4 flex flex-col gap-2 rounded-lg border border-secondary bg-sunken px-3 py-2 text-body-sm text-fg-secondary">
                <span className="flex items-start gap-2">
                  <WarningIcon size={18} className="mt-0.5 shrink-0 text-warning-600" />
                  این فضای کاری معلق است: اعضایش به آن دسترسی ندارند، اما حساب‌ها و فضاهای کاری دیگرشان دست‌نخورده است.
                </span>
                {detail.suspension && (
                  <dl className="grid gap-3 sm:grid-cols-3">
                    <Fact label="تاریخ تعلیق">{dateTimeLabel(detail.suspension.at)}</Fact>
                    <Fact label="تعلیق توسط">{detail.suspension.adminName ?? '—'}</Fact>
                    <Fact label="دلیل تعلیق">
                      <span dir="auto">{detail.suspension.reason ?? '—'}</span>
                    </Fact>
                  </dl>
                )}
              </div>
            )}
            {detail.deletedAt && (
              <p role="status" className="mb-4 rounded-lg bg-status-blocked-subtle px-3 py-2 text-body-sm text-status-blocked">
                این ورک‌اسپیس در {formatJalali(detail.deletedAt, 'medium')} حذف شده است.
              </p>
            )}
            {detail.quota && detail.planOptions && (
              <WorkspaceQuotaPanel
                workspaceId={detail.id}
                quota={detail.quota}
                planOptions={detail.planOptions}
                readOnly={detail.deletedAt !== null}
                onSaved={workspace.reload}
              />
            )}
            <Panel title="نقش‌ها و ماتریس دسترسی">
              <TableFrame label="ماتریس دسترسی نقش‌ها">
                <table className={TABLE}>
                  <thead>
                    <tr>
                      <th className={TH}>نقش</th>
                      <th className={TH}>اعضا</th>
                      {PERMISSION_MODULES.map((module) => (
                        <th key={module.id} className={TH}>
                          {module.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.roles.map((role) => (
                      <tr key={role.id}>
                        <td className={TD}>
                          <span className="font-semibold">{role.name}</span>
                          <span dir="ltr" className="ms-1 text-caption text-fg-tertiary">
                            ({role.key})
                          </span>
                        </td>
                        <td className={TD}>{toPersianDigits(role.memberCount)}</td>
                        {PERMISSION_MODULES.map((module) => (
                          <td key={module.id} className={TD}>
                            <ul className="flex flex-col gap-0.5">
                              {PERMISSION_ACTIONS.map((action) => {
                                const granted = role.grants.includes(`${module.id}:${action.id}`);
                                return (
                                  <li key={action.id} className={`flex items-center gap-1 text-caption ${granted ? 'text-fg-primary' : 'text-fg-quaternary'}`}>
                                    {granted ? <CheckIcon size={12} className="text-status-done" /> : <MinusIcon size={12} />}
                                    <span>{action.shortName}</span>
                                    <span className="sr-only">{granted ? 'دارد' : 'ندارد'}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableFrame>
            </Panel>
            <Panel title="اعضا">
              <TableFrame label="اعضای ورک‌اسپیس">
                <table className={TABLE}>
                  <thead>
                    <tr>
                      <th className={TH}>نام</th>
                      <th className={TH}>موبایل</th>
                      <th className={TH}>نقش</th>
                      <th className={TH}>وضعیت</th>
                      <th className={TH}>حساب</th>
                      <th className={TH}>پیوستن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.members.map((member) => (
                      <tr key={member.userId}>
                        <td className={TD}>
                          <Link href={`/admin/users/${member.userId}`} className="inline-flex items-center gap-1 font-semibold text-fg-brand hover:underline">
                            {member.isOwner && <CrownIcon size={14} className="text-warning-600" />}
                            {member.fullName}
                          </Link>
                        </td>
                        <td className={TD}>
                          <span dir="ltr">{phoneLabel(member.phone)}</span>
                        </td>
                        <td className={TD}>{member.roleName}</td>
                        <td className={TD}>
                          <Badge tone={MEMBER_STATUS[member.status].tone} size="sm">
                            {MEMBER_STATUS[member.status].label}
                          </Badge>
                        </td>
                        <td className={TD}>
                          {member.accountStatus ? (
                            <Badge tone={USER_STATUS[member.accountStatus].tone} size="sm">
                              {USER_STATUS[member.accountStatus].label}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={TD}>
                          {formatJalali(member.joinedAt, 'medium')}
                          {member.leftAt && <p className="text-caption text-fg-tertiary">خروج: {formatJalali(member.leftAt, 'medium')}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableFrame>
            </Panel>
            {acting === 'suspension' && (
              <SuspendWorkspaceDialog workspace={detail} mode={detail.status === 'suspended' ? 'unsuspend' : 'suspend'} onClose={() => setActing(null)} onDone={onDone} />
            )}
            {acting === 'transfer' && <TransferOwnershipDialog workspaceId={detail.id} workspaceName={detail.name} detail={detail} onClose={() => setActing(null)} onDone={onDone} />}
          </>
        )}
      </Loaded>
    </>
  );
}

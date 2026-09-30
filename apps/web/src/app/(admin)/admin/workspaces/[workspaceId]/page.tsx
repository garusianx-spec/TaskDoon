'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatJalali, toPersianDigits } from '@taskin/jalali';
import { adminApi } from '@/admin/api';
import { MEMBER_STATUS, phoneLabel } from '@/admin/format';
import { useAdminLoad } from '@/admin/use-admin-load';
import { Loaded, PageHeader, Panel, TABLE, TableFrame, TD, TH } from '@/components/admin/AdminUi';
import { Badge } from '@/components/ui';
import { ArrowRightIcon, CheckIcon, CrownIcon, MinusIcon } from '@/components/icons';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@/data/reference';

/** A workspace: each role with its permission matrix, and who holds which role. */
export default function AdminWorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspace = useAdminLoad(workspaceId, () => adminApi.workspace(workspaceId));

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
            />
            {detail.deletedAt && (
              <p role="status" className="mb-4 rounded-lg bg-status-blocked-subtle px-3 py-2 text-body-sm text-status-blocked">
                این ورک‌اسپیس در {formatJalali(detail.deletedAt, 'medium')} حذف شده است.
              </p>
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
                          {formatJalali(member.joinedAt, 'medium')}
                          {member.leftAt && <p className="text-caption text-fg-tertiary">خروج: {formatJalali(member.leftAt, 'medium')}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableFrame>
            </Panel>
          </>
        )}
      </Loaded>
    </>
  );
}

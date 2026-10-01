'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { formatJalali, toPersianDigits } from '@taskin/jalali';
import type { PlatformModerationResult } from '@taskin/contracts';
import { adminApi } from '@/admin/api';
import { useAdminMe } from '@/admin/AdminSession';
import { dateTimeLabel, MEMBER_STATUS, phoneLabel, PROJECT_ROLES, USER_STATUS } from '@/admin/format';
import { useAdminLoad } from '@/admin/use-admin-load';
import { Fact, Loaded, PageHeader, Panel, TABLE, TableFrame, TD, TH } from '@/components/admin/AdminUi';
import { ConversationList } from '@/components/admin/ConversationList';
import { ForcePasswordResetDialog } from '@/components/admin/ForcePasswordResetDialog';
import { ResetPasswordDialog } from '@/components/admin/ResetPasswordDialog';
import { SessionsPanel } from '@/components/admin/SessionsPanel';
import { SuspendUserDialog } from '@/components/admin/SuspendUserDialog';
import { Badge, Button } from '@/components/ui';
import { ArrowRightIcon, CheckCircleIcon, CrownIcon, KeyIcon, LockIcon, WarningIcon } from '@/components/icons';

/** A person, across the platform: profile, workspaces and exact roles, devices, conversations. */
export default function AdminUserPage() {
  const { userId } = useParams<{ userId: string }>();
  const user = useAdminLoad(userId, () => adminApi.user(userId));
  const self = useAdminMe();
  const [resetOpen, setResetOpen] = useState(false);
  const [moderating, setModerating] = useState<'suspension' | 'password' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Remounts the session inspector after an action that ended sessions. */
  const [sessionsVersion, setSessionsVersion] = useState(0);

  const onModerated = ({ user: changed, sessionsRevoked }: PlatformModerationResult) => {
    const what = moderating;
    setModerating(null);
    const closed = sessionsRevoked > 0 ? ` ${toPersianDigits(sessionsRevoked)} نشست بسته شد.` : '';
    setNotice(
      what === 'suspension'
        ? changed.status === 'suspended'
          ? `حساب معلق شد.${closed}`
          : 'تعلیق حساب برداشته شد.'
        : changed.passwordResetRequired
          ? `کاربر باید رمز عبور تازه‌ای بگذارد.${closed}`
          : 'اجبار تغییر رمز لغو شد.',
    );
    if (sessionsRevoked > 0) setSessionsVersion((value) => value + 1);
    user.reload();
  };

  return (
    <>
      <Link href="/admin/users" className="mb-3 inline-flex items-center gap-1 text-body-sm text-fg-tertiary hover:text-fg-primary">
        <ArrowRightIcon size={16} />
        کاربران
      </Link>
      <Loaded load={user}>
        {(profile) => (
          <>
            <PageHeader
              title={profile.fullName}
              description="پروفایل، ورک‌اسپیس‌ها، نشست‌ها و گفتگوهای این کاربر"
              actions={
                <>
                  <Button variant="secondary" iconStart={<KeyIcon size={16} />} onClick={() => setResetOpen(true)}>
                    بازنشانی رمز عبور
                  </Button>
                  {profile.id !== self.userId && profile.status !== 'deleted' && (
                    <>
                      <Button variant="secondary" iconStart={<KeyIcon size={16} />} onClick={() => setModerating('password')}>
                        {profile.passwordResetRequired ? 'لغو اجبار تغییر رمز' : 'اجبار به تغییر رمز عبور'}
                      </Button>
                      {profile.status === 'suspended' ? (
                        <Button variant="primary" iconStart={<CheckCircleIcon size={16} />} onClick={() => setModerating('suspension')}>
                          رفع تعلیق
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          iconStart={<LockIcon size={16} />}
                          disabled={profile.isPlatformAdmin}
                          title={profile.isPlatformAdmin ? 'مدیران پلتفرم را نمی‌توان از اینجا معلق کرد.' : undefined}
                          onClick={() => setModerating('suspension')}
                        >
                          تعلیق کاربر
                        </Button>
                      )}
                    </>
                  )}
                </>
              }
            />
            {notice && (
              <p role="status" className="mb-4 rounded-lg bg-status-done-subtle px-3 py-2 text-body-sm text-status-done">
                {notice}
              </p>
            )}
            {profile.status === 'suspended' && (
              <div role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-secondary bg-sunken px-3 py-2 text-body-sm text-fg-secondary">
                <WarningIcon size={18} className="mt-0.5 shrink-0 text-warning-600" />
                <span>
                  این حساب معلق است: ورود و همه درخواست‌هایش رد می‌شود.
                  {profile.suspension?.reason ? ` دلیل: ${profile.suspension.reason}` : ''}
                </span>
              </div>
            )}
            <Panel title="پروفایل">
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Fact label="موبایل">
                  <span dir="ltr">{phoneLabel(profile.phone)}</span>
                </Fact>
                <Fact label="ایمیل">{profile.email ? <span dir="ltr">{profile.email}</span> : '—'}</Fact>
                <Fact label="وضعیت حساب">
                  <Badge tone={USER_STATUS[profile.status].tone} size="sm">
                    {USER_STATUS[profile.status].label}
                  </Badge>
                </Fact>
                <Fact label="عضویت از">{formatJalali(profile.createdAt, 'medium')}</Fact>
                <Fact label="رمز عبور">
                  {profile.passwordResetRequired ? (
                    <Badge tone="warning" size="sm">
                      در انتظار بازنشانی
                    </Badge>
                  ) : profile.hasPassword ? (
                    `تعیین‌شده${profile.passwordChangedAt ? ` — ${formatJalali(profile.passwordChangedAt, 'medium')}` : ''}`
                  ) : (
                    'ندارد'
                  )}
                </Fact>
                <Fact label="آخرین فعالیت">{profile.lastActiveAt ? dateTimeLabel(profile.lastActiveAt) : '—'}</Fact>
                <Fact label="نقش پلتفرم">{profile.isPlatformAdmin ? <Badge tone="brand" size="sm">مدیر پلتفرم</Badge> : 'کاربر عادی'}</Fact>
                {profile.status === 'suspended' && profile.suspension && (
                  <>
                    <Fact label="تاریخ تعلیق">{dateTimeLabel(profile.suspension.at)}</Fact>
                    <Fact label="تعلیق توسط">{profile.suspension.adminName ?? '—'}</Fact>
                    <Fact label="دلیل تعلیق">
                      <span dir="auto">{profile.suspension.reason ?? '—'}</span>
                    </Fact>
                  </>
                )}
              </dl>
            </Panel>
            <Panel title="ورک‌اسپیس‌ها و نقش‌ها">
              {profile.memberships.length === 0 ? (
                <p className="py-2 text-body-sm text-fg-tertiary">عضو هیچ ورک‌اسپیسی نیست.</p>
              ) : (
                <TableFrame label="عضویت در ورک‌اسپیس‌ها">
                  <table className={TABLE}>
                    <thead>
                      <tr>
                        <th className={TH}>ورک‌اسپیس</th>
                        <th className={TH}>نقش</th>
                        <th className={TH}>وضعیت عضویت</th>
                        <th className={TH}>واحد / عنوان شغلی</th>
                        <th className={TH}>پروژه‌ها</th>
                        <th className={TH}>پیوستن</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.memberships.map((membership) => (
                        <tr key={membership.workspaceId}>
                          <td className={TD}>
                            <Link href={`/admin/workspaces/${membership.workspaceId}`} className="font-semibold text-fg-brand hover:underline">
                              {membership.workspaceName}
                            </Link>
                            {membership.workspaceDeleted && (
                              <Badge tone="error" size="sm" className="ms-2">
                                حذف‌شده
                              </Badge>
                            )}
                          </td>
                          <td className={TD}>
                            <span className="inline-flex items-center gap-1">
                              {membership.isOwner && <CrownIcon size={14} className="text-warning-600" />}
                              {membership.roleName}
                            </span>
                            <span dir="ltr" className="ms-1 text-caption text-fg-tertiary">
                              ({membership.roleKey})
                            </span>
                          </td>
                          <td className={TD}>
                            <Badge tone={MEMBER_STATUS[membership.memberStatus].tone} size="sm">
                              {MEMBER_STATUS[membership.memberStatus].label}
                            </Badge>
                          </td>
                          <td className={TD}>{[membership.department, membership.jobTitle].filter(Boolean).join(' / ') || '—'}</td>
                          <td className={TD}>
                            {membership.projects.length === 0 ? (
                              '—'
                            ) : (
                              <ul className="flex flex-wrap gap-1">
                                {membership.projects.map((project) => (
                                  <li key={project.id}>
                                    <Badge size="sm">
                                      {project.name} · {PROJECT_ROLES[project.role]}
                                    </Badge>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                          <td className={TD}>
                            {formatJalali(membership.joinedAt, 'medium')}
                            {membership.leftAt && <p className="text-caption text-fg-tertiary">خروج: {formatJalali(membership.leftAt, 'medium')}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableFrame>
              )}
            </Panel>
            <SessionsPanel key={sessionsVersion} userId={profile.id} onChanged={user.reload} />
            <ConversationList userId={profile.id} />
            <ResetPasswordDialog user={profile} open={resetOpen} onClose={() => setResetOpen(false)} onIssued={user.reload} />
            {moderating === 'suspension' && (
              <SuspendUserDialog user={profile} mode={profile.status === 'suspended' ? 'unsuspend' : 'suspend'} open onClose={() => setModerating(null)} onDone={onModerated} />
            )}
            {moderating === 'password' && <ForcePasswordResetDialog user={profile} open onClose={() => setModerating(null)} onDone={onModerated} />}
          </>
        )}
      </Loaded>
    </>
  );
}

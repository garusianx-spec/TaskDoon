'use client';

import { useState } from 'react';
import type { PlatformSessionView } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { adminApi } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { dateTimeLabel, DEVICE_TYPES, REVOKE_REASONS, SESSION_STATUS } from '@/admin/format';
import { useAdminLoad } from '@/admin/use-admin-load';
import { problemMessage } from '@/api/messages';
import { Badge, Button, Modal, SegmentedControl } from '@/components/ui';
import { LogoutIcon, MonitorIcon, MobileIcon } from '@/components/icons';
import { Loaded, Panel, TABLE, TableFrame, TD, TH } from './AdminUi';

type Filter = 'active' | 'revoked' | 'all';

/** Session inspector: every signed-in device of a person, and ending one or all of them. */
export function SessionsPanel({ userId, onChanged, initialFilter = 'all' }: { readonly userId: string; readonly onChanged: () => void; readonly initialFilter?: Filter }) {
  const { call } = useAdmin();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const sessions = useAdminLoad(`${userId}:${filter}`, () => adminApi.sessions(userId, filter));
  const [confirm, setConfirm] = useState<{ readonly kind: 'one'; readonly session: PlatformSessionView } | { readonly kind: 'all' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const act = async () => {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      if (confirm.kind === 'one') {
        await call(() => adminApi.revokeSession(confirm.session.id));
        setNotice('نشست پایان یافت.');
      } else {
        const { revoked } = await call(() => adminApi.revokeAll(userId));
        setNotice(`${toPersianDigits(revoked)} نشست پایان یافت.`);
      }
      setConfirm(null);
      sessions.reload();
      onChanged();
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      id="sessions"
      title="نشست‌ها و دستگاه‌ها"
      actions={
        <>
          <SegmentedControl<Filter>
            ariaLabel="وضعیت نشست‌ها"
            size="sm"
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: 'all', label: 'همه' },
              { value: 'active', label: 'فعال' },
              { value: 'revoked', label: 'پایان‌یافته' },
            ]}
          />
          <Button variant="destructive" size="sm" iconStart={<LogoutIcon size={16} />} onClick={() => setConfirm({ kind: 'all' })}>
            پایان همه نشست‌ها
          </Button>
        </>
      }
    >
      {notice && (
        <p role="status" className="mb-3 rounded-lg bg-status-done-subtle px-3 py-2 text-body-sm text-status-done">
          {notice}
        </p>
      )}
      <Loaded load={sessions} empty={(data) => data.length === 0}>
        {(data) => (
          <TableFrame label="فهرست نشست‌ها">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>دستگاه</th>
                  <th className={TH}>نشانی IP</th>
                  <th className={TH}>شروع</th>
                  <th className={TH}>آخرین فعالیت</th>
                  <th className={TH}>وضعیت</th>
                  <th className={TH}>
                    <span className="sr-only">اقدام</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((session) => (
                  <tr key={session.id}>
                    <td className={TD}>
                      <div className="flex items-start gap-2">
                        {session.deviceType === 'mobile' || session.deviceType === 'tablet' ? (
                          <MobileIcon size={18} className="mt-0.5 shrink-0 text-fg-tertiary" />
                        ) : (
                          <MonitorIcon size={18} className="mt-0.5 shrink-0 text-fg-tertiary" />
                        )}
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{[session.client, session.os].filter(Boolean).join(' · ') || session.deviceLabel || 'دستگاه ناشناس'}</span>
                          <span className="text-caption text-fg-tertiary">
                            {[session.deviceType ? DEVICE_TYPES[session.deviceType] : null, session.deviceLabel].filter(Boolean).join(' — ')}
                          </span>
                          {session.userAgent && (
                            <span dir="ltr" className="max-w-xs truncate text-start text-caption text-fg-quaternary" title={session.userAgent}>
                              {session.userAgent}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={TD}>
                      <div className="flex flex-col gap-0.5" dir="ltr">
                        <span className="text-start">{session.ip ?? '—'}</span>
                        {session.lastIp && session.lastIp !== session.ip && <span className="text-start text-caption text-fg-tertiary">last: {session.lastIp}</span>}
                      </div>
                    </td>
                    <td className={TD}>{dateTimeLabel(session.createdAt)}</td>
                    <td className={TD}>{dateTimeLabel(session.lastActiveAt)}</td>
                    <td className={TD}>
                      <Badge tone={SESSION_STATUS[session.status].tone} size="sm">
                        {SESSION_STATUS[session.status].label}
                      </Badge>
                      {session.revokeReason && <p className="mt-1 text-caption text-fg-tertiary">{REVOKE_REASONS[session.revokeReason] ?? session.revokeReason}</p>}
                    </td>
                    <td className={TD}>
                      {session.status === 'active' && (
                        <Button variant="secondary" size="xs" onClick={() => setConfirm({ kind: 'one', session })}>
                          پایان نشست
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        )}
      </Loaded>
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        role="alertdialog"
        size="sm"
        title={confirm?.kind === 'all' ? 'پایان همه نشست‌ها' : 'پایان این نشست'}
        description={
          confirm?.kind === 'all'
            ? 'همه دستگاه‌های این کاربر فوراً از حساب خارج می‌شوند و باید دوباره با کد پیامکی وارد شوند.'
            : 'این دستگاه فوراً از حساب خارج می‌شود و باید دوباره با کد پیامکی وارد شود.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              انصراف
            </Button>
            <Button variant="destructive" loading={busy} onClick={() => void act()}>
              {confirm?.kind === 'all' ? 'پایان همه' : 'پایان نشست'}
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="text-body-sm text-status-blocked">
            {error}
          </p>
        ) : (
          <p className="text-body-sm text-fg-secondary">این اقدام در گزارش بازرسی ثبت می‌شود.</p>
        )}
      </Modal>
    </Panel>
  );
}

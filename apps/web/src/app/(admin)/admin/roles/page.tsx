'use client';

import { useState, type FormEvent } from 'react';
import type { AdministrativeUser, AssignAdminRoleBody } from '@taskin/contracts';
import { normaliseIranMobile } from '@taskin/text';
import { adminApi } from '@/features/admin/api/admin-api';
import { useAdmin, useAdminMe } from '@/features/admin/hooks/AdminSession';
import { useAdminLoad } from '@/features/admin/hooks/use-admin-load';
import { dateTimeLabel, phoneLabel } from '@/features/admin/lib/format';
import { problemMessage } from '@/lib/api-problem';
import { Loaded, PageHeader, Panel, TD, TH } from '@/features/admin/components/AdminUi';
import { DataTable, TableFrame } from '@/components/shared/DataTable';
import { Badge, Button, Input, Modal, Select } from '@/components/ui';
import { AddIcon, RefreshIcon } from '@/components/icons';

const ROLE_LABEL = { SUPER_ADMIN: 'مدیر ارشد', ADMIN: 'مدیر', OPERATOR: 'اپراتور' } as const;
const ROLE_OPTIONS = [
  { value: 'ADMIN' as const, label: 'مدیر (ADMIN)' },
  { value: 'OPERATOR' as const, label: 'اپراتور (OPERATOR)' },
];
const STATUS_LABEL = { ACTIVE: 'فعال', PENDING_SETUP: 'در انتظار راه‌اندازی', SUSPENDED: 'معلق' } as const;
const STATUS_TONE = { ACTIVE: 'success', PENDING_SETUP: 'warning', SUSPENDED: 'error' } as const;
type Action = { user: AdministrativeUser; kind: 'role' | 'suspend' | 'revoke' };

export default function AdminRolesPage() {
  const me = useAdminMe();
  const { call } = useAdmin();
  const allowed = me.role === 'SUPER_ADMIN';
  const load = useAdminLoad('administrative-users', () =>
    allowed ? adminApi.administrativeUsers() : Promise.resolve([]),
  );
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [role, setRole] = useState<'ADMIN' | 'OPERATOR'>('ADMIN');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!allowed)
    return (
      <PageHeader
        title="دسترسی مجاز نیست"
        description="مدیریت مدیران فقط برای مدیر ارشد پلتفرم در دسترس است."
      />
    );
  const complete = async () => {
    if (!action || busy) return;
    setBusy(true);
    setError(null);
    try {
      await call<AdministrativeUser | void>(() =>
        action.kind === 'revoke'
          ? adminApi.revokeAdmin(action.user.id)
          : adminApi.updateAdmin(
              action.user.id,
              action.kind === 'role' ? { role } : { suspended: action.user.status !== 'SUSPENDED' },
            ),
      );
      setNotice('دسترسی مدیر به‌روزرسانی شد و نشست‌های قبلی پایان یافت.');
      setAction(null);
      load.reload();
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto w-full max-w-screen-xl">
      <PageHeader
        title="مدیریت دسترسی‌ها و مدیران"
        description="مدیران پلتفرم را اضافه کنید و نقش یا وضعیت دسترسی آن‌ها را تغییر دهید."
        actions={
          <>
            <Button variant="secondary" iconStart={<RefreshIcon size={18} />} onClick={load.reload}>
              بازخوانی
            </Button>
            <Button iconStart={<AddIcon size={18} />} onClick={() => setAdding(true)}>
              افزودن مدیر جدید
            </Button>
          </>
        }
      />
      {notice && (
        <p role="status" className="mb-4 text-body-sm text-status-done">
          {notice}
        </p>
      )}
      <Panel title="مدیران پلتفرم">
        <Loaded load={load} empty={(users) => users.length === 0}>
          {(users) => (
            <TableFrame label="فهرست مدیران و دسترسی‌ها">
              <DataTable className="w-full min-w-[1100px] border-collapse text-start text-body-sm">
                <thead>
                  <tr>
                    {['نام', 'شماره موبایل', 'ایمیل بازیابی', 'نقش', 'تاریخ ایجاد', 'وضعیت', 'عملیات'].map(
                      (label) => (
                        <th key={label} className={TH} scope="col">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className={TD}>
                        {user.fullName}
                        {user.protected && (
                          <span className="mt-1 block text-caption text-fg-tertiary">
                            مالک اصلی · محافظت‌شده
                          </span>
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap`} dir="ltr">
                        {phoneLabel(user.phone)}
                      </td>
                      <td className={`${TD} min-w-[180px] break-words`} dir="ltr">
                        {user.email ?? '—'}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>{ROLE_LABEL[user.role]}</td>
                      <td className={`${TD} whitespace-nowrap`}>{dateTimeLabel(user.createdAt)}</td>
                      <td className={TD}>
                        <Badge className="whitespace-nowrap" tone={STATUS_TONE[user.status]}>
                          {STATUS_LABEL[user.status]}
                        </Badge>
                      </td>
                      <td className={TD}>
                        {!user.protected && user.id !== me.userId ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setRole(user.role === 'OPERATOR' ? 'OPERATOR' : 'ADMIN');
                                setError(null);
                                setAction({ user, kind: 'role' });
                              }}
                            >
                              تغییر نقش
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setError(null);
                                setAction({ user, kind: 'suspend' });
                              }}
                            >
                              {user.status === 'SUSPENDED' ? 'رفع تعلیق' : 'تعلیق'}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setError(null);
                                setAction({ user, kind: 'revoke' });
                              }}
                            >
                              لغو دسترسی مدیریت
                            </Button>
                          </div>
                        ) : (
                          <span className="text-caption text-fg-tertiary">غیرقابل تغییر</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </TableFrame>
          )}
        </Loaded>
      </Panel>
      {adding && (
        <AssignAdminDialog
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            setNotice(
              'مدیر اضافه شد. راه‌اندازی با کد موبایل، تأیید ایمیل و رمز جدید در ورود بعدی انجام می‌شود.',
            );
            load.reload();
          }}
        />
      )}
      <Modal
        open={action !== null}
        onClose={() => {
          if (!busy) setAction(null);
        }}
        title={
          action?.kind === 'role'
            ? 'تغییر نقش مدیر'
            : action?.kind === 'revoke'
              ? 'لغو دسترسی مدیریت'
              : action?.user.status === 'SUSPENDED'
                ? 'رفع تعلیق مدیر'
                : 'تعلیق مدیر'
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setAction(null)}>
              انصراف
            </Button>
            <Button loading={busy} onClick={() => void complete()}>
              تأیید تغییر
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-body-sm text-fg-secondary">
            {action?.user.fullName} · تغییر دسترسی، نشست‌های فعال این حساب را پایان می‌دهد. لغو دسترسی، حساب و
            داده‌های شخصی او را حذف نمی‌کند.
          </p>
          {action?.kind === 'role' && (
            <Select label="نقش مدیر" value={role} options={ROLE_OPTIONS} onValueChange={setRole} />
          )}
          {error && (
            <p role="alert" className="text-body-sm text-status-blocked">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function AssignAdminDialog({
  onClose,
  onDone,
}: {
  readonly onClose: () => void;
  readonly onDone: () => void;
}) {
  const { call } = useAdmin();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignAdminRoleBody['role']>('ADMIN');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const mobile = normaliseIranMobile(phone);
    if (!mobile) {
      setError('شماره موبایل معتبر ایرانی وارد کنید.');
      return;
    }
    if (name.trim().length < 2) {
      setError('نام مدیر را کامل وارد کنید.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await call(() =>
        adminApi.assignAdmin({ phone: mobile, fullName: name.trim(), recoveryEmail: email.trim(), role }),
      );
      onDone();
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="افزودن مدیر جدید"
      size="md"
    >
      <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)}>
        <p className="text-body-sm text-fg-secondary">
          حساب موجود ارتقا پیدا می‌کند؛ برای شماره جدید، حسابی در انتظار راه‌اندازی ساخته می‌شود. ایمیل باید
          در ورود بعدی تأیید شود.
        </p>
        <Input
          label="شماره موبایل مدیر"
          type="tel"
          dir="ltr"
          autoComplete="off"
          required
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <Input
          label="نام مدیر"
          required
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          label="ایمیل بازیابی"
          type="email"
          dir="ltr"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Select
          label="نقش مدیر جدید"
          options={ROLE_OPTIONS}
          value={role}
          onValueChange={setRole}
          disabled={busy}
        />
        {error && (
          <p role="alert" className="text-body-sm text-status-blocked">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            انصراف
          </Button>
          <Button type="submit" loading={busy}>
            افزودن مدیر
          </Button>
        </div>
      </form>
    </Modal>
  );
}

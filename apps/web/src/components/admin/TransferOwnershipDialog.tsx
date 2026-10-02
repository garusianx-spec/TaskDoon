'use client';

import { useMemo, useState } from 'react';
import type { PlatformWorkspaceDetail, PlatformWorkspaceModerationResult } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { adminApi } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { phoneLabel } from '@/admin/format';
import { useAdminLoad } from '@/admin/use-admin-load';
import { problemMessage } from '@/api/messages';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { CrownIcon, SearchIcon, WarningIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { Loaded } from './AdminUi';

type Member = PlatformWorkspaceDetail['members'][number];

const MIN_REASON = 3;

/** Why a member cannot take over, or `null` when they can (what the API accepts). */
function ineligible(member: Member): string | null {
  if (member.isOwner) return 'مالک فعلی';
  if (member.status === 'left') return 'خارج‌شده از فضای کاری';
  if (member.status !== 'active') return 'عضویت معلق';
  if (member.accountStatus === 'deleted') return 'حساب حذف‌شده';
  if (member.accountStatus === 'suspended') return 'حساب معلق';
  return null;
}

/**
 * The emergency ownership override: pick an active member whose account is active. The previous
 * owner stays on as an admin. Without `detail` the members are loaded here (a recorded view).
 */
export function TransferOwnershipDialog({
  workspaceId,
  workspaceName,
  detail,
  onClose,
  onDone,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly detail?: PlatformWorkspaceDetail | null;
  readonly onClose: () => void;
  readonly onDone: (result: PlatformWorkspaceModerationResult) => void;
}) {
  const { call } = useAdmin();
  const loaded = useAdminLoad(detail ? null : workspaceId, () => adminApi.workspace(workspaceId));
  const source = detail ? { ...loaded, data: detail, error: null } : loaded;
  const [filter, setFilter] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const members = useMemo(() => {
    const needle = filter.trim();
    return (source.data?.members ?? []).filter((member) => member.status !== 'left' && (!needle || member.fullName.includes(needle) || member.phone.includes(needle.replace(/^0/, ''))));
  }, [source.data, filter]);
  const picked = source.data?.members.find((member) => member.userId === chosen) ?? null;
  const ready = picked !== null && reason.trim().length >= MIN_REASON;

  const close = () => {
    if (!busy) onClose();
  };

  const confirm = async () => {
    if (!picked || !ready) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await call(() => adminApi.transferWorkspaceOwnership(workspaceId, picked.userId, reason.trim())));
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      role="alertdialog"
      size="lg"
      icon={<CrownIcon size={20} />}
      title={`انتقال مالکیت ${workspaceName}`}
      description="مالک تازه همه اختیارات مالک را می‌گیرد و مالک فعلی مدیر فضای کاری می‌شود."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            انصراف
          </Button>
          <Button variant="destructive" loading={busy} disabled={!ready} onClick={() => void confirm()}>
            انتقال مالکیت
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Loaded load={source}>
          {() => (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-body-sm font-medium text-fg-secondary">مالک تازه</legend>
              <Input label="جستجوی عضو" hideLabel placeholder="نام یا شماره موبایل" value={filter} onChange={(event) => setFilter(event.target.value)} iconStart={<SearchIcon size={16} />} />
              <div className="scrollbar-thin flex max-h-72 flex-col gap-1.5 overflow-y-auto" role="radiogroup" aria-label="اعضای فضای کاری">
                {members.length === 0 && <p className="py-3 text-center text-body-sm text-fg-tertiary">عضوی پیدا نشد.</p>}
                {members.map((member) => {
                  const why = ineligible(member);
                  return (
                    <label
                      key={member.userId}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-2.5 transition-colors',
                        why ? 'cursor-not-allowed border-secondary opacity-60' : 'cursor-pointer',
                        !why && chosen === member.userId ? 'border-brand bg-brand-subtle' : !why && 'border-secondary hover:bg-hover',
                      )}
                    >
                      <input
                        type="radio"
                        name="new-owner"
                        className="accent-fg-brand"
                        checked={chosen === member.userId}
                        disabled={why !== null}
                        onChange={() => setChosen(member.userId)}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-body-sm font-semibold text-fg-primary">{member.fullName}</span>
                        <span className="text-caption text-fg-tertiary">
                          {member.roleName} · <span dir="ltr">{phoneLabel(member.phone)}</span>
                        </span>
                      </span>
                      {why && <span className="shrink-0 text-caption text-fg-tertiary">{why}</span>}
                    </label>
                  );
                })}
              </div>
              <p className="text-caption text-fg-tertiary">{toPersianDigits(members.filter((member) => !ineligible(member)).length)} عضو می‌توانند مالک شوند.</p>
            </fieldset>
          )}
        </Loaded>
        {picked && picked.hasPassword === false && (
          <p role="note" className="flex items-start gap-2 rounded-lg bg-sunken px-3 py-2 text-body-sm text-fg-secondary">
            <WarningIcon size={18} className="mt-0.5 shrink-0 text-warning-600" />
            {picked.fullName} هنوز رمز عبور ندارد؛ برای کارهای حساس مالک (حذف یا انتقال فضای کاری) باید رمز عبور بگذارد.
          </p>
        )}
        <Textarea
          label="دلیل انتقال"
          hint={`الزامی، دست‌کم ${toPersianDigits(MIN_REASON)} نویسه؛ در گزارش بازرسی ثبت می‌شود.`}
          rows={2}
          maxLength={500}
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {error && (
          <p role="alert" className="rounded-lg bg-status-blocked-subtle px-3 py-2 text-body-sm text-status-blocked">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

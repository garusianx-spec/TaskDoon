'use client';

import { useState } from 'react';
import type { PlanLimits, PlatformPlanOption, PlatformWorkspaceQuota, WorkspaceLimitOverrides } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { toLatinDigits } from '@taskin/text';
import { adminApi } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { bytesLabel } from '@/admin/format';
import { problemMessage } from '@/api/messages';
import { Badge, Button, Checkbox, Input, ProgressBar, Select, Textarea } from '@/components/ui';
import { Panel } from './AdminUi';

type LimitKey = keyof PlanLimits;

interface LimitSpec {
  readonly key: LimitKey;
  readonly label: string;
  /** Bytes per unit the admin types in; 1 for counts. */
  readonly unit: number;
  readonly unitLabel: string;
  /** `null` means unlimited for this limit. */
  readonly nullable: boolean;
}

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

const LIMITS: readonly LimitSpec[] = [
  { key: 'maxMembers', label: 'حداکثر اعضا', unit: 1, unitLabel: 'نفر', nullable: false },
  { key: 'maxProjects', label: 'حداکثر پروژه', unit: 1, unitLabel: 'پروژه', nullable: true },
  { key: 'storageBytes', label: 'فضای ذخیره‌سازی', unit: GIB, unitLabel: 'گیگابایت', nullable: false },
  { key: 'maxFileBytes', label: 'حداکثر حجم هر فایل', unit: MIB, unitLabel: 'مگابایت', nullable: false },
  { key: 'messageHistoryDays', label: 'نگهداری تاریخچه پیام', unit: 1, unitLabel: 'روز', nullable: true },
];

/** One limit as the admin sees it: what the plan says, or a custom value (or unlimited). */
interface Row {
  readonly custom: boolean;
  readonly unlimited: boolean;
  readonly value: string;
}

function show(spec: LimitSpec, value: number | null): string {
  if (value === null) return 'نامحدود';
  if (spec.key === 'storageBytes' || spec.key === 'maxFileBytes') return bytesLabel(value);
  return `${toPersianDigits(value)} ${spec.unitLabel}`;
}

function rowsFrom(overrides: WorkspaceLimitOverrides | null): Record<LimitKey, Row> {
  const rows = {} as Record<LimitKey, Row>;
  for (const spec of LIMITS) {
    const value = overrides?.[spec.key];
    rows[spec.key] =
      value === undefined
        ? { custom: false, unlimited: false, value: '' }
        : value === null
          ? { custom: true, unlimited: true, value: '' }
          : { custom: true, unlimited: false, value: String(Number((value / spec.unit).toFixed(2))) };
  }
  return rows;
}

/**
 * «سهمیه‌ها و پلن»: the workspace's plan, the platform admin's overrides of its limits (each
 * replaces the plan's; the rest follow the plan), what it is held to, and what it uses.
 */
export function WorkspaceQuotaPanel({
  workspaceId,
  quota,
  planOptions,
  readOnly,
  onSaved,
}: {
  readonly workspaceId: string;
  readonly quota: PlatformWorkspaceQuota;
  readonly planOptions: readonly PlatformPlanOption[];
  readonly readOnly: boolean;
  readonly onSaved: () => void;
}) {
  const { call } = useAdmin();
  const [planId, setPlanId] = useState(quota.planId);
  const [rows, setRows] = useState(() => rowsFrom(quota.overrides));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const plan = planOptions.find((option) => option.id === planId)?.limits ?? quota.effective;

  const update = (key: LimitKey, patch: Partial<Row>) => setRows((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  /** The overrides as the API takes them, or a message saying which value is not right. */
  const collect = (): { overrides: WorkspaceLimitOverrides | null } | { problem: string } => {
    const overrides: Record<string, number | null> = {};
    for (const spec of LIMITS) {
      const row = rows[spec.key];
      if (!row.custom) continue;
      if (spec.nullable && row.unlimited) {
        overrides[spec.key] = null;
        continue;
      }
      const amount = Number(toLatinDigits(row.value.trim()));
      const value = Math.round(amount * spec.unit);
      if (!row.value.trim() || !Number.isFinite(amount) || value < 1) return { problem: `مقدار «${spec.label}» باید عددی بزرگ‌تر از صفر باشد.` };
      overrides[spec.key] = value;
    }
    return { overrides: Object.keys(overrides).length > 0 ? (overrides as WorkspaceLimitOverrides) : null };
  };

  const save = async () => {
    const collected = collect();
    if ('problem' in collected) {
      setError(collected.problem);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await call(() =>
        adminApi.setWorkspaceLimits(workspaceId, { ...(planId !== quota.planId ? { planId } : {}), overrides: collected.overrides, reason: reason.trim() }),
      );
      setNotice(result.changed ? 'پلن و سهمیه‌ها ذخیره شد.' : 'تغییری نبود؛ همه چیز همان است که بود.');
      setReason('');
      onSaved();
    } catch (failure) {
      setError(problemMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const usage: readonly { readonly label: string; readonly used: number; readonly limit: number | null; readonly format: (value: number) => string }[] = [
    { label: 'اعضا', used: quota.usage.members, limit: quota.effective.maxMembers, format: (value) => toPersianDigits(value) },
    { label: 'پروژه‌ها', used: quota.usage.projects, limit: quota.effective.maxProjects, format: (value) => toPersianDigits(value) },
    { label: 'فضای ذخیره‌سازی', used: quota.usage.storageUsedBytes, limit: quota.effective.storageBytes, format: bytesLabel },
  ];

  return (
    <Panel id="quota" title="سهمیه‌ها و پلن">
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {usage.map((entry) => (
          <div key={entry.label} className="flex flex-col gap-1.5">
            <span className="text-caption text-fg-tertiary">{entry.label}</span>
            <span className="text-body-sm font-semibold text-fg-primary">
              {entry.format(entry.used)} از {entry.limit === null ? 'نامحدود' : entry.format(entry.limit)}
            </span>
            {entry.limit !== null && (
              <ProgressBar value={Math.min(entry.used, entry.limit)} max={Math.max(entry.limit, 1)} label={`مصرف ${entry.label}`} tone={entry.used >= entry.limit ? 'blocked' : 'brand'} showFraction={false} />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <div className="max-w-xs">
          <Select
            label="پلن"
            hideLabel={false}
            value={planId}
            disabled={readOnly}
            onValueChange={setPlanId}
            options={planOptions.map((option) => ({ value: option.id, label: option.name }))}
          />
        </div>

        <fieldset className="flex flex-col gap-2" disabled={readOnly}>
          <legend className="mb-1 text-body-sm font-medium text-fg-secondary">سقف‌ها (پیش‌فرض: همان پلن)</legend>
          {LIMITS.map((spec) => {
            const row = rows[spec.key];
            return (
              <div key={spec.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-secondary px-3 py-2">
                <span className="min-w-[10rem] flex-1 text-body-sm font-medium text-fg-primary">{spec.label}</span>
                <span className="text-caption text-fg-tertiary">پلن: {show(spec, plan[spec.key])}</span>
                <Checkbox
                  size="sm"
                  checked={row.custom}
                  disabled={readOnly}
                  onCheckedChange={(custom) => update(spec.key, { custom })}
                  label={
                    <span className="text-caption text-fg-secondary">
                      مقدار سفارشی<span className="sr-only"> برای {spec.label}</span>
                    </span>
                  }
                />
                {row.custom && spec.nullable && (
                  <Checkbox
                    size="sm"
                    checked={row.unlimited}
                    disabled={readOnly}
                    onCheckedChange={(unlimited) => update(spec.key, { unlimited })}
                    label={
                      <span className="text-caption text-fg-secondary">
                        نامحدود<span className="sr-only"> برای {spec.label}</span>
                      </span>
                    }
                  />
                )}
                {row.custom && !(spec.nullable && row.unlimited) && (
                  <Input
                    containerClassName="w-40"
                    label={`${spec.label} (${spec.unitLabel})`}
                    hideLabel
                    dir="ltr"
                    inputMode="decimal"
                    disabled={readOnly}
                    value={row.value}
                    onChange={(event) => update(spec.key, { value: event.target.value })}
                    placeholder={spec.unitLabel}
                  />
                )}
                {row.custom && <Badge size="sm" tone="brand">سفارشی</Badge>}
              </div>
            );
          })}
        </fieldset>

        {!readOnly && (
          <>
            <Textarea label="دلیل تغییر" hint="الزامی؛ در گزارش بازرسی ثبت می‌شود." rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
            {error && (
              <p role="alert" className="rounded-lg bg-status-blocked-subtle px-3 py-2 text-body-sm text-status-blocked">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-lg bg-status-done-subtle px-3 py-2 text-body-sm text-status-done">
                {notice}
              </p>
            )}
            <div>
              <Button loading={busy} disabled={reason.trim().length < 3} onClick={() => void save()}>
                ذخیره پلن و سهمیه‌ها
              </Button>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

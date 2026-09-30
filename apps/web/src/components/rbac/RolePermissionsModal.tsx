'use client';

import { useMemo, useState } from 'react';
import type {
  DepartmentId,
  PermissionActionId,
  PermissionMatrix,
  PermissionModuleId,
  RoleId,
} from '@taskin/contracts';
import { DEPARTMENTS, PERMISSION_ACTIONS, PERMISSION_MODULES, ROLES } from '@/data/reference';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { Badge, Button, Modal, Switch, Tooltip } from '@/components/ui';
import { PermissionMatrixTable, RoleList } from './PermissionMatrixTable';
import { BriefcaseIcon, InfoCircleIcon, KeyIcon, RefreshIcon, ShieldIcon } from '@/components/icons';

export interface RolePermissionsModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly permissions: PermissionMatrix;
  readonly onChange: (permissions: PermissionMatrix) => void;
  readonly onReset: () => void;
}

/**
 * Enterprise permission settings.
 *
 * Edits are staged in local state so "ذخیره تغییرات" is a single atomic commit and
 * "انصراف" genuinely discards. Bulk actions work on the staged copy and apply per role,
 * per module row, per action column, and — via the department scope — to every role that has
 * members in the selected departments.
 */
export function RolePermissionsModal({
  open,
  onClose,
  permissions,
  onChange,
  onReset,
}: RolePermissionsModalProps) {
  const [staged, setStaged] = useState<PermissionMatrix>(permissions);
  const [activeRole, setActiveRole] = useState<RoleId>('admin');
  const [scopedDepartments, setScopedDepartments] = useState<readonly DepartmentId[]>([]);

  // Re-stage whenever the modal is (re)opened so it always edits the live matrix.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setStaged(permissions);
  }

  const role = useMemo(
    () => ROLES.find((entry) => entry.id === activeRole) ?? ROLES[0],
    [activeRole],
  );

  const dirty = useMemo(
    () => JSON.stringify(staged) !== JSON.stringify(permissions),
    [staged, permissions],
  );

  const setCell = (
    targetRole: RoleId,
    module: PermissionModuleId,
    action: PermissionActionId,
    value: boolean,
  ) => {
    if (targetRole === 'owner') return;
    setStaged((current) => ({
      ...current,
      [targetRole]: {
        ...current[targetRole],
        [module]: { ...current[targetRole][module], [action]: value },
      },
    }));
  };

  const setModuleRow = (targetRole: RoleId, module: PermissionModuleId, value: boolean) => {
    if (targetRole === 'owner') return;
    const filled = Object.fromEntries(
      PERMISSION_ACTIONS.map((action) => [action.id, value]),
    ) as Readonly<Record<PermissionActionId, boolean>>;
    setStaged((current) => ({
      ...current,
      [targetRole]: { ...current[targetRole], [module]: filled },
    }));
  };

  const setActionColumn = (targetRole: RoleId, action: PermissionActionId, value: boolean) => {
    if (targetRole === 'owner') return;
    setStaged((current) => ({
      ...current,
      [targetRole]: Object.fromEntries(
        PERMISSION_MODULES.map((module) => [
          module.id,
          { ...current[targetRole][module.id], [action]: value },
        ]),
      ) as PermissionMatrix[RoleId],
    }));
  };

  const setWholeRole = (targetRole: RoleId, value: boolean) => {
    if (targetRole === 'owner') return;
    const filled = Object.fromEntries(
      PERMISSION_ACTIONS.map((action) => [action.id, value]),
    ) as Readonly<Record<PermissionActionId, boolean>>;
    setStaged((current) => ({
      ...current,
      [targetRole]: Object.fromEntries(
        PERMISSION_MODULES.map((module) => [module.id, filled]),
      ) as PermissionMatrix[RoleId],
    }));
  };

  /**
   * Department scope: applies a read-only baseline to every non-owner role, which is the
   * pattern used when a department is on-boarded and must not change existing data yet.
   */
  const applyDepartmentBaseline = (value: boolean) => {
    if (scopedDepartments.length === 0) return;
    setStaged((current) => {
      const next = { ...current };
      for (const entry of ROLES) {
        if (entry.locked) continue;
        next[entry.id] = Object.fromEntries(
          PERMISSION_MODULES.map((module) => [
            module.id,
            { ...current[entry.id][module.id], view: value },
          ]),
        ) as PermissionMatrix[RoleId];
      }
      return next;
    });
  };

  if (!role) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      title="مدیریت نقش‌ها و سطوح دسترسی"
      description="سطح دسترسی هر نقش را در پنج ماژول اصلی سازمان تعیین کنید. تغییرات پس از ذخیره اعمال می‌شود."
      icon={<ShieldIcon size={20} variant="twotone" />}
      dismissOnOverlayClick={!dirty}
      footer={
        <>
          {dirty && (
            <Badge tone="warning" size="md" className="me-auto">
              تغییرات ذخیره‌نشده دارید
            </Badge>
          )}
          <Button
            variant="secondary"
            iconStart={<RefreshIcon size={16} />}
            onClick={() => {
              onReset();
              onClose();
            }}
          >
            بازگردانی به پیش‌فرض
          </Button>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button
            disabled={!dirty}
            onClick={() => {
              onChange(staged);
              onClose();
            }}
          >
            ذخیره تغییرات
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
        <aside className="flex flex-col gap-4">
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-title-sm font-semibold text-fg-primary">
              <KeyIcon size={16} variant="twotone" className="text-fg-tertiary" />
              سلسله‌مراتب نقش‌ها
            </h3>
            <RoleList
              roles={ROLES}
              activeRole={activeRole}
              onSelect={setActiveRole}
              permissions={staged}
            />
          </section>

          <section className="rounded-xl border border-secondary bg-sunken p-3">
            <h3 className="mb-1 flex items-center gap-1.5 text-title-sm font-semibold text-fg-primary">
              <BriefcaseIcon size={16} variant="twotone" className="text-fg-tertiary" />
              اعمال گروهی بر دپارتمان
            </h3>
            <p className="mb-2.5 text-micro leading-5 text-fg-tertiary">
              دپارتمان‌های مورد نظر را انتخاب و سپس دسترسی «مشاهده» را برای همه نقش‌های قابل ویرایش
              فعال یا غیرفعال کنید.
            </p>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {DEPARTMENTS.map((department) => {
                const selected = scopedDepartments.includes(department.id);
                return (
                  <button
                    key={department.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setScopedDepartments((current) =>
                        current.includes(department.id)
                          ? current.filter((id) => id !== department.id)
                          : [...current, department.id],
                      )
                    }
                    className={cn(
                      'numeric inline-flex items-center gap-1 rounded-full border px-2 py-1 text-micro font-medium transition-colors',
                      selected
                        ? 'border-brand bg-brand-subtle text-fg-brand'
                        : 'border-secondary bg-surface text-fg-tertiary hover:bg-hover',
                    )}
                  >
                    {department.name}
                    <span className="text-fg-quaternary">{formatCount(department.memberCount)}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Button
                size="xs"
                variant="secondary"
                fullWidth
                disabled={scopedDepartments.length === 0}
                onClick={() => applyDepartmentBaseline(true)}
              >
                فعال‌سازی مشاهده
              </Button>
              <Button
                size="xs"
                variant="secondary"
                fullWidth
                disabled={scopedDepartments.length === 0}
                onClick={() => applyDepartmentBaseline(false)}
              >
                غیرفعال‌سازی مشاهده
              </Button>
            </div>
          </section>

          <section className="flex items-start gap-2 rounded-xl border border-secondary bg-surface p-3">
            <InfoCircleIcon size={18} variant="twotone" className="mt-0.5 shrink-0 text-fg-brand" />
            <p className="text-micro leading-5 text-fg-tertiary">
              نقش «مالک سازمان» همیشه دسترسی کامل دارد و قابل ویرایش نیست. برای انتقال مالکیت از
              بخش تنظیمات سازمان اقدام کنید.
            </p>
          </section>
        </aside>

        <div className="min-w-0">
          <PermissionMatrixTable
            role={role}
            permissions={staged}
            onToggle={(module, action, value) => setCell(role.id, module, action, value)}
            onToggleModule={(module, value) => setModuleRow(role.id, module, value)}
            onToggleAction={(action, value) => setActionColumn(role.id, action, value)}
            onToggleRole={(value) => setWholeRole(role.id, value)}
          />

          <section className="mt-5 rounded-xl border border-secondary bg-surface p-4">
            <h3 className="mb-3 text-title-sm font-semibold text-fg-primary">تنظیمات تکمیلی نقش</h3>
            <div className="flex flex-col gap-3">
              <SettingRow
                title="امکان دعوت اعضای جدید"
                description="اعضای این نقش می‌توانند همکار جدید به فضای کاری دعوت کنند."
                checked={staged[role.id].members.create}
                disabled={role.locked}
                onChange={(value) => setCell(role.id, 'members', 'create', value)}
              />
              <SettingRow
                title="دسترسی به گزارش‌های مالی"
                description="مشاهده تایم‌شیت و گزارش‌های بهره‌وری کل سازمان."
                checked={staged[role.id].reports.view}
                disabled={role.locked}
                onChange={(value) => setCell(role.id, 'reports', 'view', value)}
              />
              <SettingRow
                title="حذف دائمی اسناد"
                description="حذف فایل از مخزن پروژه بدون امکان بازیابی."
                checked={staged[role.id].files.delete}
                disabled={role.locked}
                onChange={(value) => setCell(role.id, 'files', 'delete', value)}
              />
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}

interface SettingRowProps {
  readonly title: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: boolean) => void;
}

function SettingRow({ title, description, checked, disabled, onChange }: SettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-secondary px-3 py-2.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body-sm font-semibold text-fg-primary">{title}</span>
        <span className="text-micro leading-5 text-fg-tertiary">{description}</span>
      </span>
      <Tooltip content={checked ? 'فعال' : 'غیرفعال'}>
        <Switch
          checked={checked}
          disabled={disabled}
          locked={disabled}
          label={title}
          onCheckedChange={onChange}
        />
      </Tooltip>
    </div>
  );
}

'use client';

import type { PermissionMatrix } from '@taskin/contracts';
import { DEPARTMENTS, ROLES } from '@/data/reference';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { Badge, Button, Modal } from '@/components/ui';
import { PermissionMatrixTable } from '@/features/workspace/components/roles/PermissionMatrixTable';
import { RoleList } from '@/features/workspace/components/roles/RoleList';
import { BriefcaseIcon, InfoCircleIcon, KeyIcon, RefreshIcon, ShieldIcon } from '@/components/icons';
import { SettingRow } from '@/features/workspace/components/roles/PermissionSettingRow';
import { useRolePermissions } from '@/features/workspace/hooks/useRolePermissions';

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
  const form = useRolePermissions({ open, permissions });
  if (!form) return null;
  const {
    staged,
    activeRole,
    setActiveRole,
    scopedDepartments,
    setScopedDepartments,
    role,
    dirty,
    setCell,
    setModuleRow,
    setActionColumn,
    setWholeRole,
    applyDepartmentBaseline,
  } = form;

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
            <RoleList roles={ROLES} activeRole={activeRole} onSelect={setActiveRole} permissions={staged} />
          </section>

          <section className="rounded-xl border border-secondary bg-sunken p-3">
            <h3 className="mb-1 flex items-center gap-1.5 text-title-sm font-semibold text-fg-primary">
              <BriefcaseIcon size={16} variant="twotone" className="text-fg-tertiary" />
              اعمال گروهی بر دپارتمان
            </h3>
            <p className="mb-2.5 text-micro leading-5 text-fg-tertiary">
              دپارتمان‌های مورد نظر را انتخاب و سپس دسترسی «مشاهده» را برای همه نقش‌های قابل ویرایش فعال یا
              غیرفعال کنید.
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
                      'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-micro font-medium transition-colors numeric',
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
              نقش «مالک سازمان» همیشه دسترسی کامل دارد و قابل ویرایش نیست. برای انتقال مالکیت از بخش تنظیمات
              سازمان اقدام کنید.
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

'use client';

import { useState } from 'react';
import type { RoleId } from '@taskin/contracts';
import { DEFAULT_PERMISSION_MATRIX, PERMISSION_ACTIONS, PERMISSION_MODULES, ROLES } from '@/data/reference';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { formatCount } from '@/lib/format';
import { AppShell } from '@/components/layout/AppShell';
import { PermissionMatrixTable, RoleList } from '@/components/rbac/PermissionMatrixTable';
import { RolePermissionsModal } from '@/components/rbac/RolePermissionsModal';
import { Badge, Button } from '@/components/ui';
import { InfoCircleIcon, KeyIcon, RefreshIcon, ShieldIcon } from '@/components/icons';

export default function RolesSettingsPage() {
  const { state, dispatch } = useWorkspace();
  const [activeRole, setActiveRole] = useState<RoleId>('admin');
  const [modalOpen, setModalOpen] = useState(false);

  const role = ROLES.find((entry) => entry.id === activeRole) ?? ROLES[0];
  const totalCells = PERMISSION_MODULES.length * PERMISSION_ACTIONS.length;

  if (!role) return null;

  return (
    <AppShell>
      <div className="scrollbar-thin h-full overflow-y-auto">
        <header className="border-b border-secondary bg-surface px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-brand-subtle text-fg-brand">
              <ShieldIcon size={22} variant="twotone" />
            </span>
            <div className="flex min-w-0 flex-col">
              <h1 className="text-heading-sm font-bold text-fg-primary">نقش‌ها و سطوح دسترسی</h1>
              <span className="numeric text-caption text-fg-tertiary">
                {`${formatCount(ROLES.length)} نقش، ${formatCount(PERMISSION_MODULES.length)} ماژول، ${formatCount(totalCells)} دسترسی برای هر نقش`}
              </span>
            </div>

            <div className="ms-auto flex items-center gap-2">
              <Button
                variant="secondary"
                iconStart={<RefreshIcon size={16} />}
                onClick={() =>
                  dispatch({ type: 'replace-permissions', permissions: DEFAULT_PERMISSION_MATRIX })
                }
              >
                بازگردانی پیش‌فرض
              </Button>
              <Button iconStart={<KeyIcon size={16} />} onClick={() => setModalOpen(true)}>
                ویرایش پیشرفته
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl gap-5 p-4 sm:p-6 lg:grid-cols-[17rem_1fr]">
          <aside className="flex flex-col gap-3">
            <h2 className="text-title-sm font-semibold text-fg-primary">سلسله‌مراتب نقش‌ها</h2>
            <RoleList
              roles={ROLES}
              activeRole={activeRole}
              onSelect={setActiveRole}
              permissions={state.permissions}
            />

            <div className="flex items-start gap-2 rounded-xl border border-secondary bg-surface p-3">
              <InfoCircleIcon size={18} variant="twotone" className="mt-0.5 shrink-0 text-fg-brand" />
              <p className="text-micro leading-5 text-fg-tertiary">
                تغییرات این صفحه بلافاصله ذخیره می‌شود. برای ویرایش گروهی چند نقش و اعمال بر دپارتمان‌ها
                از «ویرایش پیشرفته» استفاده کنید.
              </p>
            </div>
          </aside>

          <div className="min-w-0">
            {role.locked && (
              <Badge tone="warning" size="md" className="mb-3">
                دسترسی‌های مالک سازمان ثابت است و قابل ویرایش نیست.
              </Badge>
            )}

            <PermissionMatrixTable
              role={role}
              permissions={state.permissions}
              onToggle={(module, action, value) =>
                dispatch({ type: 'set-permission', role: role.id, module, action, value })
              }
              onToggleModule={(module, value) =>
                dispatch({ type: 'set-module-permissions', role: role.id, module, value })
              }
              onToggleAction={(action, value) =>
                dispatch({ type: 'set-action-permissions', role: role.id, action, value })
              }
              onToggleRole={(value) =>
                dispatch({ type: 'set-role-permissions', role: role.id, value })
              }
            />
          </div>
        </div>
      </div>

      <RolePermissionsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        permissions={state.permissions}
        onChange={(permissions) => dispatch({ type: 'replace-permissions', permissions })}
        onReset={() =>
          dispatch({ type: 'replace-permissions', permissions: DEFAULT_PERMISSION_MATRIX })
        }
      />
    </AppShell>
  );
}

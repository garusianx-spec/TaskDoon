'use client';

import React, { useState } from 'react';
import type {
  PermissionActionId,
  PermissionMatrix,
  PermissionModuleId,
  RoleDescriptor,
} from '@taskin/contracts';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@/data/reference';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { Badge, Button, Switch, Tooltip } from '@/components/ui';
import { CheckIcon, ChevronDownIcon, CloseIcon, LockIcon } from '@/components/icons';

export interface PermissionMatrixTableProps {
  readonly role: RoleDescriptor;
  readonly permissions: PermissionMatrix;
  readonly readOnly?: boolean;
  readonly onToggle: (module: PermissionModuleId, action: PermissionActionId, value: boolean) => void;
  readonly onToggleModule: (module: PermissionModuleId, value: boolean) => void;
  readonly onToggleAction: (action: PermissionActionId, value: boolean) => void;
  readonly onToggleRole: (value: boolean) => void;
}

/**
 * Untitled UI permission table and mobile accordion card structure.
 *
 * - On desktop (md+): renders a structured matrix table where rows are modules and columns are actions.
 * - On mobile (<md / 390px): renders an accordion card stack per module, eliminating horizontal scrolling
 *   and clutter while providing 44px min-height touch targets and module master toggles.
 */
export function PermissionMatrixTable({
  role,
  permissions,
  readOnly = false,
  onToggle,
  onToggleModule,
  onToggleAction,
  onToggleRole,
}: PermissionMatrixTableProps) {
  const [openModules, setOpenModules] = useState<Partial<Record<PermissionModuleId, boolean>>>(() => {
    const firstModule = PERMISSION_MODULES[0];
    return firstModule ? { [firstModule.id]: true } : {};
  });

  const rolePermissions = permissions[role.id];
  const disabled = role.locked || readOnly;

  const toggleModuleOpen = (moduleId: PermissionModuleId) => {
    setOpenModules((prev) => ({
      ...prev,
      [moduleId]: !prev[moduleId],
    }));
  };

  const moduleState = (module: PermissionModuleId) => {
    const values = PERMISSION_ACTIONS.map((action) => rolePermissions[module][action.id]);
    return {
      all: values.every(Boolean),
      some: values.some(Boolean),
      count: values.filter(Boolean).length,
    };
  };

  const actionState = (action: PermissionActionId) => {
    const values = PERMISSION_MODULES.map((module) => rolePermissions[module.id][action]);
    return { all: values.every(Boolean), some: values.some(Boolean) };
  };

  const totalGranted = PERMISSION_MODULES.reduce((sum, module) => sum + moduleState(module.id).count, 0);
  const totalCells = PERMISSION_MODULES.length * PERMISSION_ACTIONS.length;

  return (
    <div className="flex flex-col gap-3">
      {/* Top Toolbar Summary */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-secondary bg-sunken px-3 py-2.5">
        <span className="flex items-center gap-2">
          <span className="text-title-sm font-semibold text-fg-primary">{role.name}</span>
          {role.locked && (
            <Badge tone="neutral" size="sm" iconStart={<LockIcon size={11} />}>
              غیرقابل تغییر
            </Badge>
          )}
        </span>
        <Badge tone="brand" size="sm" numeric>
          {`${formatCount(totalGranted)} از ${formatCount(totalCells)} دسترسی`}
        </Badge>

        <div className="ms-auto flex items-center gap-2">
          <Button
            size="xs"
            variant="secondary"
            iconStart={<CheckIcon size={14} />}
            disabled={disabled}
            onClick={() => onToggleRole(true)}
          >
            فعال‌سازی همه
          </Button>
          <Button
            size="xs"
            variant="secondary"
            iconStart={<CloseIcon size={14} />}
            disabled={disabled}
            onClick={() => onToggleRole(false)}
          >
            غیرفعال‌سازی همه
          </Button>
        </div>
      </div>

      {/* Desktop Table View (md+) */}
      <div
        role="region"
        aria-label="جدول دسترسی‌ها؛ برای دیدن ستون‌های دیگر افقی پیمایش کنید"
        tabIndex={0}
        className="hidden md:block overflow-x-auto rounded-xl border border-secondary bg-surface shadow-xs scrollbar-thin"
      >
        <table className="w-full min-w-[46rem] border-collapse">
          <caption className="sr-only">
            {`ماتریس دسترسی نقش ${role.name} — ردیف‌ها ماژول‌ها و ستون‌ها اقدام‌ها هستند`}
          </caption>
          <thead>
            <tr className="bg-sunken">
              <th
                scope="col"
                className="sticky start-0 z-10 w-[28%] min-w-56 bg-sunken px-4 py-3 text-start text-title-sm font-semibold text-fg-secondary"
              >
                ماژول
              </th>
              {PERMISSION_ACTIONS.map((action) => {
                const state = actionState(action.id);
                return (
                  <th key={action.id} scope="col" className="px-3 py-2.5 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-title-sm font-semibold text-fg-secondary">
                        {action.shortName}
                      </span>
                      <Tooltip content={`اعمال «${action.name}» برای همه ماژول‌ها`}>
                        <Switch
                          size="sm"
                          checked={state.all}
                          indeterminate={!state.all && state.some}
                          disabled={disabled}
                          locked={role.locked}
                          label={`اعمال ${action.name} برای همه ماژول‌های نقش ${role.name}`}
                          onCheckedChange={(value) => onToggleAction(action.id, value)}
                        />
                      </Tooltip>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {PERMISSION_MODULES.map((module) => {
              const state = moduleState(module.id);

              return (
                <tr key={module.id} className="border-t border-secondary">
                  <th
                    scope="row"
                    id={`perm-${role.id}-${module.id}`}
                    className="sticky start-0 z-10 bg-surface px-4 py-3 text-start align-top"
                  >
                    <div className="flex items-start gap-3">
                      <Switch
                        size="sm"
                        checked={state.all}
                        indeterminate={!state.all && state.some}
                        disabled={disabled}
                        locked={role.locked}
                        label={`اعمال همه اقدام‌ها روی ${module.name} برای نقش ${role.name}`}
                        onCheckedChange={(value) => onToggleModule(module.id, value)}
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-body-sm font-semibold text-fg-primary">{module.name}</span>
                        <span className="text-micro leading-5 text-fg-tertiary">{module.description}</span>
                      </span>
                    </div>
                  </th>

                  {PERMISSION_ACTIONS.map((action) => {
                    const granted = rolePermissions[module.id][action.id];
                    return (
                      <td key={action.id} className="px-3 py-3 text-center align-middle">
                        <div className="flex justify-center">
                          <Switch
                            checked={granted}
                            disabled={disabled}
                            locked={role.locked}
                            label={`${module.name} — ${action.name} برای نقش ${role.name}`}
                            onCheckedChange={(value) => onToggle(module.id, action.id, value)}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Accordion Card View (<md / 390px) */}
      <div
        className="flex flex-col gap-2.5 md:hidden"
        role="region"
        aria-label="ماتریس دسترسی‌ها در نمای کارتی موبایل"
      >
        {PERMISSION_MODULES.map((module) => {
          const state = moduleState(module.id);
          const isOpen = Boolean(openModules[module.id]);

          return (
            <div
              key={module.id}
              className="overflow-hidden rounded-xl border border-secondary bg-surface shadow-xs transition-colors"
            >
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                aria-controls={`module-panel-${role.id}-${module.id}`}
                onClick={() => toggleModuleOpen(module.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleModuleOpen(module.id);
                  }
                }}
                className="flex cursor-pointer items-center justify-between gap-3 p-3.5 hover:bg-sunken/40 transition-colors select-none"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      'text-fg-tertiary transition-transform duration-200 shrink-0',
                      isOpen ? 'rotate-180' : ''
                    )}
                    aria-hidden="true"
                  >
                    <ChevronDownIcon size={18} />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-body-sm font-semibold text-fg-primary truncate">
                        {module.name}
                      </span>
                      <Badge
                        tone={state.all ? 'brand' : state.some ? 'warning' : 'neutral'}
                        size="sm"
                        numeric
                      >
                        {`${formatCount(state.count)} از ${formatCount(PERMISSION_ACTIONS.length)}`}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 flex items-center"
                  title={`اعمال همه اقدام‌ها روی ${module.name}`}
                >
                  <Switch
                    size="sm"
                    checked={state.all}
                    indeterminate={!state.all && state.some}
                    disabled={disabled}
                    locked={role.locked}
                    label={`اعمال همه اقدام‌ها روی ${module.name} برای نقش ${role.name}`}
                    onCheckedChange={(value) => onToggleModule(module.id, value)}
                  />
                </div>
              </div>

              {isOpen && (
                <div
                  id={`module-panel-${role.id}-${module.id}`}
                  className="border-t border-secondary bg-surface"
                >
                  <p className="px-3.5 pt-2.5 pb-2 text-micro leading-5 text-fg-tertiary">
                    {module.description}
                  </p>

                  <div className="divide-y divide-secondary/60 border-t border-secondary/60">
                    {PERMISSION_ACTIONS.map((action) => {
                      const granted = rolePermissions[module.id][action.id];
                      return (
                        <div
                          key={action.id}
                          className="flex min-h-[44px] items-center justify-between gap-3 px-3.5 py-2 hover:bg-sunken/40 transition-colors"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="text-body-sm font-medium text-fg-primary">
                              {action.name}
                            </span>
                            <span className="text-micro text-fg-tertiary">
                              {action.id === 'view' && 'مشاهده و خواندن اطلاعات'}
                              {action.id === 'create' && 'ایجاد و ثبت رکورد جدید'}
                              {action.id === 'edit' && 'ویرایش و به‌روزرسانی'}
                              {action.id === 'delete' && 'حذف و پاک‌سازی'}
                              {action.id === 'assign' && 'ارجاع، تخصیص و تغییر وضعیت'}
                            </span>
                          </div>

                          <Switch
                            size="sm"
                            checked={granted}
                            disabled={disabled}
                            locked={role.locked}
                            label={`${module.name} — ${action.name} برای نقش ${role.name}`}
                            onCheckedChange={(value) => onToggle(module.id, action.id, value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import type {
  PermissionActionId,
  PermissionMatrix,
  PermissionModuleId,
  RoleDescriptor,
  RoleId,
} from '@taskin/contracts';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@/data/reference';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { Badge, Button, Switch, Tooltip } from '@/components/ui';
import { CheckIcon, CloseIcon, LockIcon } from '@/components/icons';

export interface PermissionMatrixTableProps {
  readonly role: RoleDescriptor;
  readonly permissions: PermissionMatrix;
  readonly onToggle: (module: PermissionModuleId, action: PermissionActionId, value: boolean) => void;
  readonly onToggleModule: (module: PermissionModuleId, value: boolean) => void;
  readonly onToggleAction: (action: PermissionActionId, value: boolean) => void;
  readonly onToggleRole: (value: boolean) => void;
}

/**
 * Untitled UI permission table.
 *
 * Rows are modules, columns are actions, and the header/leading cells carry master switches
 * that report `mixed` when a row or column is partially granted. Every switch is labelled by
 * the intersection it controls, so a screen reader announces
 * "بوردها و پروژه‌ها — ویرایش، روشن" rather than an anonymous toggle.
 */
export function PermissionMatrixTable({
  role,
  permissions,
  onToggle,
  onToggleModule,
  onToggleAction,
  onToggleRole,
}: PermissionMatrixTableProps) {
  const rolePermissions = permissions[role.id];

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

  const totalGranted = PERMISSION_MODULES.reduce(
    (sum, module) => sum + moduleState(module.id).count,
    0,
  );
  const totalCells = PERMISSION_MODULES.length * PERMISSION_ACTIONS.length;

  return (
    <div className="flex flex-col gap-3">
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
            disabled={role.locked}
            onClick={() => onToggleRole(true)}
          >
            فعال‌سازی همه
          </Button>
          <Button
            size="xs"
            variant="secondary"
            iconStart={<CloseIcon size={14} />}
            disabled={role.locked}
            onClick={() => onToggleRole(false)}
          >
            غیرفعال‌سازی همه
          </Button>
        </div>
      </div>

      <div className="scrollbar-thin overflow-x-auto rounded-xl border border-secondary bg-surface shadow-xs">
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
                      <span className="text-title-sm font-semibold text-fg-secondary">{action.shortName}</span>
                      <Tooltip content={`اعمال «${action.name}» برای همه ماژول‌ها`}>
                        <Switch
                          size="sm"
                          checked={state.all}
                          indeterminate={!state.all && state.some}
                          disabled={role.locked}
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
                        disabled={role.locked}
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
                            disabled={role.locked}
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
    </div>
  );
}

export interface RoleListProps {
  readonly roles: readonly RoleDescriptor[];
  readonly activeRole: RoleId;
  readonly onSelect: (role: RoleId) => void;
  readonly permissions: PermissionMatrix;
}

/** Hierarchy column — Owner first, Guest last, each row showing its granted-permission count. */
export function RoleList({ roles, activeRole, onSelect, permissions }: RoleListProps) {
  const totalCells = PERMISSION_MODULES.length * PERMISSION_ACTIONS.length;

  return (
    <ul className="flex flex-col gap-1" role="tablist" aria-label="نقش‌های سازمان" aria-orientation="vertical">
      {roles
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map((role) => {
          const active = role.id === activeRole;
          const granted = PERMISSION_MODULES.reduce(
            (sum, module) =>
              sum +
              PERMISSION_ACTIONS.filter((action) => permissions[role.id][module.id][action.id]).length,
            0,
          );

          return (
            <li key={role.id}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => onSelect(role.id)}
                className={cn(
                  'flex w-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-start transition-colors',
                  active
                    ? 'border-brand bg-brand-subtle'
                    : 'border-transparent hover:border-secondary hover:bg-hover',
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'truncate text-body-sm font-semibold',
                      active ? 'text-fg-brand' : 'text-fg-primary',
                    )}
                  >
                    {role.name}
                  </span>
                  {role.locked && <LockIcon size={13} className="shrink-0 text-fg-quaternary" />}
                  <span className="numeric ms-auto shrink-0 text-micro text-fg-tertiary">
                    {`${formatCount(role.memberCount)} نفر`}
                  </span>
                </span>
                <span className="line-clamp-2 text-micro leading-5 text-fg-tertiary">
                  {role.description}
                </span>
                <span className="numeric text-micro font-medium text-fg-quaternary">
                  {`${formatCount(granted)}/${formatCount(totalCells)} دسترسی فعال`}
                </span>
              </button>
            </li>
          );
        })}
    </ul>
  );
}

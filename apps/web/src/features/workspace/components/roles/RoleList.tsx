'use client';

import type { PermissionMatrix, RoleDescriptor, RoleId } from '@taskin/contracts';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@/data/reference';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { LockIcon } from '@/components/icons';

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
    <ul
      className="flex flex-col gap-1"
      role="tablist"
      aria-label="نقش‌های سازمان"
      aria-orientation="vertical"
    >
      {roles
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map((role) => {
          const active = role.id === activeRole;
          const granted = PERMISSION_MODULES.reduce(
            (sum, module) =>
              sum + PERMISSION_ACTIONS.filter((action) => permissions[role.id][module.id][action.id]).length,
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
                  <span className="ms-auto shrink-0 text-micro text-fg-tertiary numeric">
                    {`${formatCount(role.memberCount)} نفر`}
                  </span>
                </span>
                <span className="line-clamp-2 text-micro leading-5 text-fg-tertiary">{role.description}</span>
                <span className="text-micro font-medium text-fg-quaternary numeric">
                  {`${formatCount(granted)}/${formatCount(totalCells)} دسترسی فعال`}
                </span>
              </button>
            </li>
          );
        })}
    </ul>
  );
}

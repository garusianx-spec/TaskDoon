'use client';

import { useMemo, useState } from 'react';
import type {
  DepartmentId,
  PermissionActionId,
  PermissionMatrix,
  PermissionModuleId,
  RoleId,
} from '@taskin/contracts';
import { PERMISSION_ACTIONS, PERMISSION_MODULES, ROLES } from '@/data/reference';
import type { RolePermissionsModalProps } from '@/features/workspace/components/roles/RolePermissionsModal';

export function useRolePermissions({
  open,
  permissions,
}: Pick<RolePermissionsModalProps, 'open' | 'permissions'>) {
  const [staged, setStaged] = useState<PermissionMatrix>(permissions);
  const [activeRole, setActiveRole] = useState<RoleId>('admin');
  const [scopedDepartments, setScopedDepartments] = useState<readonly DepartmentId[]>([]);

  // Re-stage whenever the modal is (re)opened so it always edits the live matrix.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setStaged(permissions);
  }

  const role = useMemo(() => ROLES.find((entry) => entry.id === activeRole) ?? ROLES[0], [activeRole]);

  const dirty = useMemo(() => JSON.stringify(staged) !== JSON.stringify(permissions), [staged, permissions]);

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
    const filled = Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action.id, value])) as Readonly<
      Record<PermissionActionId, boolean>
    >;
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
    const filled = Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action.id, value])) as Readonly<
      Record<PermissionActionId, boolean>
    >;
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
          PERMISSION_MODULES.map((module) => [module.id, { ...current[entry.id][module.id], view: value }]),
        ) as PermissionMatrix[RoleId];
      }
      return next;
    });
  };

  if (!role) return null;

  return {
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
  };
}

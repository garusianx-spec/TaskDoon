import { subject } from '@casl/ability';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERMISSION_MATRIX,
  grantedCells,
  PERMISSION_ACTION_IDS,
  PERMISSION_MODULE_IDS,
  ROLE_IDS,
  type RoleId,
  SYSTEM_ROLES,
} from '@taskin/contracts';
import type { MembershipContext } from '../../src/platform/http/request.js';
import { AbilityFactory, ALL_CELLS, cell, grantsToRow, MODULE_SUBJECTS } from '../../src/modules/rbac/ability.js';

function memberOf(role: RoleId): MembershipContext {
  const isOwner = role === 'owner';
  return {
    workspaceId: 'w',
    userId: `user-${role}`,
    roleId: `role-${role}`,
    roleKey: role,
    rank: SYSTEM_ROLES.find((entry) => entry.id === role)?.rank ?? 99,
    isOwner,
    ownerUserId: 'user-owner',
    grants: isOwner ? ALL_CELLS : grantedCells(DEFAULT_PERMISSION_MATRIX[role]).map(({ module, action }) => cell(module, action)),
    rbacVersion: 1,
  };
}

describe('M1 checklist: the ability factory matches DEFAULT_PERMISSION_MATRIX exactly', () => {
  const factory = new AbilityFactory();

  // 5 roles × 5 modules × 5 actions, over every CASL subject each module governs.
  for (const role of ROLE_IDS) {
    for (const module of PERMISSION_MODULE_IDS) {
      for (const action of PERMISSION_ACTION_IDS) {
        const expected = DEFAULT_PERMISSION_MATRIX[role][module][action];
        it(`${role} ${expected ? 'can' : 'cannot'} ${action} in ${module}`, () => {
          const ability = factory.forMember(memberOf(role));
          for (const name of MODULE_SUBJECTS[module]) {
            expect({ subject: name, can: ability.can(action, name) }).toEqual({ subject: name, can: expected });
          }
        });
      }
    }
  }

  it('lets every member view their workspace and only the owner delete it', () => {
    for (const role of ROLE_IDS) {
      const ability = factory.forMember(memberOf(role));
      expect(ability.can('view', 'Workspace')).toBe(true);
      expect(ability.can('delete', 'Workspace')).toBe(role === 'owner');
    }
  });

  it('never lets the owner remove themselves', () => {
    const owner = factory.forMember(memberOf('owner'));
    expect(owner.can('delete', subject('Member', { userId: 'user-owner' }))).toBe(false);
    expect(owner.can('delete', subject('Member', { userId: 'someone-else' }))).toBe(true);
  });

  it('round-trips grants and matrix rows', () => {
    for (const role of ROLE_IDS) {
      expect(grantsToRow(memberOf(role).grants)).toEqual(DEFAULT_PERMISSION_MATRIX[role]);
    }
  });

  it('ranks roles strictly, owner first', () => {
    expect([...SYSTEM_ROLES].sort((a, b) => a.rank - b.rank).map((role) => role.id)).toEqual(['owner', 'admin', 'manager', 'member', 'guest']);
    expect(SYSTEM_ROLES.filter((role) => role.locked).map((role) => role.id)).toEqual(['owner']);
  });
});

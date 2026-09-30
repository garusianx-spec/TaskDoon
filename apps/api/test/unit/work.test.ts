import { subject } from '@casl/ability';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PERMISSION_MATRIX, grantedCells, type ProjectRole, type RoleId, SYSTEM_ROLES } from '@taskin/contracts';
import { cleanFileName, isSpoofed, sniff } from '../../src/modules/content/file-types.js';
import { AbilityFactory, ALL_CELLS, cell, projectActions } from '../../src/modules/rbac/ability.js';
import { keyBetween, keysBetween } from '../../src/modules/work/positions.js';
import { addDays, dateIn, instantIn, timeIn } from '../../src/platform/clock/clock.js';
import { ApiError } from '../../src/platform/http/api-error.js';
import type { MembershipContext } from '../../src/platform/http/request.js';

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

describe('project access: workspace role, visibility and project role', () => {
  const ALL = ['view', 'create', 'edit', 'delete', 'assign'];

  it('lets the owner do everything everywhere', () => {
    for (const visibility of ['workspace', 'private'] as const) {
      expect(projectActions(memberOf('owner'), { visibility, role: null })).toEqual(ALL);
    }
  });

  it('follows the workspace matrix in workspace-visible projects, and hides private ones', () => {
    expect(projectActions(memberOf('manager'), { visibility: 'workspace', role: null })).toEqual(ALL);
    expect(projectActions(memberOf('member'), { visibility: 'workspace', role: null })).toEqual(['view', 'create', 'edit', 'assign']);
    for (const role of ['admin', 'manager', 'member'] as const) expect(projectActions(memberOf(role), { visibility: 'private', role: null })).toEqual([]);
  });

  it('shows guests only projects they belong to, and caps them at contributor', () => {
    expect(projectActions(memberOf('guest'), { visibility: 'workspace', role: null })).toEqual([]);
    expect(projectActions(memberOf('guest'), { visibility: 'private', role: 'lead' })).toEqual(['view', 'create', 'edit', 'assign']);
  });

  it('lets a project role widen or narrow the workspace role inside its project', () => {
    const expected: Record<ProjectRole, string[]> = { lead: ALL, contributor: ['view', 'create', 'edit', 'assign'], viewer: ['view'] };
    for (const role of ['lead', 'contributor', 'viewer'] as const) {
      expect(projectActions(memberOf('admin'), { visibility: 'private', role })).toEqual(expected[role]);
    }
  });

  it('scopes project subjects to the projects of the scope, and keeps workspace-wide ones', () => {
    const ability = new AbilityFactory().forMember(memberOf('member'), new Map([['p1', ['view'] as const]]));
    expect(ability.can('view', subject('Task', { projectId: 'p1' }))).toBe(true);
    expect(ability.can('edit', subject('Task', { projectId: 'p1' }))).toBe(false);
    expect(ability.can('view', subject('Task', { projectId: 'p2' }))).toBe(false);
    // Columns and labels belong to the workspace's workflow, not to a project.
    expect(ability.can('create', 'BoardColumn')).toBe(true);
    expect(ability.can('create', 'Label')).toBe(true);
  });
});

describe('fractional positions', () => {
  it('generates keys strictly between neighbours, in byte order', () => {
    const first = keyBetween(null, null);
    const last = keyBetween(first, null);
    const middle = keyBetween(first, last);
    expect([first, middle, last]).toEqual([first, middle, last].sort());
    expect(keysBetween(first, last, 5)).toEqual([...keysBetween(first, last, 5)].sort());
  });

  it('reports neighbours out of order as a stale board', () => {
    expect(() => keyBetween('a2', 'a1')).toThrow(ApiError);
    expect(() => keyBetween('a1', 'a1')).toThrow(expect.objectContaining({ code: 'BOARD_CHANGED' }));
  });
});

describe('time zones', () => {
  it('knows that 00:30 in Tehran is still yesterday in UTC', () => {
    const halfPastMidnight = new Date('2026-10-06T21:00:00Z');
    expect(dateIn('Asia/Tehran', halfPastMidnight)).toBe('2026-10-07');
    expect(dateIn('UTC', halfPastMidnight)).toBe('2026-10-06');
  });

  it('turns a Tehran wall-clock time into its instant and back', () => {
    const instant = instantIn('Asia/Tehran', '2026-11-03', '09:30');
    expect(instant.toISOString()).toBe('2026-11-03T06:00:00.000Z');
    expect(timeIn('Asia/Tehran', instant)).toBe('09:30');
    // Before 2022 Iran observed daylight saving: +04:30 in summer.
    expect(instantIn('Asia/Tehran', '2021-07-01', '09:00').toISOString()).toBe('2021-07-01T04:30:00.000Z');
  });

  it('adds calendar days across month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
});

describe('file types', () => {
  it('recognises files by their bytes', () => {
    expect(sniff(Buffer.from('%PDF-1.7 ...'), 'a.pdf')).toEqual({ mime: 'application/pdf', kind: 'document' });
    expect(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), 'a.png')?.kind).toBe('image');
    expect(sniff(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]), 'budget.xlsx')?.kind).toBe('sheet');
    expect(sniff(Buffer.from('name,amount\nعلی,12\n'), 'data.csv')).toEqual({ mime: 'text/csv', kind: 'sheet' });
  });

  it('never accepts executables or scripts', () => {
    expect(sniff(Buffer.from('MZ\x90\x00'), 'setup.pdf')).toBeNull();
    expect(sniff(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2]), 'lib.so')).toBeNull();
    expect(sniff(Buffer.from('#!/bin/sh\nrm -rf /'), 'notes.txt')).toBeNull();
  });

  it('refuses a claim that disagrees with the bytes', () => {
    const html = sniff(Buffer.from('<html><script>x</script></html>'), 'photo.png');
    expect(html?.kind).toBe('document');
    expect(isSpoofed('image/png', 'photo.png', html ?? { mime: '', kind: 'image' })).toBe(true);
    expect(isSpoofed('application/octet-stream', 'x.bin', { mime: 'application/pdf', kind: 'document' })).toBe(false);
  });

  it('strips bidi overrides and path separators from names', () => {
    expect(cleanFileName('invoice‮fdp.exe')).toBe('invoicefdp.exe');
    expect(cleanFileName('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(cleanFileName('گزارش.pdf')).toBe('گزارش.pdf');
  });
});

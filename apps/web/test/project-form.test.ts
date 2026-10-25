import { describe, expect, it } from 'vitest';
import type { User } from '@taskin/contracts';
import { departmentGlyph, matchingProjectMembers, normalizeDepartmentName, PROJECT_COLOR_SWATCHES, projectDepartmentOptions, projectMemberIds, toggleProjectSelection } from '../src/lib/project-form';

const person = (id: string, fullName: string, extra: Partial<User> = {}): User => ({
  id, fullName, email: `${id}@example.test`, initials: 'AB', jobTitle: 'مهندس نرم‌افزار',
  role: 'member', department: 'engineering', presence: 'offline', avatarTone: 'brand', phone: '', ...extra,
});

describe('project form selections', () => {
  it('keeps one option when a pending custom department becomes canonical before the modal closes', () => {
    const department = { id: 'custom-1', name: 'پژوهش', memberCount: 0 };
    expect(projectDepartmentOptions([{ ...department, memberCount: 2 }], [department]))
      .toEqual([{ ...department, memberCount: 2 }]);
    expect(projectDepartmentOptions([{ ...department, id: 'canonical-uuid' }], [department]))
      .toEqual([department]);
  });
  it('normalizes department names before matching existing or inline draft options', () => {
    expect(normalizeDepartmentName('  تحقيقات‌  كاربردي  ')).toBe(normalizeDepartmentName('تحقیقات کاربردی'));
    expect(normalizeDepartmentName('  ENGINEERING  ')).toBe('engineering');
  });

  it('keeps multiple departments selected and removes only the toggled department', () => {
    const selected = toggleProjectSelection(['engineering'], 'design', 20);
    expect(selected).toEqual(['engineering', 'design']);
    expect(toggleProjectSelection(selected, 'engineering', 20)).toEqual(['design']);
  });

  it('deduplicates selections and enforces limits without preventing removals', () => {
    expect(toggleProjectSelection(['engineering', 'engineering'], 'design', 1)).toEqual(['engineering']);
    expect(toggleProjectSelection(['engineering'], 'engineering', 1)).toEqual([]);
  });

  it('always includes the creator exactly once alongside selected members', () => {
    expect(projectMemberIds(['other', 'creator', 'other'], 'creator')).toEqual(['creator', 'other']);
    expect(projectMemberIds([], 'creator')).toEqual(['creator']);
  });

  it('searches member names, emails and job titles while excluding former members', () => {
    const people = [person('active', 'كيميا رضايي'), person('other', 'رضا احمدی'), person('former', 'كيميا رضايي', { former: true })];
    expect(matchingProjectMembers(people, 'کیمیا')).toEqual([people[0]]);
    expect(matchingProjectMembers(people, 'ACTIVE@')).toEqual([people[0]]);
    expect(matchingProjectMembers(people, 'مهندس')).toHaveLength(2);
  });

  it('assigns different context glyphs even when live department IDs are UUIDs', () => {
    const names = ['مهندسی و توسعه', 'محصول', 'طراحی تجربه کاربری', 'بازاریابی', 'مالی و اداری', 'عملیات و پشتیبانی'];
    expect(new Set(names.map(name => departmentGlyph('01900000-0000-7000-8000-000000000001', name))).size).toBe(6);
    expect(departmentGlyph('custom-1', 'پژوهش')).toBe('custom');
    expect(departmentGlyph('engineering', 'Team')).toBe('engineering');
  });

  it('defines opaque solid swatches for all six project tones', () => {
    expect(Object.values(PROJECT_COLOR_SWATCHES)).toHaveLength(6);
    expect(new Set(Object.values(PROJECT_COLOR_SWATCHES)).size).toBe(6);
    for (const hex of Object.values(PROJECT_COLOR_SWATCHES)) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(PROJECT_COLOR_SWATCHES.teal).toBe('#06b6d4');
    expect(PROJECT_COLOR_SWATCHES.slate).toBe('#64748b');
  });
});

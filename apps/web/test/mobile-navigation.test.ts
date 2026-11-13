import { describe, expect, it } from 'vitest';
import type { Task } from '@taskin/contracts';
import { DEMO_WORKSPACE_STATE } from '@/store/initial-state';
import { deadlinePeriod, filterTasks, tasksAssignedTo } from '@/store/selectors';
import { mobilePageTitle, mobileTabFor, projectHref } from '@/lib/workspace-navigation';

describe('workspace route context', () => {
  it('keeps existing routes and More descendants under the corresponding tab', () => {
    expect(mobileTabFor('/tasks')).toBe('/projects');
    expect(mobileTabFor(projectHref('a/b'))).toBe('/projects');
    expect(projectHref('a/b')).toBe('/projects/a%2Fb');
    for (const path of ['/calendar', '/notes', '/directory', '/settings/roles', '/more/account/appearance']) {
      expect(mobileTabFor(path)).toBe('/more');
    }
    expect(mobilePageTitle('/more/account/appearance')).toBe('ظاهر شخصی');
    expect(mobilePageTitle('/more/workspace')).toBe('تنظیمات فضای کاری');
    expect(mobileTabFor('/tasks/mine')).toBe('/tasks/mine');
    expect(mobileTabFor('/taskshare')).toBeUndefined();
  });
});

describe('personal task scope and deadline filters', () => {
  const task = DEMO_WORKSPACE_STATE.tasks[0]!;
  const today = '2026-11-13';
  const tasks: Task[] = [
    { ...task, id: 'overdue', assigneeIds: ['me'], dueDate: '2026-11-12', status: 'todo' },
    { ...task, id: 'today', assigneeIds: ['me'], dueDate: today, status: 'todo' },
    { ...task, id: 'undated', assigneeIds: ['me'], projectId: 'another-project', dueDate: null },
    { ...task, id: 'other-assignee', assigneeIds: ['someone-else'], dueDate: today },
  ];
  const personal = tasksAssignedTo(tasks, 'me');
  const scope = { projectId: null, search: '', currentUserId: 'me', today };

  it('finds my tasks across projects and retains undated work', () => {
    expect(filterTasks(personal, { ...scope, smartView: 'all' }).map(({ id }) => id)).toEqual([
      'overdue',
      'today',
      'undated',
    ]);
  });

  it('keeps overdue separate from nearby deadlines without admitting another assignee', () => {
    expect(filterTasks(personal, { ...scope, smartView: 'overdue' }).map(({ id }) => id)).toEqual([
      'overdue',
    ]);
    expect(filterTasks(personal, { ...scope, smartView: 'due-soon' }).map(({ id }) => id)).toEqual(['today']);
    expect(deadlinePeriod('2026-11-14', today)).toBe('upcoming');
    expect(deadlinePeriod(null, today)).toBe('undated');
  });
});

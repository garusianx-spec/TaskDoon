'use client';

import { useState } from 'react';
import type { DepartmentId, Project, SmartViewId, Task } from '@/types';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { DEPARTMENTS } from '@/data/reference';
import { buildProjectTree, projectWithDescendants } from '@/store/selectors';
import { Button, Input } from '@/components/ui';
import {
  AddIcon,
  BriefcaseIcon,
  ChevronDownIcon,
  ClockIcon,
  FolderIcon,
  SearchIcon,
  StarIcon,
  TaskSquareIcon,
  UserIcon,
} from '@/components/icons';

export interface TaskSidebarProps {
  readonly tasks: readonly Task[];
  readonly projects: readonly Project[];
  readonly smartView: SmartViewId;
  readonly projectFilterId: string | null;
  readonly search: string;
  readonly currentUserId: string;
  readonly onSmartViewChange: (view: SmartViewId) => void;
  readonly onProjectChange: (projectId: string | null) => void;
  readonly onSearchChange: (query: string) => void;
  readonly onCreateTask: () => void;
  readonly onCreateProject: () => void;
}

const SMART_VIEWS: ReadonlyArray<{
  readonly id: SmartViewId;
  readonly label: string;
  readonly Icon: typeof UserIcon;
}> = [
  { id: 'my-tasks', label: 'وظایف من', Icon: UserIcon },
  { id: 'starred', label: 'بوردهای ستاره‌دار', Icon: StarIcon },
  { id: 'due-soon', label: 'سررسید نزدیک', Icon: ClockIcon },
  { id: 'all', label: 'همه وظایف', Icon: TaskSquareIcon },
];

/** Task-context column: smart views, the project tree and department filters. */
export function TaskSidebar({
  tasks,
  projects,
  smartView,
  projectFilterId,
  search,
  currentUserId,
  onSmartViewChange,
  onProjectChange,
  onSearchChange,
  onCreateTask,
  onCreateProject,
}: TaskSidebarProps) {
  const tree = buildProjectTree(projects);
  // Newly created projects arrive after mount, so treat "not explicitly collapsed" as open
  // rather than seeding a fixed list that would leave later projects stuck closed.
  const [collapsed, setCollapsed] = useState<readonly string[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentId | null>(null);

  const countFor = (view: SmartViewId): number => {
    switch (view) {
      case 'my-tasks':
        return tasks.filter((task) => task.assigneeIds.includes(currentUserId) && task.status !== 'done')
          .length;
      case 'starred':
        return tasks.filter((task) => task.starred).length;
      case 'due-soon':
        return tasks.filter((task) => task.status !== 'done').length;
      case 'all':
        return tasks.length;
      default: {
        const exhaustive: never = view;
        return exhaustive;
      }
    }
  };

  const projectCount = (projectId: string): number => {
    const scope = projectWithDescendants(projects, projectId);
    return tasks.filter((task) => scope.includes(task.projectId)).length;
  };

  const visibleTree = departmentFilter
    ? tree.filter(
        (node) =>
          node.project.departmentId === departmentFilter ||
          node.children.some((child) => child.departmentId === departmentFilter),
      )
    : tree;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b border-secondary p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-title font-bold text-fg-primary">پروژه‌ها و وظایف</h2>
        </div>
        <Button fullWidth iconStart={<AddIcon size={18} />} onClick={onCreateTask}>
          تعریف وظیفه جدید
        </Button>
        <Button
          fullWidth
          variant="secondary"
          iconStart={<FolderIcon size={18} />}
          onClick={onCreateProject}
        >
          پروژه جدید
        </Button>
        <Input
          label="جستجوی وظیفه"
          hideLabel
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="جستجوی عنوان یا کد وظیفه…"
          iconStart={<SearchIcon size={18} />}
        />
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
        <nav aria-label="نماهای هوشمند" className="flex flex-col gap-0.5">
          {SMART_VIEWS.map(({ id, label, Icon }) => {
            const active = smartView === id && projectFilterId === null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSmartViewChange(id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-body-sm font-medium transition-colors',
                  active ? 'bg-brand-subtle text-fg-brand' : 'text-fg-secondary hover:bg-hover',
                )}
              >
                <Icon size={18} variant={active ? 'twotone' : 'linear'} />
                <span className="flex-1 truncate">{label}</span>
                <span
                  className={cn(
                    'numeric rounded-full px-1.5 py-0.5 text-micro font-semibold',
                    active ? 'bg-surface text-fg-brand' : 'bg-sunken text-fg-tertiary',
                  )}
                >
                  {formatCount(countFor(id))}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="my-3 border-t border-secondary" />

        <nav aria-label="درخت پروژه‌ها" className="flex flex-col gap-0.5">
          <h3 className="px-2.5 pb-1 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
            پروژه‌ها
          </h3>

          {visibleTree.map(({ project, children }) => {
            const isExpanded = !collapsed.includes(project.id);
            const active = projectFilterId === project.id;

            return (
              <div key={project.id} className="flex flex-col gap-0.5">
                <div
                  className={cn(
                    'flex items-center gap-1 rounded-lg transition-colors',
                    active ? 'bg-brand-subtle' : 'hover:bg-hover',
                  )}
                >
                  {children.length > 0 ? (
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `بستن ${project.name}` : `باز کردن ${project.name}`}
                      onClick={() =>
                        setCollapsed((current) =>
                          current.includes(project.id)
                            ? current.filter((id) => id !== project.id)
                            : [...current, project.id],
                        )
                      }
                      className="flex size-6 shrink-0 items-center justify-center rounded text-fg-quaternary"
                    >
                      <ChevronDownIcon size={14} className={cn('transition-transform', !isExpanded && 'rotate-90 rtl:-rotate-90')} />
                    </button>
                  ) : (
                    <span className="size-6 shrink-0" aria-hidden="true" />
                  )}

                  <button
                    type="button"
                    onClick={() => onProjectChange(active ? null : project.id)}
                    aria-current={active ? 'true' : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 py-2 pe-2.5 text-start"
                  >
                    <FolderIcon
                      size={17}
                      variant="twotone"
                      className={active ? 'text-fg-brand' : 'text-fg-quaternary'}
                    />
                    <span
                      className={cn(
                        'flex-1 truncate text-body-sm font-medium',
                        active ? 'text-fg-brand' : 'text-fg-secondary',
                      )}
                    >
                      {project.name}
                    </span>
                    {project.starred && <StarIcon size={13} className="shrink-0 text-status-progress" />}
                    <span className="numeric shrink-0 text-micro text-fg-tertiary">
                      {formatCount(projectCount(project.id))}
                    </span>
                  </button>
                </div>

                {isExpanded &&
                  children.map((child) => {
                    const childActive = projectFilterId === child.id;
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => onProjectChange(childActive ? null : child.id)}
                        aria-current={childActive ? 'true' : undefined}
                        className={cn(
                          'ms-6 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-start transition-colors',
                          childActive ? 'bg-brand-subtle text-fg-brand' : 'text-fg-tertiary hover:bg-hover',
                        )}
                      >
                        <span className="size-1.5 shrink-0 rounded-full bg-gray-300" aria-hidden="true" />
                        <span className="flex-1 truncate text-caption font-medium">{child.name}</span>
                        <span className="numeric shrink-0 text-micro">
                          {formatCount(projectCount(child.id))}
                        </span>
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </nav>

        <div className="my-3 border-t border-secondary" />

        <div aria-label="فیلتر دپارتمان" className="flex flex-col gap-1.5">
          <h3 className="px-2.5 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
            دپارتمان
          </h3>
          <div className="flex flex-wrap gap-1.5 px-1.5">
            {DEPARTMENTS.map((department) => {
              const active = departmentFilter === department.id;
              return (
                <button
                  key={department.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDepartmentFilter(active ? null : department.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-micro font-medium transition-colors',
                    active
                      ? 'border-brand bg-brand-subtle text-fg-brand'
                      : 'border-secondary bg-surface text-fg-tertiary hover:bg-hover',
                  )}
                >
                  <BriefcaseIcon size={12} />
                  {department.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

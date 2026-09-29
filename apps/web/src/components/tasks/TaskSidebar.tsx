'use client';

import { useState } from 'react';
import type { DepartmentId, SmartViewId, Task } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { DEPARTMENTS } from '@/data/reference';
import { projectList } from '@/store/selectors';
import { IconButton, Tooltip } from '@/components/ui';
import {
  AddIcon,
  ArchiveIcon,
  BriefcaseIcon,
  ClockIcon,
  FolderAddIcon,
  FolderIcon,
  StarIcon,
  TaskSquareIcon,
  TrashIcon,
  UserIcon,
} from '@/components/icons';

export interface TaskSidebarProps {
  readonly tasks: readonly Task[];
  readonly smartView: SmartViewId;
  readonly projectFilterId: string | null;
  readonly currentUserId: string;
  readonly onSmartViewChange: (view: SmartViewId) => void;
  readonly onProjectChange: (projectId: string | null) => void;
  readonly onCreateProject?: () => void;
  /** Workspace owner only: moves a project to the trash (after a confirmation). */
  readonly onDeleteProject?: (projectId: string) => void;
  /** Workspace owner only: «آرشیو / سطل زباله», deleted projects restorable for 40 days. */
  readonly onOpenTrash?: () => void;
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

/**
 * Task-context column: smart views, the project tree and department filters. Search and the
 * primary "new task" action live in the workspace header, so they are not repeated here.
 */
export function TaskSidebar({
  tasks,
  smartView,
  projectFilterId,
  currentUserId,
  onSmartViewChange,
  onProjectChange,
  onCreateProject,
  onDeleteProject,
  onOpenTrash,
}: TaskSidebarProps) {
  // Projects are flat (Phase 3.1): one list, no sub-projects.
  const projects = projectList();
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

  const projectCount = (projectId: string): number => tasks.filter((task) => task.projectId === projectId).length;

  const visibleProjects = departmentFilter ? projects.filter((project) => project.departmentId === departmentFilter) : projects;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-secondary px-3 py-3.5">
        <h2 className="text-title font-bold text-fg-primary">پروژه‌ها و وظایف</h2>
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
          <div className="flex items-center justify-between gap-2 ps-2.5 pb-1">
            <h3 className="text-micro font-semibold uppercase tracking-wide text-fg-quaternary">پروژه‌ها</h3>
            {onCreateProject && (
              <IconButton label="پروژه جدید" size="xs" variant="ghost" icon={<AddIcon size={14} />} onClick={onCreateProject} />
            )}
          </div>
          {visibleProjects.length === 0 && onCreateProject && (
            <button
              type="button"
              onClick={onCreateProject}
              className="mx-1 flex items-center gap-2 rounded-lg border border-dashed border-secondary px-2.5 py-2 text-start text-caption font-medium text-fg-tertiary transition-colors hover:bg-hover"
            >
              <FolderAddIcon size={16} />
              نخستین پروژه را بسازید
            </button>
          )}

          {visibleProjects.map((project) => {
            const active = projectFilterId === project.id;
            return (
              <div
                key={project.id}
                className={cn('group/project relative flex items-center rounded-lg transition-colors', active ? 'bg-brand-subtle' : 'hover:bg-hover')}
              >
                <button
                  type="button"
                  onClick={() => onProjectChange(active ? null : project.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn('flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-start', onDeleteProject && 'pe-9')}
                >
                  <FolderIcon size={17} variant="twotone" className={active ? 'text-fg-brand' : 'text-fg-quaternary'} />
                  <span className={cn('flex-1 truncate text-body-sm font-medium', active ? 'text-fg-brand' : 'text-fg-secondary')}>
                    {project.name}
                  </span>
                  {project.starred && <StarIcon size={13} className="shrink-0 text-status-progress" />}
                  <span className="numeric shrink-0 text-micro text-fg-tertiary">{formatCount(projectCount(project.id))}</span>
                </button>
                {onDeleteProject && (
                  <span className="absolute end-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/project:opacity-100">
                    <Tooltip content="حذف پروژه">
                      <button
                        type="button"
                        aria-label={`حذف پروژه ${project.name}`}
                        onClick={() => onDeleteProject(project.id)}
                        className="flex size-6 items-center justify-center rounded-full text-fg-quaternary transition-colors hover:bg-status-blocked-subtle hover:text-status-blocked"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </Tooltip>
                  </span>
                )}
              </div>
            );
          })}

          {onOpenTrash && (
            <button
              type="button"
              onClick={onOpenTrash}
              className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-start text-caption font-medium text-fg-tertiary transition-colors hover:bg-hover"
            >
              <ArchiveIcon size={16} />
              <span className="flex-1">آرشیو / سطل زباله</span>
            </button>
          )}
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

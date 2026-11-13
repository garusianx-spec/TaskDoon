'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DepartmentId, Project } from '@taskin/contracts';
import { normaliseForSearch } from '@taskin/text';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { AppShell } from '@/components/layout/AppShell';
import { useOverlays } from '@/components/overlays/OverlayProvider';
import { Button, IconButton, Input, Select } from '@/components/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  ArchiveIcon,
  ChevronForwardIcon,
  FolderAddIcon,
  FolderIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
} from '@/components/icons';
import { projectHref } from '@/lib/workspace-navigation';
import { cn } from '@/lib/utils';
import { TONE_CLASSES } from '@/features/workspace/components/WorkspaceAvatar';

export function ProjectsPage() {
  const { activeWorkspace } = useWorkspace();
  return (
    <AppShell>
      <ProjectDirectory key={activeWorkspace.id} />
    </AppShell>
  );
}

function ProjectDirectory() {
  const { state, currentUser, isWorkspaceOwner } = useWorkspace();
  const { open } = useOverlays();
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<DepartmentId | 'all'>('all');
  const normalized = normaliseForSearch(query);
  const projects = state.projects
    .filter(
      (project) =>
        normaliseForSearch(project.name).includes(normalized) &&
        (department === 'all' || (project.departmentIds ?? [project.departmentId]).includes(department)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  const starred = projects.filter((project) => project.starred);
  const other = projects.filter((project) => !project.starred);

  const onDelete = isWorkspaceOwner
    ? (projectId: string) => open({ kind: 'project-delete', projectId })
    : undefined;
  const canCreate = isWorkspaceOwner || state.permissions[currentUser.role].boards.create;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-heading font-bold text-fg-primary">پروژه‌ها</h1>
          {canCreate && (
            <Button
              size="lg"
              aria-haspopup="dialog"
              iconStart={<FolderAddIcon size={18} />}
              onClick={() => open({ kind: 'project-composer' })}
            >
              پروژه جدید
            </Button>
          )}
        </header>
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <Input
            type="search"
            label="جستجوی پروژه"
            placeholder="نام پروژه"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            iconStart={<SearchIcon size={18} />}
          />
          {state.departments.length > 0 && (
            <Select
              label="دپارتمان"
              hideLabel={false}
              value={department}
              onValueChange={setDepartment}
              options={[
                { value: 'all', label: 'همهٔ دپارتمان‌ها' },
                ...state.departments.map(({ id, name }) => ({ value: id, label: name })),
              ]}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <Link
            href="/tasks"
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-body-sm font-medium text-fg-brand hover:underline"
          >
            همهٔ وظایف
            <ChevronForwardIcon size={15} />
          </Link>
          {isWorkspaceOwner && (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              iconStart={<ArchiveIcon size={17} />}
              aria-haspopup="dialog"
              onClick={() => open({ kind: 'project-trash' })}
            >
              آرشیو / سطل زباله
            </Button>
          )}
        </div>
        {projects.length === 0 ? (
          <EmptyState
            icon={<FolderIcon size={28} />}
            title="پروژه‌ای یافت نشد"
            description={
              normalized || department !== 'all'
                ? 'جستجو یا دپارتمان را تغییر دهید.'
                : 'پروژه‌های این فضای کاری در اینجا نمایش داده می‌شوند.'
            }
          />
        ) : (
          <>
            {starred.length > 0 && (
              <ProjectList
                title="پروژه‌های ستاره‌دار"
                projects={starred}
                {...(onDelete ? { onDelete } : {})}
              />
            )}
            {other.length > 0 && (
              <ProjectList
                title={starred.length ? 'سایر پروژه‌ها' : 'همهٔ پروژه‌ها'}
                projects={other}
                {...(onDelete ? { onDelete } : {})}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProjectList({
  title,
  projects,
  onDelete,
}: {
  readonly title: string;
  readonly projects: readonly Project[];
  readonly onDelete?: (projectId: string) => void;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-caption font-semibold text-fg-secondary">{title}</h2>
      <ul className="divide-y divide-secondary overflow-hidden rounded-xl border border-secondary bg-surface">
        {projects.map((project) => (
          <li key={project.id} className="flex items-center gap-1 pe-1">
            <Link
              href={projectHref(project.id)}
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-start font-semibold text-fg-primary hover:bg-hover focus-visible:ring-inset"
            >
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-lg',
                  TONE_CLASSES[project.color],
                )}
              >
                <FolderIcon size={19} />
              </span>
              <span className="min-w-0 flex-1 break-words">{project.name}</span>
              {project.starred && <StarIcon size={15} className="shrink-0 text-status-progress" />}
              <ChevronForwardIcon size={17} className="shrink-0 text-fg-tertiary" />
            </Link>
            {onDelete && (
              <IconButton
                label={`حذف پروژه ${project.name}`}
                icon={<TrashIcon size={17} />}
                className="size-11 shrink-0"
                onClick={() => onDelete(project.id)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

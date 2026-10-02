'use client';

import { useMemo, useState } from 'react';
import type { Task, TaskDependencyType, TaskLink } from '@taskin/contracts';
import { cn } from '@/lib/cn';
import { DEPENDENCY_KINDS, dependencyKindLabel, linkProblem, openBlockers } from '@/lib/agile';
import { statusLabel, statusTone } from '@/data/reference';
import { useWorkspace } from '@/store/WorkspaceProvider';
import { Badge, Button, IconButton, Select } from '@/components/ui';
import { AddIcon, CloseIcon, LinkIcon, LockIcon } from '@/components/icons';

/**
 * The task's links to other tasks of its project, grouped by relation, with add and remove.
 * Blocking links may not form a cycle; the rule is checked here for an instant answer and again
 * by the server.
 */
export function DependencyManager({ task }: { readonly task: Task }) {
  const { state, dispatch } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<TaskDependencyType>('blocked_by');
  const [otherId, setOtherId] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const links = useMemo(() => state.taskLinks?.[task.id] ?? [], [state.taskLinks, task.id]);
  const byId = useMemo(() => new Map(state.tasks.map((entry) => [entry.id, entry])), [state.tasks]);
  const blockers = openBlockers(task, state.tasks);
  // Candidates: live tasks of the same project not linked yet.
  const candidates = state.tasks.filter(
    (entry) => entry.projectId === task.projectId && entry.id !== task.id && !links.some((link) => link.taskId === entry.id),
  );

  const reset = () => {
    setAdding(false);
    setOtherId('');
    setProblem(null);
  };

  const submit = () => {
    const other = byId.get(otherId);
    if (!other) {
      setProblem('وظیفه‌ای را برای پیوند انتخاب کنید.');
      return;
    }
    const reason = linkProblem(state.tasks, links, task, other, kind);
    if (reason) {
      setProblem(reason);
      return;
    }
    dispatch({ type: 'add-task-link', taskId: task.id, otherTaskId: other.id, kind });
    reset();
  };

  return (
    <section aria-label="وابستگی‌های وظیفه" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <h3 className="text-title-sm font-semibold text-fg-primary">وابستگی‌ها</h3>
        {blockers.length > 0 && task.status !== 'done' && (
          <Badge tone="blocked" size="sm" iconStart={<LockIcon size={11} />}>
            مسدود
          </Badge>
        )}
        {!adding && (
          <Button size="xs" variant="secondary" className="ms-auto" iconStart={<LinkIcon size={14} />} onClick={() => setAdding(true)}>
            افزودن وابستگی
          </Button>
        )}
      </div>

      {links.length === 0 && !adding && (
        <p className="rounded-lg border border-dashed border-primary px-3 py-3 text-center text-caption text-fg-tertiary">
          این وظیفه به وظیفه دیگری وابسته نیست.
        </p>
      )}

      {DEPENDENCY_KINDS.map(({ id }) => {
        const group = links.filter((link) => link.kind === id);
        if (group.length === 0) return null;
        return (
          <div key={id} className="flex flex-col gap-1.5">
            <span className="text-caption font-medium text-fg-tertiary">{dependencyKindLabel(id)}</span>
            <ul className="flex flex-col gap-1.5">
              {group.map((link) => (
                <LinkRow key={link.id} link={link} current={byId.get(link.taskId)} onRemove={() => dispatch({ type: 'remove-task-link', taskId: task.id, linkId: link.id })} />
              ))}
            </ul>
          </div>
        );
      })}

      {adding && (
        <div className="flex flex-col gap-2 rounded-xl border border-secondary bg-sunken/40 p-3">
          <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <Select
              label="نوع رابطه"
              size="sm"
              value={kind}
              onValueChange={(next) => {
                setKind(next);
                setProblem(null);
              }}
              options={DEPENDENCY_KINDS.map((entry) => ({ value: entry.id, label: entry.label }))}
            />
            <Select
              label="وظیفه پیوندی"
              size="sm"
              value={otherId}
              placeholder={candidates.length === 0 ? 'وظیفه دیگری در این پروژه نیست' : 'انتخاب وظیفه'}
              disabled={candidates.length === 0}
              onValueChange={(next) => {
                setOtherId(next);
                setProblem(null);
              }}
              options={candidates.map((entry) => ({ value: entry.id, label: `${entry.code} · ${entry.title}` }))}
            />
          </div>
          {problem && (
            <p role="alert" className="text-caption text-status-blocked">
              {problem}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="secondary" onClick={reset}>
              انصراف
            </Button>
            <Button size="xs" iconStart={<AddIcon size={14} />} onClick={submit} disabled={!otherId}>
              پیوند
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function LinkRow({ link, current, onRemove }: { readonly link: TaskLink; readonly current: Task | undefined; readonly onRemove: () => void }) {
  // The task on hand is fresher than the link's copy (its status changes as people work).
  const status = current?.status ?? link.status;
  const title = current?.title ?? link.title;
  const code = current?.code ?? link.code;
  return (
    <li className="flex items-center gap-2 rounded-lg border border-secondary bg-surface px-2 py-1.5">
      <span className="numeric latin-inline shrink-0 text-micro font-medium text-fg-quaternary">{code}</span>
      <span className={cn('min-w-0 flex-1 truncate text-caption', status === 'done' ? 'text-fg-tertiary line-through' : 'text-fg-primary')}>{title}</span>
      <Badge tone={statusTone(status)} size="sm" dot>
        {statusLabel(status)}
      </Badge>
      <IconButton label={`حذف پیوند با ${code}`} icon={<CloseIcon size={14} />} size="xs" onClick={onRemove} />
    </li>
  );
}

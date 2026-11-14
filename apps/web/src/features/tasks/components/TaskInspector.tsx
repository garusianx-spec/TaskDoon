'use client';

import { cn } from '@/lib/utils';

import { useEffect, useRef, useState } from 'react';
import { statusTone } from '@/data/reference';
import { columnForTask, projectById, userById } from '@/store/selectors';
import { Badge, Button, IconButton, Input, Textarea, Tooltip } from '@/components/ui';
import { SubtaskList } from '@/features/tasks/components/SubtaskList';
import { DependencyManager } from '@/features/agile/components/DependencyManager';
import type { TaskPatch } from '@/store/workspace-reducer';
import { CloseIcon, StarFilledIcon, StarIcon } from '@/components/icons';
import { type TaskInspectorProps } from '@/features/tasks/types/inspector';
import { TaskInspectorFields } from '@/features/tasks/components/TaskInspectorFields';
import { TaskSourceMessage } from '@/features/tasks/components/TaskSourceMessage';
import { TaskInspectorFiles } from '@/features/tasks/components/TaskInspectorFiles';
import { TaskDiscussion } from '@/features/tasks/components/TaskDiscussion';

/**
 * Full task inspector: status, people, Jalali dates, checklist, file repository and an
 * internal discussion thread kept separate from the chat module.
 */
export function TaskInspector({
  task: persistedTask,
  currentUser,
  columns,
  onClose,
  onSave,
  onBusyChange,
  onToggleStar,
  onToggleSubtask,
  onAddSubtask,
  onRemoveSubtask,
  onMoveSubtask,
  onAddComment,
  onAttachFiles,
  onRemoveAttachment,
  source = null,
  onOpenSource,
}: TaskInspectorProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const savingRef = useRef(false);
  const [draft, setDraft] = useState<TaskPatch>({});
  const [columnId, setColumnId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const fileBusyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(false);
  useEffect(() => {
    onBusyChange?.(saving || fileBusy);
    return () => onBusyChange?.(false);
  }, [saving, fileBusy, onBusyChange]);
  const stagedColumn = columns.find((entry) => entry.id === columnId);
  const task = {
    ...persistedTask,
    ...draft,
    ...(stagedColumn
      ? { status: stagedColumn.status, boardColumnId: stagedColumn.custom ? stagedColumn.id : null }
      : {}),
  };
  const onPatch = (patch: TaskPatch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };
  const project = projectById(task.projectId);
  const column = columnForTask(columns, task);
  const reviewer = task.reviewerId ? userById(task.reviewerId) : undefined;

  const save = async () => {
    if (savingRef.current || fileBusyRef.current) return;
    setTitleTouched(true);
    if (!task.title.trim()) {
      formRef.current?.querySelector<HTMLInputElement>('input[name="task-title"]')?.focus();
      return;
    }
    if (task.dueDate && task.startDate > task.dueDate) {
      setError('مهلت انجام را در تاریخ شروع یا پس از آن انتخاب کنید.');
      return;
    }
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (invalid) {
      invalid.focus();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(
        { ...draft, ...(draft.title !== undefined ? { title: task.title.trim() } : {}) },
        columnId,
      );
      onClose();
    } catch {
      setError(
        'همهٔ تغییرات ذخیره نشد. اتصال و دسترسی خود را بررسی کنید و دوباره ذخیره کنید؛ تغییرات شما در فرم باقی مانده است.',
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const changeFiles = async (operation: () => Promise<void> | void) => {
    if (fileBusyRef.current || savingRef.current) return;
    fileBusyRef.current = true;
    setFileBusy(true);
    setError(null);
    try {
      await operation();
    } catch {
      setError('فایل ذخیره نشد. اندازه و نوع فایل و اتصال را بررسی کنید و دوباره تلاش کنید.');
    } finally {
      fileBusyRef.current = false;
      setFileBusy(false);
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      aria-busy={saving || fileBusy}
    >
      <fieldset disabled={saving || fileBusy} className="min-w-0 border-0 p-0">
        {/* Stays in view while the dialog scrolls, so closing is always one click away. */}
        <header className="sticky top-0 z-10 flex shrink-0 items-start gap-2 border-b border-secondary bg-surface p-4 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Badge tone={statusTone(task.status)} size="sm" dot>
                {column?.title ?? task.status}
              </Badge>
              <span className="text-micro font-medium text-fg-quaternary numeric latin-inline">
                {task.code}
              </span>
            </div>
            <Input
              label="عنوان وظیفه"
              hint="عنوان وظیفه را ویرایش کنید."
              name="task-title"
              value={task.title}
              onChange={(event) => {
                setTitleTouched(false);
                onPatch({ title: event.target.value });
              }}
              onBlur={() => setTitleTouched(true)}
              error={titleTouched && !task.title.trim() ? 'عنوان وظیفه را وارد کنید.' : undefined}
              maxLength={200}
              className="font-semibold"
            />
            {project && <p className="truncate text-caption text-fg-tertiary">{project.name}</p>}
          </div>

          <Tooltip content={task.starred ? 'حذف از ستاره‌دارها' : 'افزودن به ستاره‌دارها'}>
            <IconButton
              label={task.starred ? 'حذف از ستاره‌دارها' : 'افزودن به ستاره‌دارها'}
              icon={task.starred ? <StarFilledIcon size={18} /> : <StarIcon size={18} />}
              size="sm"
              onClick={onToggleStar}
              className={cn('shrink-0 max-sm:size-11', task.starred && 'text-status-progress')}
            />
          </Tooltip>
          <IconButton
            label="بستن پنل جزئیات"
            className="shrink-0 max-sm:size-11"
            icon={<CloseIcon size={20} />}
            size="sm"
            onClick={onClose}
            disabled={saving || fileBusy}
          />
        </header>

        {/*
        From `md` the dialog is wide enough for two columns: the work itself (description,
        checklist, source, files, discussion) at the start, the properties beside it.
      */}
        <div className="grid gap-6 p-4 sm:p-6 md:grid-cols-[minmax(0,1fr)_17rem] md:items-start">
          <TaskInspectorFields
            task={task}
            column={column}
            columns={columns}
            reviewer={reviewer}
            onColumn={(nextColumnId) => {
              setColumnId(nextColumnId);
              setError(null);
            }}
            onPatch={onPatch}
          />

          <div className="flex min-w-0 flex-col gap-6 md:col-start-1 md:row-start-1">
            <section aria-label="توضیحات وظیفه">
              <h3 className="mb-2 text-title-sm font-semibold text-fg-primary">توضیحات</h3>
              <Textarea
                label="توضیحات وظیفه"
                hideLabel
                value={task.description}
                onChange={(event) => onPatch({ description: event.target.value })}
                className="min-h-24 text-body-sm"
                placeholder="شرح وظیفه را بنویسید…"
              />
            </section>

            <section aria-label="زیروظیفه‌ها">
              <SubtaskList
                subtasks={task.subtasks}
                taskTitle={task.title}
                onToggle={onToggleSubtask}
                onAdd={onAddSubtask}
                onRemove={onRemoveSubtask}
                onMove={onMoveSubtask}
              />
            </section>

            <DependencyManager task={task} />

            {source && <TaskSourceMessage source={source} onOpenSource={onOpenSource} />}

            <TaskInspectorFiles
              attachments={task.attachments}
              fileBusy={fileBusy}
              saving={saving}
              onAttachFiles={onAttachFiles}
              onRemoveAttachment={onRemoveAttachment}
              changeFiles={changeFiles}
              setError={setError}
            />

            <TaskDiscussion currentUser={currentUser} comments={task.comments} onAddComment={onAddComment} />
          </div>
        </div>
      </fieldset>
      <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t border-secondary bg-surface p-4 sm:px-6">
        {fileBusy && (
          <p role="status" className="me-auto text-caption text-fg-tertiary">
            در حال ذخیره فایل…
          </p>
        )}
        {error && (
          <p role="alert" className="w-full text-body-sm text-status-blocked">
            {error}
          </p>
        )}
        <Button
          className="max-sm:min-h-11"
          variant="secondary"
          onClick={onClose}
          disabled={saving || fileBusy}
        >
          انصراف
        </Button>
        <Button className="max-sm:min-h-11" type="submit" loading={saving} aria-disabled={fileBusy}>
          ذخیره تغییرات
        </Button>
      </footer>
    </form>
  );
}

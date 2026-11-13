'use client';

import { useId } from 'react';
import type { TaskPriority } from '@taskin/contracts';
import { TASK_PRIORITIES } from '@/data/reference';
import { projectColumns } from '@/store/selectors';
import { Checkbox, Select } from '@/components/ui';
import { JalaliDatePicker } from '@/components/shared/JalaliDatePicker';
import { ColumnDot } from '@/features/board/components/ColumnDot';
import { IssueTypeSelect, SeveritySelect } from '@/features/agile/components/IssueFields';
import { FlagIcon } from '@/components/icons';
import { type CreateTaskModalProps } from '@/features/tasks/types/create-task';
import { type CreateTaskForm } from '@/features/tasks/hooks/useCreateTaskForm';

export function TaskProjectField({
  model,
  fixedProjectId,
  columns,
}: { readonly model: CreateTaskForm } & Pick<CreateTaskModalProps, 'fixedProjectId' | 'columns'>) {
  const { form, setForm, setSubmitError, projects } = model;
  if (fixedProjectId !== undefined) return null;
  return (
    <Select
      label="پروژه"
      hideLabel={false}
      value={form.projectId}
      onValueChange={(projectId) => {
        setSubmitError(null);
        setForm((current) => ({
          ...current,
          projectId,
          // A custom column belongs to one board. Keep the status when switching projects.
          boardColumnId: projectColumns(columns, projectId).some(
            (column) => column.id === current.boardColumnId,
          )
            ? current.boardColumnId
            : null,
        }));
      }}
      options={projects.map((project) => ({ value: project.id, label: project.name }))}
    />
  );
}

export function TaskDeadlineField({
  model,
  timeZone,
}: { readonly model: CreateTaskForm } & Pick<CreateTaskModalProps, 'timeZone'>) {
  const { form, setForm, deadlineError, setDeadlineError } = model;
  const errorId = useId();
  const changeDeadline = (dueDate: string | null) => {
    setDeadlineError(null);
    setForm((current) => ({ ...current, dueDate }));
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-body-sm font-medium text-fg-secondary">مهلت انجام (اختیاری)</span>
      <JalaliDatePicker
        label="انتخاب مهلت انجام"
        emptyLabel="بدون مهلت"
        value={form.dueDate}
        timeZone={timeZone}
        onChange={changeDeadline}
        onClear={() => changeDeadline(null)}
        invalid={Boolean(deadlineError)}
        describedBy={deadlineError ? errorId : undefined}
      />
      {deadlineError && (
        <p id={errorId} role="alert" className="text-caption text-status-blocked">
          {deadlineError}
        </p>
      )}
    </div>
  );
}

export function TaskPlanningFields({
  model,
  timeZone,
}: { readonly model: CreateTaskForm } & Pick<CreateTaskModalProps, 'timeZone'>) {
  const { form, setForm, setDeadlineError, today, boardColumns, columnValue } = model;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="ستون بورد"
          hideLabel={false}
          value={columnValue}
          onValueChange={(columnId) => {
            const column = boardColumns.find((entry) => entry.id === columnId);
            if (!column) return;
            setForm((current) => ({
              ...current,
              status: column.status,
              boardColumnId: column.custom ? column.id : null,
            }));
          }}
          options={boardColumns.map((column) => ({
            value: column.id,
            label: column.title,
            icon: <ColumnDot column={column} />,
            ...(column.custom ? { description: 'ستون سفارشی' } : {}),
          }))}
        />
        <Select
          label="اولویت"
          hideLabel={false}
          value={form.priority}
          onValueChange={(priority: TaskPriority) => setForm((current) => ({ ...current, priority }))}
          options={TASK_PRIORITIES.map((entry) => ({
            value: entry.id,
            label: entry.label,
            icon: <FlagIcon size={15} />,
          }))}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-body-sm font-medium text-fg-secondary">تاریخ شروع</span>
        <JalaliDatePicker
          label="انتخاب تاریخ شروع"
          value={form.startDate ?? today()}
          timeZone={timeZone}
          onChange={(startDate) => {
            setDeadlineError(null);
            setForm((current) => ({ ...current, startDate }));
          }}
        />
      </div>

      {/* Agile tracking: a plain task on the board unless chosen otherwise. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <IssueTypeSelect
          label="نوع"
          hideLabel={false}
          size="md"
          value={form.type ?? 'task'}
          onChange={(type) =>
            setForm((current) => ({ ...current, type, ...(type === 'bug' ? {} : { severity: null }) }))
          }
        />
        {form.type === 'bug' && (
          <SeveritySelect
            label="شدت"
            hideLabel={false}
            size="md"
            value={form.severity ?? null}
            onChange={(severity) => setForm((current) => ({ ...current, severity }))}
          />
        )}
      </div>
      <Checkbox
        checked={form.isBacklog === true}
        onCheckedChange={(isBacklog) => setForm((current) => ({ ...current, isBacklog }))}
        label="افزودن به بک‌لاگ (فعلاً روی بورد نمی‌آید)"
      />
    </>
  );
}

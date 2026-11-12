'use client';

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

export function TaskPlanningFields({
  model,
  fixedProjectId,
  columns,
  timeZone,
}: { readonly model: CreateTaskForm } & Pick<
  CreateTaskModalProps,
  'fixedProjectId' | 'columns' | 'timeZone'
>) {
  const { form, setForm, setSubmitError, today, boardColumns, columnValue, projects } = model;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fixedProjectId === undefined && (
          <Select
            label="پروژه"
            hideLabel={false}
            value={form.projectId}
            onValueChange={(projectId) => {
              setSubmitError(null);
              setForm((current) => ({
                ...current,
                projectId,
                // Another project's custom column is not on this board; its status still holds.
                boardColumnId: projectColumns(columns, projectId).some(
                  (column) => column.id === current.boardColumnId,
                )
                  ? current.boardColumnId
                  : null,
              }));
            }}
            options={projects.map((project) => ({
              value: project.id,
              label: project.name,
            }))}
          />
        )}

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-body-sm font-medium text-fg-secondary">تاریخ شروع</span>
          <JalaliDatePicker
            label="انتخاب تاریخ شروع"
            value={form.startDate ?? today()}
            timeZone={timeZone}
            onChange={(startDate) => {
              setSubmitError(null);
              setForm((current) => ({ ...current, startDate }));
            }}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-body-sm font-medium text-fg-secondary">مهلت انجام</span>
          <JalaliDatePicker
            label="انتخاب مهلت انجام"
            value={form.dueDate ?? today()}
            timeZone={timeZone}
            onChange={(dueDate) => {
              setSubmitError(null);
              setForm((current) => ({ ...current, dueDate }));
            }}
          />
        </div>
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

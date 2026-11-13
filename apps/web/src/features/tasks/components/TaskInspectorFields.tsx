'use client';

import type { BoardColumn, Task, TaskPriority, User } from '@taskin/contracts';
import { TASK_PRIORITIES } from '@/data/reference';
import { Select } from '@/components/ui';
import { JalaliDatePicker } from '@/components/shared/JalaliDatePicker';
import { ColumnDot } from '@/features/board/components/ColumnDot';
import { IssueFields } from '@/features/agile/components/IssueFields';
import type { TaskPatch } from '@/store/workspace-reducer';
import { FlagIcon } from '@/components/icons';
import { PeoplePicker } from '@/features/tasks/components/TaskPeoplePicker';

export function TaskInspectorFields({
  task,
  column,
  columns,
  onColumn,
  onPatch,
}: {
  readonly task: Task;
  readonly column: BoardColumn | undefined;
  readonly columns: readonly BoardColumn[];
  readonly onColumn: (id: string) => void;
  readonly onPatch: (patch: TaskPatch) => void;
}) {
  return (
    <section
      className="grid gap-3 rounded-xl border border-secondary bg-sunken/40 p-3 sm:grid-cols-3 sm:p-4"
      aria-label="وضعیت، مسئولان و مهلت انجام"
    >
      <Field label="وضعیت">
        <Select
          label="وضعیت وظیفه"
          size="sm"
          value={column?.id ?? task.status}
          onValueChange={onColumn}
          options={columns.map((entry) => ({
            value: entry.id,
            label: entry.title,
            icon: <ColumnDot column={entry} />,
            ...(entry.custom ? { description: 'ستون سفارشی' } : {}),
          }))}
        />
      </Field>

      <Field label="مسئولان">
        <PeoplePicker
          selectedIds={task.assigneeIds}
          onToggle={(userId) =>
            onPatch({
              assigneeIds: task.assigneeIds.includes(userId)
                ? task.assigneeIds.filter((id) => id !== userId)
                : [...task.assigneeIds, userId],
            })
          }
          label="انتخاب مسئولان وظیفه"
          emptyLabel="افزودن مسئول"
        />
      </Field>

      <Field label="مهلت انجام (اختیاری)">
        <JalaliDatePicker
          label="انتخاب مهلت انجام"
          emptyLabel="بدون مهلت"
          value={task.dueDate}
          onChange={(dueDate) => onPatch({ dueDate })}
          onClear={() => onPatch({ dueDate: null })}
        />
      </Field>
    </section>
  );
}

export function TaskInspectorMetadata({
  task,
  reviewer,
  onPatch,
}: {
  readonly task: Task;
  readonly reviewer: User | undefined;
  readonly onPatch: (patch: TaskPatch) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="اولویت">
        <Select
          label="اولویت وظیفه"
          size="sm"
          value={task.priority}
          onValueChange={(priority: TaskPriority) => onPatch({ priority })}
          options={TASK_PRIORITIES.map((entry) => ({
            value: entry.id,
            label: entry.label,
            icon: <FlagIcon size={15} />,
          }))}
        />
      </Field>

      <Field label="تاییدکننده">
        <PeoplePicker
          selectedIds={reviewer ? [reviewer.id] : []}
          onToggle={(userId) => onPatch({ reviewerId: task.reviewerId === userId ? null : userId })}
          label="انتخاب تاییدکننده"
          emptyLabel="افزودن تاییدکننده"
          single
        />
      </Field>

      <Field label="تاریخ شروع">
        <JalaliDatePicker
          label="انتخاب تاریخ شروع"
          value={task.startDate}
          onChange={(startDate) => onPatch({ startDate })}
        />
      </Field>

      <IssueFields task={task} onPatch={onPatch} />
    </div>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption font-medium text-fg-tertiary">{label}</span>
      {children}
    </div>
  );
}

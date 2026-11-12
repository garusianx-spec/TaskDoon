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
  reviewer,
  onColumn,
  onPatch,
}: {
  readonly task: Task;
  readonly column: BoardColumn | undefined;
  readonly columns: readonly BoardColumn[];
  readonly reviewer: User | undefined;
  readonly onColumn: (id: string) => void;
  readonly onPatch: (patch: TaskPatch) => void;
}) {
  return (
    <section
      className="flex flex-col gap-3 md:col-start-2 md:row-start-1 md:rounded-xl md:border md:border-secondary md:bg-sunken/40 md:p-4"
      aria-label="ویژگی‌های وظیفه"
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

      <IssueFields task={task} onPatch={onPatch} />

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

      <Field label="تاییدکننده">
        <PeoplePicker
          selectedIds={reviewer ? [reviewer.id] : []}
          onToggle={(userId) => onPatch({ reviewerId: task.reviewerId === userId ? null : userId })}
          label="انتخاب تاییدکننده"
          emptyLabel="افزودن تاییدکننده"
          single
        />
      </Field>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
        <Field label="تاریخ شروع">
          <JalaliDatePicker
            label="انتخاب تاریخ شروع"
            value={task.startDate}
            onChange={(startDate) => onPatch({ startDate })}
          />
        </Field>
        <Field label="مهلت انجام">
          <JalaliDatePicker
            label="انتخاب مهلت انجام"
            value={task.dueDate}
            onChange={(dueDate) => onPatch({ dueDate })}
          />
        </Field>
      </div>
    </section>
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

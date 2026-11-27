'use client';

import { useId } from 'react';
import type { TaskPriority } from '@taskin/contracts';
import { TASK_PRIORITIES } from '@/data/reference';
import { projectColumns } from '@/store/selectors';
import { directory } from '@/store/directory';
import { Avatar, Checkbox, Select } from '@/components/ui';
import { JalaliDatePicker } from '@/components/shared/JalaliDatePicker';
import { ColumnDot } from '@/features/board/components/ColumnDot';
import { IssueTypeSelect, SeveritySelect } from '@/features/agile/components/IssueFields';
import { CheckIcon, CloseIcon, FlagIcon, UserIcon } from '@/components/icons';
import { addDays, formatJalali, fromISODate } from '@taskin/jalali';
import { cn } from '@/lib/utils';
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

export function TaskPrioritySelector({ model }: { readonly model: CreateTaskForm }) {
  const { form, setForm } = model;

  const PRIORITY_CONFIG: Record<
    TaskPriority,
    { label: string; activeClass: string; dotClass: string }
  > = {
    urgent: {
      label: 'فوری',
      activeClass: 'border-rose-500/80 bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30',
      dotClass: 'bg-rose-500',
    },
    high: {
      label: 'بالا',
      activeClass: 'border-amber-500/80 bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
      dotClass: 'bg-amber-500',
    },
    medium: {
      label: 'متوسط',
      activeClass: 'border-cyan-500/80 bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30',
      dotClass: 'bg-cyan-500',
    },
    low: {
      label: 'پایین',
      activeClass: 'border-fg-tertiary bg-sunken text-fg-primary ring-1 ring-fg-tertiary/30',
      dotClass: 'bg-fg-quaternary',
    },
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-body-sm font-medium text-fg-secondary">اولویت انجام</span>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="اولویت وظیفه">
        {TASK_PRIORITIES.map((entry) => {
          const selected = form.priority === entry.id;
          const config = PRIORITY_CONFIG[entry.id];
          return (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setForm((current) => ({ ...current, priority: entry.id }))}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-caption font-medium transition-all cursor-pointer max-sm:min-h-11',
                selected
                  ? config.activeClass
                  : 'border-secondary/70 bg-sunken/40 text-fg-tertiary hover:border-secondary hover:bg-hover hover:text-fg-secondary',
              )}
            >
              <FlagIcon size={13} className="shrink-0" />
              <span>{config.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TaskAssigneeSelector({
  model,
  currentUserId,
}: {
  readonly model: CreateTaskForm;
  readonly currentUserId?: string;
}) {
  const { form, setForm } = model;
  const users = directory.users();
  const me = users.find((u) => u.id === currentUserId) ?? users[0];
  const isAssignedToMe = Boolean(me && form.assigneeIds.includes(me.id));

  const toggleUser = (userId: string) => {
    setForm((current) => ({
      ...current,
      assigneeIds: current.assigneeIds.includes(userId)
        ? current.assigneeIds.filter((id) => id !== userId)
        : [...current.assigneeIds, userId],
    }));
  };

  const selectedUsers = users.filter((u) => form.assigneeIds.includes(u.id));

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-body-sm font-medium text-fg-secondary">مسئولان انجام</span>
        {me && (
          <button
            type="button"
            onClick={() => toggleUser(me.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-caption transition-colors cursor-pointer max-sm:min-h-11',
              isAssignedToMe
                ? 'border border-brand/40 bg-brand-subtle font-medium text-fg-brand'
                : 'text-fg-tertiary hover:bg-hover hover:text-fg-primary',
            )}
          >
            <UserIcon size={14} />
            {isAssignedToMe ? 'به من اختصاص دارد' : 'اختصاص به من'}
          </button>
        )}
      </div>

      {/* Selected users chips */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-secondary/60 bg-sunken/40 p-2">
          {selectedUsers.map((user) => (
            <span
              key={user.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-secondary bg-surface py-1 pe-2 ps-1 text-caption text-fg-primary shadow-xs"
            >
              <Avatar
                name={user.fullName}
                initials={user.initials}
                tone={user.avatarTone}
                size="xs"
                decorative
              />
              <span className="font-medium">{user.fullName}</span>
              <button
                type="button"
                onClick={() => toggleUser(user.id)}
                aria-label={`حذف ${user.fullName}`}
                className="ms-0.5 flex size-4 items-center justify-center rounded-full text-fg-tertiary hover:bg-hover hover:text-fg-primary cursor-pointer"
              >
                <CloseIcon size={12} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setForm((c) => ({ ...c, assigneeIds: [] }))}
            className="ms-auto text-micro text-fg-tertiary hover:text-status-blocked transition-colors cursor-pointer"
          >
            پاک کردن همه
          </button>
        </div>
      )}

      {/* Quick member toggle row */}
      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto scrollbar-thin py-0.5">
        {users.map((user) => {
          const selected = form.assigneeIds.includes(user.id);
          return (
            <button
              key={user.id}
              type="button"
              onClick={() => toggleUser(user.id)}
              aria-pressed={selected}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-caption transition-all cursor-pointer max-sm:min-h-11',
                selected
                  ? 'border-brand bg-brand-subtle font-medium text-fg-primary ring-1 ring-brand/30 shadow-xs'
                  : 'border-secondary bg-sunken text-fg-secondary hover:border-fg-tertiary hover:bg-hover',
              )}
            >
              <Avatar
                name={user.fullName}
                initials={user.initials}
                tone={user.avatarTone}
                size="xs"
                decorative
              />
              <span className="truncate">{user.fullName}</span>
              {selected && <CheckIcon size={13} className="text-fg-brand" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TaskDeadlineField({
  model,
  timeZone,
}: { readonly model: CreateTaskForm } & Pick<CreateTaskModalProps, 'timeZone'>) {
  const { form, setForm, deadlineError, setDeadlineError, today } = model;
  const errorId = useId();
  const currentToday = today();
  const tomorrow = addDays(currentToday, 1);
  const nextWeek = addDays(currentToday, 7);

  const changeDeadline = (dueDate: string | null) => {
    setDeadlineError(null);
    setForm((current) => ({ ...current, dueDate }));
  };

  const isToday = form.dueDate === currentToday;
  const isTomorrow = form.dueDate === tomorrow;
  const isNextWeek = form.dueDate === nextWeek;
  const isNone = form.dueDate === null;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-body-sm font-medium text-fg-secondary">مهلت انجام</span>
        {form.dueDate && (
          <span className="text-caption font-medium text-fg-brand">
            {formatJalali(fromISODate(form.dueDate), 'long')}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => changeDeadline(currentToday)}
          className={cn(
            'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-caption transition-all cursor-pointer max-sm:min-h-11',
            isToday
              ? 'border-brand bg-brand-subtle font-medium text-fg-brand shadow-xs'
              : 'border-secondary bg-sunken text-fg-secondary hover:border-fg-tertiary hover:bg-hover',
          )}
        >
          {isToday && <CheckIcon size={13} />}
          امروز
        </button>
        <button
          type="button"
          onClick={() => changeDeadline(tomorrow)}
          className={cn(
            'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-caption transition-all cursor-pointer max-sm:min-h-11',
            isTomorrow
              ? 'border-brand bg-brand-subtle font-medium text-fg-brand shadow-xs'
              : 'border-secondary bg-sunken text-fg-secondary hover:border-fg-tertiary hover:bg-hover',
          )}
        >
          {isTomorrow && <CheckIcon size={13} />}
          فردا
        </button>
        <button
          type="button"
          onClick={() => changeDeadline(nextWeek)}
          className={cn(
            'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-caption transition-all cursor-pointer max-sm:min-h-11',
            isNextWeek
              ? 'border-brand bg-brand-subtle font-medium text-fg-brand shadow-xs'
              : 'border-secondary bg-sunken text-fg-secondary hover:border-fg-tertiary hover:bg-hover',
          )}
        >
          {isNextWeek && <CheckIcon size={13} />}
          هفته آینده
        </button>
        <button
          type="button"
          onClick={() => changeDeadline(null)}
          className={cn(
            'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-caption transition-all cursor-pointer max-sm:min-h-11',
            isNone
              ? 'border-secondary bg-sunken font-medium text-fg-primary'
              : 'border-secondary/60 bg-sunken/40 text-fg-tertiary hover:bg-hover hover:text-fg-secondary',
          )}
        >
          بدون مهلت
        </button>

        <div className="ms-auto flex items-center">
          <JalaliDatePicker
            label="انتخاب تاریخ دیگر"
            emptyLabel="تقویم شمسی…"
            value={form.dueDate}
            timeZone={timeZone}
            onChange={changeDeadline}
            onClear={() => changeDeadline(null)}
            invalid={Boolean(deadlineError)}
            describedBy={deadlineError ? errorId : undefined}
          />
        </div>
      </div>

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
        label="افزودن به بک‌لاگ (فعلاً روی بورد نمایش داده نشود)"
      />
    </>
  );
}

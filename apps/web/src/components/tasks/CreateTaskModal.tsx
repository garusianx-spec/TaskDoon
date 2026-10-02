'use client';

import { useState } from 'react';
import type { BoardColumn, TaskDraft, TaskPriority } from '@taskin/contracts';
import { TASK_PRIORITIES } from '@/data/reference';
import { directory } from '@/store/directory';
import { formatFileSize } from '@/lib/format';
import { formatJalali, toISODate } from '@taskin/jalali';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { taskDraft } from '@/store/drafts';
import { columnForPlacement, projectColumns } from '@/store/selectors';
import { Avatar, Badge, Button, Checkbox, IconButton, Input, Modal, Select, Textarea } from '@/components/ui';
import { JalaliDatePicker } from './JalaliDatePicker';
import { ColumnDot } from './ColumnDot';
import { IssueTypeSelect, SeveritySelect } from './agile/IssueFields';
import {
  CloseIcon,
  ConvertToTaskIcon,
  FlagIcon,
  NotebookIcon,
  PaperclipIcon,
  SubtaskIcon,
  TaskSquareIcon,
} from '@/components/icons';

export interface CreateTaskModalProps {
  readonly open: boolean;
  readonly draft: TaskDraft | null;
  /** Every project's board columns, custom ones included; the chosen project's are offered. */
  readonly columns: readonly BoardColumn[];
  readonly onClose: () => void;
  readonly onSubmit: (draft: TaskDraft) => void;
  /** Offered when there is no project yet: every task belongs to one. */
  readonly onCreateProject?: () => void;
}

const today = (): string => toISODate(new Date());

/**
 * Task composer. Opened blank from the rail, sidebar or board; pre-dated from a calendar
 * cell; or pre-filled from a chat message ("تبدیل به وظیفه") or a note ("تبدیل یادداشت به
 * وظیفه") — in which case the source, attachments and checklist items ride along.
 */
export function CreateTaskModal({ open, draft, columns, onClose, onSubmit, onCreateProject }: CreateTaskModalProps) {
  const [form, setForm] = useState<TaskDraft>(() => taskDraft());
  const [touched, setTouched] = useState(false);

  // Re-seed whenever the modal opens so a sourced draft replaces the previous form.
  useResetOnOpen(
    open,
    () => {
      setForm(draft ? { ...draft, dueDate: draft.dueDate ?? today() } : taskDraft({ dueDate: today() }));
      setTouched(false);
    },
    draft,
  );

  const fromMessage = form.sourceMessageId !== null;
  const fromNote = form.sourceNoteId !== null;
  // Each project has its own board: offer the chosen project's columns only.
  const boardColumns = projectColumns(columns, form.projectId);
  const columnValue = columnForPlacement(boardColumns, form)?.id ?? '';
  const presetDate = draft !== null && draft.dueDate !== null && !fromMessage && !fromNote;
  const titleError = touched && form.title.trim().length === 0 ? 'عنوان وظیفه الزامی است.' : undefined;

  const projects = directory.projects();
  const noProject = !projects.some((project) => project.id === form.projectId);

  const submit = () => {
    setTouched(true);
    if (form.title.trim().length === 0 || noProject) return;
    onSubmit({ ...form, title: form.title.trim(), dueDate: form.dueDate ?? today() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={fromMessage ? 'تبدیل پیام به وظیفه' : fromNote ? 'تبدیل یادداشت به وظیفه' : 'تعریف وظیفه جدید'}
      description={
        fromMessage
          ? 'متن و پیوست پیام انتخاب‌شده به‌صورت خودکار در فرم قرار گرفت. جزئیات را تکمیل کنید.'
          : fromNote
            ? 'عنوان و متن یادداشت در فرم قرار گرفت و موارد چک‌لیست به زیروظیفه تبدیل می‌شوند.'
            : presetDate && form.dueDate
              ? `مهلت انجام روی ${formatJalali(form.dueDate, 'long')} تنظیم شده است.`
              : 'وظیفه را در یکی از پروژه‌های سازمان ثبت کنید.'
      }
      icon={
        fromMessage ? (
          <ConvertToTaskIcon size={20} />
        ) : fromNote ? (
          <NotebookIcon size={20} />
        ) : (
          <TaskSquareIcon size={20} />
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit}>
            {fromMessage ? 'ایجاد وظیفه از پیام' : fromNote ? 'ایجاد وظیفه از یادداشت' : 'ایجاد وظیفه'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {projects.length === 0 && (
          <div role="note" className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-secondary bg-sunken p-3 text-body-sm text-fg-secondary">
            <span className="flex-1">هنوز پروژه‌ای در این فضای کاری نیست؛ هر وظیفه در یک پروژه ثبت می‌شود.</span>
            {onCreateProject && (
              <Button size="sm" variant="secondary" onClick={onCreateProject}>
                ساخت پروژه
              </Button>
            )}
          </div>
        )}
        <Input
          label="عنوان وظیفه"
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          onBlur={() => setTouched(true)}
          placeholder="مثلاً: بازبینی جریان ورود کاربران"
          error={titleError}
          data-autofocus
        />

        <Textarea
          label="توضیحات"
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          placeholder="جزئیات، معیار پذیرش یا زمینه وظیفه را بنویسید…"
          className="min-h-28"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="پروژه"
            hideLabel={false}
            value={form.projectId}
            onValueChange={(projectId) =>
              setForm((current) => ({
                ...current,
                projectId,
                // Another project's custom column is not on this board; its status still holds.
                boardColumnId: projectColumns(columns, projectId).some((column) => column.id === current.boardColumnId) ? current.boardColumnId : null,
              }))
            }
            options={projects.map((project) => ({
              value: project.id,
              label: project.name,
            }))}
          />

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

          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-fg-secondary">مهلت انجام</span>
            <JalaliDatePicker
              label="انتخاب مهلت انجام"
              value={form.dueDate ?? today()}
              onChange={(dueDate) => setForm((current) => ({ ...current, dueDate }))}
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
            onChange={(type) => setForm((current) => ({ ...current, type, ...(type === 'bug' ? {} : { severity: null }) }))}
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

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-sm font-medium text-fg-secondary">مسئولان</legend>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {directory.users().map((user) => {
              const checked = form.assigneeIds.includes(user.id);
              return (
                <label
                  key={user.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-secondary px-2.5 py-2 transition-colors hover:bg-hover has-[[aria-checked=true]]:border-brand"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) =>
                      setForm((current) => ({
                        ...current,
                        assigneeIds: next
                          ? [...current.assigneeIds, user.id]
                          : current.assigneeIds.filter((id) => id !== user.id),
                      }))
                    }
                    ariaLabel={user.fullName}
                    size="sm"
                  />
                  <Avatar
                    name={user.fullName}
                    initials={user.initials}
                    tone={user.avatarTone}
                    size="sm"
                    decorative
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-caption font-semibold text-fg-primary">
                      {user.fullName}
                    </span>
                    <span className="truncate text-micro text-fg-tertiary">{user.jobTitle}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {form.subtaskTitles.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-medium text-fg-secondary">زیروظیفه‌ها از چک‌لیست یادداشت</span>
            <ul className="flex flex-col gap-1.5">
              {form.subtaskTitles.map((title, index) => (
                <li
                  key={`${index}-${title}`}
                  className="flex items-center gap-2.5 rounded-lg border border-secondary bg-sunken p-2"
                >
                  <SubtaskIcon size={16} className="shrink-0 text-fg-quaternary" />
                  <span className="flex-1 truncate text-caption font-medium text-fg-primary">{title}</span>
                  <IconButton
                    label={`حذف «${title}» از زیروظیفه‌ها`}
                    icon={<CloseIcon size={14} />}
                    size="xs"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        subtaskTitles: current.subtaskTitles.filter((_, position) => position !== index),
                      }))
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {form.attachments.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-medium text-fg-secondary">پیوست‌های منتقل‌شده</span>
            <ul className="flex flex-col gap-1.5">
              {form.attachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="flex items-center gap-2.5 rounded-lg border border-secondary bg-sunken p-2"
                >
                  <PaperclipIcon size={16} className="shrink-0 text-fg-quaternary" />
                  <span className="flex-1 truncate text-caption font-medium text-fg-primary">
                    {attachment.name}
                  </span>
                  <span className="numeric text-micro text-fg-tertiary">
                    {formatFileSize(attachment.size)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {fromMessage && (
          <Badge tone="brand" size="md" iconStart={<ConvertToTaskIcon size={13} />}>
            این وظیفه به پیام مبدأ در گفتگو پیوند داده می‌شود.
          </Badge>
        )}
        {fromNote && (
          <Badge tone="brand" size="md" iconStart={<NotebookIcon size={13} />}>
            این وظیفه به یادداشت مبدأ پیوند داده می‌شود.
          </Badge>
        )}
      </div>
    </Modal>
  );
}

'use client';

import { useEffect, useState } from 'react';
import type { TaskDraft, TaskPriority, TaskStatus } from '@/types';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/data/reference';
import { PROJECTS, USERS } from '@/data/workspace';
import { formatFileSize } from '@/lib/format';
import { toISODate } from '@/lib/jalali';
import { Avatar, Badge, Button, Checkbox, Input, Modal, Select, Textarea } from '@/components/ui';
import { JalaliDatePicker } from './JalaliDatePicker';
import { ReminderPicker } from './ReminderPicker';
import { RecurrenceEditor } from './RecurrenceEditor';
import { SubtaskList } from './SubtaskList';
import { ConvertToTaskIcon, FlagIcon, PaperclipIcon, TaskSquareIcon } from '@/components/icons';

export interface CreateTaskModalProps {
  readonly open: boolean;
  readonly draft: TaskDraft | null;
  readonly onClose: () => void;
  readonly onSubmit: (draft: TaskDraft) => void;
}

const today = (): string => toISODate(new Date());

let draftSubtaskSeq = 0;
const nextDraftSubtaskId = (): string => {
  draftSubtaskSeq += 1;
  return `draft-subtask-${draftSubtaskSeq}`;
};

/** Shared blank draft so every entry point into the composer starts from one shape. */
export const BLANK_TASK_DRAFT: TaskDraft = {
  title: '',
  description: '',
  projectId: PROJECTS[0]?.id ?? '',
  status: 'todo',
  priority: 'medium',
  assigneeIds: [],
  dueDate: null,
  sourceMessageId: null,
  attachments: [],
  subtasks: [],
  reminder: null,
  recurrence: null,
};

/**
 * Task composer. Opened blank from the sidebar/board, or pre-filled from a chat message via
 * "تبدیل به وظیفه" — in which case the source message and any attachment ride along.
 */
export function CreateTaskModal({ open, draft, onClose, onSubmit }: CreateTaskModalProps) {
  const [form, setForm] = useState<TaskDraft>(BLANK_TASK_DRAFT);
  const [touched, setTouched] = useState(false);

  // Re-seed whenever the modal opens so a chat-sourced draft replaces the previous form.
  useEffect(() => {
    if (!open) return;
    setForm(draft ?? { ...BLANK_TASK_DRAFT, dueDate: today() });
    setTouched(false);
  }, [open, draft]);

  const fromMessage = form.sourceMessageId !== null;
  const titleError = touched && form.title.trim().length === 0 ? 'عنوان وظیفه الزامی است.' : undefined;

  const submit = () => {
    setTouched(true);
    if (form.title.trim().length === 0) return;
    onSubmit({ ...form, title: form.title.trim(), dueDate: form.dueDate ?? today() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={fromMessage ? 'تبدیل پیام به وظیفه' : 'تعریف وظیفه جدید'}
      description={
        fromMessage
          ? 'متن و پیوست پیام انتخاب‌شده به‌صورت خودکار در فرم قرار گرفت. جزئیات را تکمیل کنید.'
          : 'وظیفه را در یکی از پروژه‌های سازمان ثبت کنید.'
      }
      icon={fromMessage ? <ConvertToTaskIcon size={20} /> : <TaskSquareIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit}>{fromMessage ? 'ایجاد وظیفه از پیام' : 'ایجاد وظیفه'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="عنوان وظیفه"
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          onBlur={() => setTouched(true)}
          placeholder="مثلاً: بازبینی جریان ورود کاربران"
          error={titleError}
          autoFocus
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
            onValueChange={(projectId) => setForm((current) => ({ ...current, projectId }))}
            options={PROJECTS.map((project) => ({
              value: project.id,
              label: project.name,
              ...(project.parentId ? { description: 'زیرپروژه' } : {}),
            }))}
          />

          <Select
            label="وضعیت اولیه"
            hideLabel={false}
            value={form.status}
            onValueChange={(status: TaskStatus) => setForm((current) => ({ ...current, status }))}
            options={TASK_STATUSES.map((entry) => ({ value: entry.id, label: entry.label }))}
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

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-sm font-medium text-fg-secondary">مسئولان</legend>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {USERS.map((user) => {
              const checked = form.assigneeIds.includes(user.id);
              return (
                <label
                  key={user.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-secondary px-2.5 py-2 transition-colors hover:bg-hover has-[:checked]:border-brand"
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

        <section className="rounded-xl border border-secondary p-3">
          <SubtaskList
            subtasks={form.subtasks}
            taskTitle={form.title || 'وظیفه جدید'}
            onToggle={(subtaskId) =>
              setForm((current) => ({
                ...current,
                subtasks: current.subtasks.map((subtask) =>
                  subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask,
                ),
              }))
            }
            onAdd={(title) =>
              setForm((current) => ({
                ...current,
                subtasks: [
                  ...current.subtasks,
                  { id: nextDraftSubtaskId(), title, done: false, assigneeId: null },
                ],
              }))
            }
            onRemove={(subtaskId) =>
              setForm((current) => ({
                ...current,
                subtasks: current.subtasks.filter((subtask) => subtask.id !== subtaskId),
              }))
            }
            onMove={(subtaskId, delta) =>
              setForm((current) => {
                const index = current.subtasks.findIndex((subtask) => subtask.id === subtaskId);
                const target = index + delta;
                if (index === -1 || target < 0 || target >= current.subtasks.length) return current;
                const next = [...current.subtasks];
                const [moved] = next.splice(index, 1);
                if (!moved) return current;
                next.splice(target, 0, moved);
                return { ...current, subtasks: next };
              })
            }
          />
        </section>

        <ReminderPicker
          value={form.reminder}
          dueDate={form.dueDate ?? today()}
          onChange={(reminder) => setForm((current) => ({ ...current, reminder }))}
        />

        <RecurrenceEditor
          value={form.recurrence}
          startDate={form.dueDate ?? today()}
          onChange={(recurrence) => setForm((current) => ({ ...current, recurrence }))}
        />

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
      </div>
    </Modal>
  );
}

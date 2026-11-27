'use client';

import { useId, useState, type ReactNode } from 'react';
import { formatJalali, fromISODate } from '@taskin/jalali';
import { Badge, Button, IconButton, Input, Modal, Textarea } from '@/components/ui';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  ConvertToTaskIcon,
  NotebookIcon,
  SubtaskIcon,
  TaskSquareIcon,
} from '@/components/icons';
import { type CreateTaskModalProps } from '@/features/tasks/types/create-task';

/**
 * Task composer. Opened blank from the rail, sidebar or board; pre-dated from a calendar
 * cell; or pre-filled from a chat message ("تبدیل به وظیفه") or a note ("تبدیل یادداشت به
 * وظیفه") — in which case the source, attachments and checklist items ride along.
 */
import { useCreateTaskForm } from '@/features/tasks/hooks/useCreateTaskForm';
import {
  TaskAssigneeSelector,
  TaskDeadlineField,
  TaskPlanningFields,
  TaskPrioritySelector,
  TaskProjectField,
} from '@/features/tasks/components/TaskPlanningFields';
import { TaskCreateFiles } from '@/features/tasks/components/TaskCreateFiles';

export function CreateTaskModal({
  open,
  draft,
  columns,
  fixedProjectId,
  currentUserId,
  timeZone,
  onClose,
  onSubmit,
  onCreateProject,
}: CreateTaskModalProps) {
  const model = useCreateTaskForm({ open, draft, columns, fixedProjectId, timeZone, onClose, onSubmit });
  const {
    form,
    setForm,
    setTouched,
    submitError,
    saving,
    titleRef,
    fromMessage,
    fromNote,
    presetDate,
    titleError,
    projects,
    close,
    submit,
  } = model;

  const handleGlobalKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title={fromMessage ? 'تبدیل پیام به وظیفه' : fromNote ? 'تبدیل یادداشت به وظیفه' : 'تعریف وظیفه جدید'}
      description={
        fromMessage
          ? 'متن و پیوست پیام به‌صورت خودکار در فرم قرار گرفت. جزئیات را تکمیل کنید.'
          : fromNote
            ? 'عنوان و متن یادداشت در فرم قرار گرفت و موارد تیک‌نخورده به زیروظیفه تبدیل می‌شوند.'
            : presetDate && form.dueDate
              ? `مهلت انجام روی ${formatJalali(fromISODate(form.dueDate), 'long')} تنظیم شده است.`
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
          {model.dismissWarning && (
            <div role="alert" className="basis-full rounded-lg border border-secondary bg-sunken p-3">
              <p>تغییرات ذخیره‌نشده دارید. پیش از بستن، وظیفه را ایجاد کنید یا تغییرات را کنار بگذارید.</p>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={model.keepEditing}>
                  ادامه ویرایش
                </Button>
                <Button variant="destructive" disabled={saving} onClick={model.discard}>
                  کنار گذاشتن تغییرات
                </Button>
              </div>
            </div>
          )}
          {submitError && (
            <p role="alert" className="basis-full text-body-sm text-status-blocked">
              {submitError}
            </p>
          )}

          {/* Desktop keyboard shortcut hint */}
          <span className="hidden sm:inline-flex items-center gap-1.5 text-micro text-fg-tertiary me-auto">
            <kbd className="rounded border border-secondary bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg-secondary">
              Enter ↵
            </kbd>
            <span>ثبت سریع</span>
          </span>

          <Button variant="secondary" className="max-sm:min-h-11" onClick={close} disabled={saving}>
            انصراف
          </Button>
          <Button className="max-sm:min-h-11" onClick={() => void submit()} loading={saving}>
            {saving
              ? 'در حال ثبت…'
              : fromMessage
                ? 'ایجاد وظیفه از پیام'
                : fromNote
                  ? 'ایجاد وظیفه از یادداشت'
                  : 'ایجاد وظیفه'}
          </Button>
        </>
      }
    >
      <div onKeyDown={handleGlobalKeyDown} className="flex min-w-0 flex-col gap-4">
        <fieldset disabled={saving} aria-busy={saving || undefined} className="flex min-w-0 flex-col gap-4">
          {projects.length === 0 && (
            <div
              role="note"
              className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-secondary bg-sunken p-3 text-body-sm text-fg-secondary"
            >
              <span className="flex-1">
                هنوز پروژه‌ای در این فضای کاری نیست؛ هر وظیفه در یک پروژه ثبت می‌شود.
              </span>
              {onCreateProject && (
                <Button size="sm" variant="secondary" onClick={onCreateProject}>
                  ساخت پروژه
                </Button>
              )}
            </div>
          )}

          {/* Hero Task Title with quick Enter-to-submit */}
          <Input
            ref={titleRef}
            label="عنوان وظیفه"
            maxLength={200}
            required
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            onFocus={() => setTouched(false)}
            onBlur={() => setTouched(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="چه کاری باید انجام شود؟ (مثلاً: بازبینی و بهبود جریان ثبت‌نام)"
            error={titleError}
            data-autofocus
          />

          <TaskProjectField model={model} fixedProjectId={fixedProjectId} columns={columns} />

          {/* Fast Priority Segmented Control */}
          <TaskPrioritySelector model={model} />

          {/* Compact, clean Assignee Selector with "Assign to me" */}
          <TaskAssigneeSelector model={model} currentUserId={currentUserId} />

          {/* Smart Deadline with 1-click presets */}
          <TaskDeadlineField model={model} timeZone={timeZone} />

          {/* Collapsible details for description, subtasks, files & agile settings */}
          <TaskMoreDetails
            hasContent={
              Boolean(form.description.trim()) ||
              form.attachments.length > 0 ||
              model.files.length > 0 ||
              form.subtaskTitles.length > 0 ||
              form.type === 'bug' ||
              form.isBacklog === true
            }
          >
            <Textarea
              label="توضیحات و زمینه وظیفه"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="معیار پذیرش، نیازمندی‌ها یا جزئیات تکمیلی را بنویسید…"
              className="min-h-24"
            />

            <TaskPlanningFields model={model} timeZone={timeZone} />

            {form.subtaskTitles.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-body-sm font-medium text-fg-secondary">
                  زیروظیفه‌ها از چک‌لیست یادداشت
                </span>
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

            <TaskCreateFiles model={model} />
          </TaskMoreDetails>

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
        </fieldset>
      </div>
    </Modal>
  );
}

function TaskMoreDetails({
  children,
  hasContent = false,
}: {
  readonly children: ReactNode;
  readonly hasContent?: boolean;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(hasContent);

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-secondary/50">
      <Button
        variant="ghost"
        fullWidth
        aria-expanded={expanded}
        aria-controls={id}
        iconEnd={expanded ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
        className="min-h-10 max-sm:min-h-11 justify-between text-fg-secondary hover:text-fg-primary text-caption"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>توضیحات، پیوست و جزئیات تکمیلی</span>
        {hasContent && !expanded && (
          <span className="ms-2 rounded-full bg-brand-subtle px-2 py-0.5 text-micro text-fg-brand">
            دارای محتوا
          </span>
        )}
      </Button>
      <div id={id} className={`${expanded ? 'flex' : 'hidden'} min-w-0 flex-col gap-4 pt-1`}>
        {children}
      </div>
    </div>
  );
}

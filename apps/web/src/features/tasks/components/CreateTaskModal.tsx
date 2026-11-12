'use client';

import { directory } from '@/store/directory';
import { formatJalali,fromISODate } from '@taskin/jalali';
import { Avatar,Badge,Button,Checkbox,IconButton,Input,Modal,Textarea } from '@/components/ui';
import {
CloseIcon,
ConvertToTaskIcon,NotebookIcon,SubtaskIcon,
TaskSquareIcon
} from '@/components/icons';
import { type CreateTaskModalProps } from '@/features/tasks/types/create-task';

/**
 * Task composer. Opened blank from the rail, sidebar or board; pre-dated from a calendar
 * cell; or pre-filled from a chat message ("تبدیل به وظیفه") or a note ("تبدیل یادداشت به
 * وظیفه") — in which case the source, attachments and checklist items ride along.
 */
import { useCreateTaskForm } from '@/features/tasks/hooks/useCreateTaskForm';
import { TaskPlanningFields } from '@/features/tasks/components/TaskPlanningFields';
import { TaskCreateFiles } from '@/features/tasks/components/TaskCreateFiles';

export function CreateTaskModal({ open, draft, columns, fixedProjectId, timeZone, onClose, onSubmit, onCreateProject }: CreateTaskModalProps) {
  const model = useCreateTaskForm({ open, draft, columns, fixedProjectId, timeZone, onClose, onSubmit });
  const { form, setForm, setTouched, submitError, saving, titleRef, fromMessage, fromNote, presetDate, titleError, projects, close, submit } = model;

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title={fromMessage ? 'تبدیل پیام به وظیفه' : fromNote ? 'تبدیل یادداشت به وظیفه' : 'تعریف وظیفه جدید'}
      description={
        fromMessage
          ? 'متن و پیوست پیام انتخاب‌شده به‌صورت خودکار در فرم قرار گرفت. جزئیات را تکمیل کنید.'
          : fromNote
            ? 'عنوان و متن یادداشت در فرم قرار گرفت و موارد چک‌لیست به زیروظیفه تبدیل می‌شوند.'
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
          <Button variant="secondary" onClick={close} disabled={saving}>
            انصراف
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            {fromMessage ? 'ایجاد وظیفه از پیام' : fromNote ? 'ایجاد وظیفه از یادداشت' : 'ایجاد وظیفه'}
          </Button>
        </>
      }
    >
      <fieldset disabled={saving} aria-busy={saving || undefined} className="flex min-w-0 flex-col gap-4">
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
          ref={titleRef}
          label="عنوان وظیفه"
          maxLength={200}
          hint="نام کوتاهی برای وظیفه بنویسید."
          required
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          onFocus={() => setTouched(false)}
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

        <TaskPlanningFields model={model} fixedProjectId={fixedProjectId} columns={columns} timeZone={timeZone} />

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

        <TaskCreateFiles model={model} />

        {submitError && <p role="alert" className="rounded-lg border border-error-300 bg-error-50 px-3 py-2 text-body-sm text-status-blocked">{submitError}</p>}

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
    </Modal>
  );
}

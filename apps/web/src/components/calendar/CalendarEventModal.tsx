'use client';

import { useMemo, useState } from 'react';
import type { CalendarEventDraft, CalendarEventKind } from '@taskin/contracts';
import { CALENDAR_EVENT_KINDS } from '@/data/reference';
import { directory } from '@/store/directory';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { formatJalali, toISODate, toPersianDigits } from '@taskin/jalali';
import { Avatar, Button, Checkbox, Input, Modal, SegmentedControl, Select, Textarea } from '@/components/ui';
import { JalaliDatePicker } from '@/components/tasks/JalaliDatePicker';
import { CalendarIcon, ClockIcon, MilestoneIcon, NotificationIcon } from '@/components/icons';

export interface CalendarEventModalProps {
  readonly open: boolean;
  /** Pre-selected day (`YYYY-MM-DD`); today when `null`. */
  readonly initialDate: string | null;
  readonly currentUserId: string;
  readonly onClose: () => void;
  readonly onSubmit: (draft: CalendarEventDraft) => void;
}

const KIND_ICONS: Readonly<Record<CalendarEventKind, typeof CalendarIcon>> = {
  meeting: CalendarIcon,
  reminder: NotificationIcon,
  milestone: MilestoneIcon,
};

/** Half-hour slots across the working day, stored as ASCII `HH:mm`. */
const TIME_SLOTS: readonly string[] = Array.from({ length: 29 }, (_, index) => {
  const minutes = 7 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

const NO_PROJECT = 'none';

interface FormState {
  readonly kind: CalendarEventKind;
  readonly title: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly projectId: string;
  readonly attendeeIds: readonly string[];
  readonly description: string;
}

const blankForm = (date: string, currentUserId: string): FormState => ({
  kind: 'meeting',
  title: '',
  date,
  startTime: '10:00',
  endTime: '11:00',
  projectId: NO_PROJECT,
  attendeeIds: [currentUserId],
  description: '',
});

/**
 * Schedules a meeting, a personal reminder or a project milestone on the Jalali calendar.
 * Only the fields that apply to the chosen kind are shown: milestones are all-day and must
 * belong to a project; reminders have a time but no attendees.
 */
export function CalendarEventModal({ open, initialDate, currentUserId, onClose, onSubmit }: CalendarEventModalProps) {
  const [form, setForm] = useState<FormState>(() => blankForm(toISODate(new Date()), currentUserId));
  const [touched, setTouched] = useState(false);

  useResetOnOpen(
    open,
    () => {
      setForm(blankForm(initialDate ?? toISODate(new Date()), currentUserId));
      setTouched(false);
    },
    initialDate,
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const endSlots = useMemo(() => TIME_SLOTS.filter((slot) => slot > form.startTime), [form.startTime]);

  const titleError = touched && form.title.trim().length === 0 ? 'عنوان رویداد الزامی است.' : undefined;
  const projectError =
    touched && form.kind === 'milestone' && form.projectId === NO_PROJECT
      ? 'نقطه عطف باید به یک پروژه تعلق داشته باشد.'
      : undefined;

  const submit = () => {
    setTouched(true);
    if (form.title.trim().length === 0) return;
    if (form.kind === 'milestone' && form.projectId === NO_PROJECT) return;

    onSubmit({
      kind: form.kind,
      title: form.title.trim(),
      date: form.date,
      startTime: form.kind === 'milestone' ? null : form.startTime,
      endTime: form.kind === 'meeting' ? form.endTime : null,
      projectId: form.projectId === NO_PROJECT ? null : form.projectId,
      attendeeIds: form.kind === 'meeting' ? form.attendeeIds : [currentUserId],
      description: form.description.trim(),
    });
  };

  const slotOptions = (slots: readonly string[]) =>
    slots.map((slot) => ({ value: slot, label: toPersianDigits(slot) }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="رویداد تقویم"
      description={`برای ${formatJalali(form.date, 'long')} یک جلسه، یادآور یا نقطه عطف ثبت کنید.`}
      icon={<CalendarIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit}>ثبت در تقویم</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          ariaLabel="نوع رویداد"
          size="md"
          fullWidth
          value={form.kind}
          onValueChange={(kind) =>
            setForm((current) => ({
              ...current,
              kind,
              // A milestone is a project date by definition; pre-pick the first project so
              // the required field starts valid.
              projectId:
                kind === 'milestone' && current.projectId === NO_PROJECT
                  ? (directory.projects()[0]?.id ?? NO_PROJECT)
                  : current.projectId,
            }))
          }
          options={CALENDAR_EVENT_KINDS.map((entry) => {
            const Icon = KIND_ICONS[entry.id];
            return { value: entry.id, label: entry.label, icon: <Icon size={16} /> };
          })}
        />

        <Input
          label="عنوان"
          value={form.title}
          onChange={(event) => set('title', event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={
            form.kind === 'meeting'
              ? 'مثلاً: بازبینی اسپرینت'
              : form.kind === 'reminder'
                ? 'مثلاً: ارسال گزارش هفتگی'
                : 'مثلاً: تحویل نسخه بتا'
          }
          error={titleError}
          maxLength={80}
          data-autofocus
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-fg-secondary">تاریخ</span>
            <JalaliDatePicker label="انتخاب تاریخ رویداد" value={form.date} onChange={(date) => set('date', date)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Select
              label={form.kind === 'milestone' ? 'پروژه' : 'پروژه (اختیاری)'}
              hideLabel={false}
              value={form.projectId}
              onValueChange={(projectId) => set('projectId', projectId)}
              options={[
                ...(form.kind === 'milestone' ? [] : [{ value: NO_PROJECT, label: 'بدون پروژه' }]),
                ...directory.projects().map((project) => ({
                  value: project.id,
                  label: project.name,
                })),
              ]}
            />
            {projectError && <p className="text-caption text-status-blocked">{projectError}</p>}
          </div>

          {form.kind !== 'milestone' && (
            <Select
              label={form.kind === 'meeting' ? 'ساعت شروع' : 'ساعت یادآوری'}
              hideLabel={false}
              value={form.startTime}
              onValueChange={(startTime) =>
                setForm((current) => ({
                  ...current,
                  startTime,
                  // Keep the meeting at least one slot long when the start moves past the end.
                  endTime:
                    current.endTime > startTime
                      ? current.endTime
                      : (TIME_SLOTS.find((slot) => slot > startTime) ?? current.endTime),
                }))
              }
              options={slotOptions(TIME_SLOTS.slice(0, -1))}
            />
          )}

          {form.kind === 'meeting' && (
            <Select
              label="ساعت پایان"
              hideLabel={false}
              value={form.endTime}
              onValueChange={(endTime) => set('endTime', endTime)}
              options={slotOptions(endSlots)}
            />
          )}
        </div>

        {form.kind === 'meeting' && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 flex items-center gap-1.5 text-body-sm font-medium text-fg-secondary">
              <ClockIcon size={15} className="text-fg-quaternary" />
              شرکت‌کنندگان
            </legend>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {directory.users().map((user) => (
                <label
                  key={user.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-secondary px-2.5 py-2 transition-colors hover:bg-hover has-[[aria-checked=true]]:border-brand"
                >
                  <Checkbox
                    checked={form.attendeeIds.includes(user.id)}
                    size="sm"
                    ariaLabel={user.fullName}
                    onCheckedChange={(next) =>
                      set(
                        'attendeeIds',
                        next
                          ? [...form.attendeeIds, user.id]
                          : form.attendeeIds.filter((id) => id !== user.id),
                      )
                    }
                  />
                  <Avatar name={user.fullName} initials={user.initials} tone={user.avatarTone} size="xs" decorative />
                  <span className="truncate text-caption font-medium text-fg-primary">
                    {user.id === currentUserId ? `${user.fullName} (شما)` : user.fullName}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <Textarea
          label="توضیحات (اختیاری)"
          value={form.description}
          onChange={(event) => set('description', event.target.value)}
          placeholder={form.kind === 'meeting' ? 'دستور جلسه یا لینک تماس…' : 'جزئیات بیشتر…'}
          className="min-h-20"
        />
      </div>
    </Modal>
  );
}

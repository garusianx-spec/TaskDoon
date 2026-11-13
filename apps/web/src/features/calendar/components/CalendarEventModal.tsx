'use client';

import type { CalendarEventDraft, CalendarEventKind } from '@taskin/contracts';
import { CALENDAR_EVENT_KINDS } from '@/data/reference';
import { directory } from '@/store/directory';
import { formatJalali } from '@taskin/jalali';
import { Avatar, Button, Checkbox, Input, Modal, SegmentedControl, Select, Textarea } from '@/components/ui';
import { JalaliDatePicker } from '@/components/shared/JalaliDatePicker';
import { FormError } from '@/components/shared/FormError';
import { CalendarIcon, ClockIcon, MilestoneIcon, NotificationIcon } from '@/components/icons';
import { NO_PROJECT, TIME_SLOTS, useCalendarEventForm } from '@/features/calendar/hooks/useCalendarEventForm';

export interface CalendarEventModalProps {
  readonly open: boolean;
  /** Pre-selected day (`YYYY-MM-DD`); today when `null`. */
  readonly initialDate: string | null;
  readonly currentUserId: string;
  readonly onClose: () => void;
  readonly onSubmit: (draft: CalendarEventDraft, commandId: string) => Promise<void>;
}

const KIND_ICONS: Readonly<Record<CalendarEventKind, typeof CalendarIcon>> = {
  meeting: CalendarIcon,
  reminder: NotificationIcon,
  milestone: MilestoneIcon,
};

/**
 * Schedules a meeting, a personal reminder or a project milestone on the Jalali calendar.
 * Only the fields that apply to the chosen kind are shown: milestones are all-day and must
 * belong to a project; reminders have a time but no attendees.
 */
export function CalendarEventModal({
  open,
  initialDate,
  currentUserId,
  onClose,
  onSubmit,
}: CalendarEventModalProps) {
  const {
    form,
    setForm,
    setTitleTouched,
    titleRef,
    set,
    endSlots,
    titleError,
    projectError,
    timeError,
    submit,
    slotOptions,
    submission,
  } = useCalendarEventForm({ open, initialDate, currentUserId, onSubmit });
  const close = () => {
    if (!submission.isPending()) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title="رویداد تقویم"
      description={`برای ${formatJalali(form.date, 'long')} یک جلسه، یادآور یا نقطه عطف ثبت کنید.`}
      icon={<CalendarIcon size={20} />}
      footer={
        <>
          <FormError message={submission.error} className="basis-full" />
          <Button
            variant="secondary"
            className="max-sm:min-h-11"
            onClick={close}
            disabled={submission.saving}
          >
            انصراف
          </Button>
          <Button className="max-sm:min-h-11" onClick={() => void submit()} loading={submission.saving}>
            {submission.saving ? 'در حال ثبت…' : 'ثبت در تقویم'}
          </Button>
        </>
      }
    >
      <fieldset
        className="flex min-w-0 flex-col gap-4"
        disabled={submission.saving}
        aria-busy={submission.saving || undefined}
      >
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
          ref={titleRef}
          label="عنوان"
          required
          value={form.title}
          onChange={(event) => set('title', event.target.value)}
          onBlur={() => setTitleTouched(true)}
          onFocus={() => setTitleTouched(false)}
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
            <JalaliDatePicker
              label="انتخاب تاریخ رویداد"
              value={form.date}
              onChange={(date) => set('date', date)}
            />
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
            <FormError message={projectError ?? null} className="text-caption" />
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
                  <Avatar
                    name={user.fullName}
                    initials={user.initials}
                    tone={user.avatarTone}
                    size="xs"
                    decorative
                  />
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
          maxLength={2000}
          value={form.description}
          onChange={(event) => set('description', event.target.value)}
          placeholder={form.kind === 'meeting' ? 'دستور جلسه یا لینک تماس…' : 'جزئیات بیشتر…'}
          className="min-h-20"
        />
        <FormError message={timeError ?? null} className="text-caption" />
      </fieldset>
    </Modal>
  );
}

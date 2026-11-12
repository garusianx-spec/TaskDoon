'use client';

import { useMemo, useRef, useState } from 'react';
import type { CalendarEventDraft, CalendarEventKind } from '@taskin/contracts';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { useFormSubmission } from '@/hooks/useFormSubmission';
import { toISODate, toPersianDigits } from '@taskin/jalali';
import type { CalendarEventModalProps } from '@/features/calendar/components/CalendarEventModal';

/** Half-hour slots across the working day, stored as ASCII `HH:mm`. */
export const NO_PROJECT = 'none';
export const TIME_SLOTS: readonly string[] = Array.from({ length: 29 }, (_, index) => {
  const minutes = 7 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

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

export function useCalendarEventForm({
  open,
  initialDate,
  currentUserId,
  onSubmit,
}: Pick<CalendarEventModalProps, 'open' | 'initialDate' | 'currentUserId' | 'onSubmit'>) {
  const [form, setForm] = useState<FormState>(() => blankForm(toISODate(new Date()), currentUserId));
  const [touched, setTouched] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const submission = useFormSubmission();

  useResetOnOpen(
    open,
    () => {
      setForm(blankForm(initialDate ?? toISODate(new Date()), currentUserId));
      setTouched(false);
      setTitleTouched(false);
      submission.reset();
    },
    initialDate,
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const endSlots = useMemo(() => TIME_SLOTS.filter((slot) => slot > form.startTime), [form.startTime]);

  const titleError = (titleTouched || touched) && !form.title.trim() ? 'عنوان رویداد را بنویسید.' : undefined;
  const projectError =
    touched && form.kind === 'milestone' && form.projectId === NO_PROJECT
      ? 'نقطه عطف باید به یک پروژه تعلق داشته باشد.'
      : undefined;

  const invalidTime = form.kind === 'meeting' && form.endTime <= form.startTime;
  const timeError = touched && invalidTime ? 'ساعت پایان باید بعد از ساعت شروع باشد.' : undefined;

  const submit = async () => {
    if (submission.isPending()) return;
    setTouched(true);
    if (!form.title.trim()) {
      titleRef.current?.focus();
      setTitleTouched(true);
      return;
    }
    if (invalidTime || (form.kind === 'milestone' && form.projectId === NO_PROJECT)) return;

    const draft: CalendarEventDraft = {
      kind: form.kind,
      title: form.title.trim(),
      date: form.date,
      startTime: form.kind === 'milestone' ? null : form.startTime,
      endTime: form.kind === 'meeting' ? form.endTime : null,
      projectId: form.projectId === NO_PROJECT ? null : form.projectId,
      attendeeIds: form.kind === 'meeting' ? form.attendeeIds : [currentUserId],
      description: form.description.trim(),
    };
    await submission.submit(
      draft,
      (commandId) => onSubmit(draft, commandId),
      'رویداد ثبت نشد. دوباره تلاش کنید.',
    );
  };

  const slotOptions = (slots: readonly string[]) =>
    slots.map((slot) => ({ value: slot, label: toPersianDigits(slot) }));

  return {
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
  };
}

'use client';

import { useRef, useState } from 'react';
import type { TaskDraft } from '@taskin/contracts';
import { directory } from '@/store/directory';
import { problemMessage } from '@/lib/api-problem';
import { newIdempotencyKey } from '@/lib/api-client';
import { toISODate } from '@taskin/jalali';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { taskDraft } from '@/store/drafts';
import { columnForPlacement, projectColumns } from '@/store/selectors';
import { type CreateTaskModalProps } from '@/features/tasks/types/create-task';

export function useCreateTaskForm({
  open,
  draft,
  columns,
  fixedProjectId,
  timeZone,
  onClose,
  onSubmit,
}: Omit<CreateTaskModalProps, 'onCreateProject'>) {
  const today = (): string => toISODate(new Date(), timeZone);
  const [form, setForm] = useState<TaskDraft>(() => taskDraft());
  const [touched, setTouched] = useState(false);
  const [files, setFiles] = useState<readonly File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const submission = useRef<{ signature: string; files: readonly File[]; commandId: string } | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  // Re-seed whenever the modal opens so a sourced draft replaces the previous form.
  useResetOnOpen(
    open,
    () => {
      const initial = draft ?? taskDraft();
      const projectId = fixedProjectId ?? initial.projectId;
      setForm({
        ...initial,
        projectId,
        boardColumnId: projectId === initial.projectId ? initial.boardColumnId : null,
        startDate: initial.startDate ?? today(),
        dueDate: initial.dueDate ?? today(),
      });
      setTouched(false);
      setFiles([]);
      setFileError(null);
      setSubmitError(null);
      submission.current = null;
    },
    draft,
  );

  const fromMessage = form.sourceMessageId !== null;
  const fromNote = form.sourceNoteId !== null;
  // Each project has its own board: offer the chosen project's columns only.
  const projectId = fixedProjectId ?? form.projectId;
  const boardColumns = projectColumns(columns, projectId);
  const columnValue = columnForPlacement(boardColumns, form)?.id ?? '';
  const presetDate = draft !== null && draft.dueDate !== null && !fromMessage && !fromNote;
  const titleError = !touched
    ? undefined
    : !form.title.trim()
      ? 'عنوان وظیفه الزامی است.'
      : form.title.trim().length > 200
        ? 'عنوان وظیفه باید حداکثر ۲۰۰ نویسه باشد.'
        : undefined;

  const projects = directory.projects();
  const noProject = !projects.some((project) => project.id === projectId);

  const close = () => {
    if (!submitting.current) onClose();
  };

  const pickFiles = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    const empty = picked.some((file) => file.size === 0);
    setFileError(empty ? 'فایل خالی اضافه نشد. نسخه‌ای از فایل را که محتوا دارد انتخاب کنید.' : null);
    setSubmitError(null);
    setFiles((current) => {
      const next = [...current];
      for (const file of picked) {
        if (file.size === 0) continue;
        if (
          !next.some(
            (entry) =>
              entry.name === file.name &&
              entry.size === file.size &&
              entry.lastModified === file.lastModified,
          )
        )
          next.push(file);
      }
      return next;
    });
  };

  const submit = async () => {
    if (submitting.current) return;
    setTouched(true);
    setSubmitError(null);
    if (form.title.trim().length === 0 || form.title.trim().length > 200) {
      titleRef.current?.focus();
      setTouched(true);
      return;
    }
    if (noProject) {
      setSubmitError('برای ثبت وظیفه یک پروژه انتخاب کنید یا ابتدا پروژه بسازید.');
      return;
    }
    const startDate = form.startDate ?? today();
    if (form.dueDate && form.dueDate < startDate) {
      setSubmitError('مهلت انجام باید در روز شروع یا پس از آن باشد. یکی از تاریخ‌ها را اصلاح کنید.');
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      const submitted = {
        ...form,
        projectId,
        title: form.title.trim(),
        startDate,
        dueDate: form.dueDate ?? today(),
      };
      const signature = JSON.stringify(submitted);
      if (submission.current?.signature !== signature || submission.current.files !== files) {
        submission.current = { signature, files, commandId: newIdempotencyKey() };
      }
      await onSubmit(submitted, files, submission.current.commandId);
    } catch (error) {
      setSubmitError(
        problemMessage(
          error,
          'وظیفه ثبت نشد؛ اطلاعات فرم و فایل‌ها حفظ شده‌اند. اتصال را بررسی و دوباره تلاش کنید.',
        ),
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return {
    today,
    form,
    setForm,
    setTouched,
    files,
    setFiles,
    fileError,
    submitError,
    setSubmitError,
    saving,
    titleRef,
    fromMessage,
    fromNote,
    boardColumns,
    columnValue,
    presetDate,
    titleError,
    projects,
    close,
    pickFiles,
    submit,
  };
}

export type CreateTaskForm = ReturnType<typeof useCreateTaskForm>;

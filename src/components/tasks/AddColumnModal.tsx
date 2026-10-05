'use client';

import { useEffect, useState } from 'react';
import type { SemanticTone, TaskStatus } from '@/types';
import { COLUMN_TONES, TASK_STATUSES } from '@/data/reference';
import { cn } from '@/lib/cn';
import { Button, Input, Modal, Select } from '@/components/ui';
import { KanbanIcon } from '@/components/icons';

export interface AddColumnModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreate: (title: string, tone: SemanticTone, mapsTo: TaskStatus) => void;
}

const TONE_SWATCHES: Readonly<Record<SemanticTone, string>> = {
  todo: 'bg-status-todo',
  progress: 'bg-status-progress',
  review: 'bg-status-review',
  done: 'bg-status-done',
  blocked: 'bg-status-blocked',
};

/**
 * Custom column editor.
 *
 * "نگاشت وضعیت" is the load-bearing field: a custom column still has to resolve to one of
 * the four canonical statuses, so reports, the Gantt, smart views and the calendar keep
 * working off a closed union while the board shows whatever columns the team needs.
 */
export function AddColumnModal({ open, onClose, onCreate }: AddColumnModalProps) {
  const [title, setTitle] = useState('');
  const [tone, setTone] = useState<SemanticTone>('review');
  const [mapsTo, setMapsTo] = useState<TaskStatus>('in-progress');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setTone('review');
    setMapsTo('in-progress');
    setTouched(false);
  }, [open]);

  const error = touched && title.trim().length === 0 ? 'عنوان ستون الزامی است.' : undefined;

  const submit = () => {
    setTouched(true);
    const trimmed = title.trim();
    if (!trimmed) return;
    onCreate(trimmed, tone, mapsTo);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="ستون جدید"
      description="ستون تازه‌ای به بورد اضافه کنید و مشخص کنید کارت‌های داخل آن چه وضعیتی می‌گیرند."
      icon={<KanbanIcon size={20} variant="twotone" />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit}>افزودن ستون</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="عنوان ستون"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="مثلاً: در حال بازبینی فنی"
          error={error}
          autoFocus
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-sm font-medium text-fg-secondary">رنگ نشان ستون</legend>
          <div role="radiogroup" aria-label="رنگ نشان ستون" className="flex flex-wrap gap-2">
            {COLUMN_TONES.map((option) => {
              const selected = tone === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTone(option.id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-caption font-medium transition-colors',
                    selected
                      ? 'border-brand bg-brand-subtle text-fg-brand'
                      : 'border-secondary bg-surface text-fg-tertiary hover:bg-hover',
                  )}
                >
                  <span className={cn('size-2.5 rounded-full', TONE_SWATCHES[option.id])} aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Select
          label="نگاشت وضعیت گردش کار"
          hideLabel={false}
          value={mapsTo}
          onValueChange={setMapsTo}
          options={TASK_STATUSES.map((status) => ({
            value: status.id,
            label: status.label,
            description: 'وضعیتی که کارت‌های این ستون می‌گیرند',
          }))}
        />

        <p className="rounded-lg bg-sunken px-3 py-2 text-micro leading-5 text-fg-tertiary">
          گزارش‌ها، نمای گانت و تقویم بر اساس همین وضعیت نگاشت‌شده محاسبه می‌شوند، بنابراین
          ستون‌های سفارشی بدون به‌هم‌ریختن آمار سازمان اضافه می‌شوند.
        </p>
      </div>
    </Modal>
  );
}

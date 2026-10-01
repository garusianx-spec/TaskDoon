'use client';

import { useId } from 'react';
import type { RecurrenceEnd, RecurrenceFrequency, TaskRecurrence } from '@/types';
import { cn } from '@/lib/cn';
import {
  DEFAULT_RECURRENCE,
  RECURRENCE_FREQUENCIES,
  describeRecurrence,
  expandOccurrences,
} from '@/lib/recurrence';
import { formatJalali, toPersianDigits } from '@/lib/jalali';
import { Badge, NumberField, Select, Switch } from '@/components/ui';
import { JalaliDatePicker } from './JalaliDatePicker';
import { RefreshIcon } from '@/components/icons';

export interface RecurrenceEditorProps {
  readonly value: TaskRecurrence | null;
  readonly onChange: (recurrence: TaskRecurrence | null) => void;
  /** Series anchor — the first occurrence, used for the preview. */
  readonly startDate: string;
  readonly className?: string;
}

type EndKind = RecurrenceEnd['kind'];

const END_OPTIONS: ReadonlyArray<{ readonly value: EndKind; readonly label: string }> = [
  { value: 'never', label: 'همیشه تکرار شود' },
  { value: 'on-date', label: 'پایان در تاریخ مشخص شمسی' },
  { value: 'after-count', label: 'پایان بعد از تعداد مشخص' },
];

/**
 * Recurrence rule builder.
 *
 * The preview strip is the point of the component: it expands the first few occurrences
 * through the same engine the board uses, so the interval, the Jalali month clamping and the
 * termination rule are all visible before the task is saved.
 */
export function RecurrenceEditor({ value, onChange, startDate, className }: RecurrenceEditorProps) {
  const groupId = `recurrence-${useId().replace(/:/g, '')}`;
  const enabled = value !== null;

  const setEnd = (kind: EndKind) => {
    if (!value) return;
    if (kind === 'never') onChange({ ...value, end: { kind: 'never' } });
    else if (kind === 'after-count') onChange({ ...value, end: { kind: 'after-count', count: 10 } });
    else {
      // Default the end date a year out so the field never opens on an already-past date.
      const oneYearOut = new Date(startDate);
      oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
      const iso = `${oneYearOut.getFullYear()}-${String(oneYearOut.getMonth() + 1).padStart(2, '0')}-${String(oneYearOut.getDate()).padStart(2, '0')}`;
      onChange({ ...value, end: { kind: 'on-date', date: iso } });
    }
  };

  // A bounded look-ahead: enough to show the shape of the series without expanding it all.
  const preview = value ? expandOccurrences(startDate, value, addYears(startDate, 3)).slice(0, 4) : [];

  return (
    <section className={cn('flex flex-col gap-3 rounded-xl border border-secondary p-3', className)}>
      <div className="flex items-start gap-3">
        <Switch
          checked={enabled}
          onCheckedChange={(next) => onChange(next ? DEFAULT_RECURRENCE : null)}
          labelledBy={`${groupId}-title`}
          describedBy={`${groupId}-desc`}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={`${groupId}-title`} className="flex items-center gap-1.5 text-body-sm font-semibold text-fg-primary">
            <RefreshIcon size={15} className="text-fg-tertiary" />
            وظیفه تکرارشونده
          </span>
          <span id={`${groupId}-desc`} className="text-micro leading-5 text-fg-tertiary">
            این وظیفه در بازه‌های مشخص به‌صورت خودکار تکرار می‌شود.
          </span>
        </div>
      </div>

      {enabled && value && (
        <>
          <div className="grid grid-cols-[1fr_8.5rem] gap-2">
            <Select
              label="دوره تکرار"
              hideLabel={false}
              size="sm"
              value={value.frequency}
              onValueChange={(frequency: RecurrenceFrequency) => onChange({ ...value, frequency })}
              options={RECURRENCE_FREQUENCIES.map((entry) => ({
                value: entry.id,
                label: entry.label,
              }))}
            />
            <NumberField
              label={`هر چند ${
                RECURRENCE_FREQUENCIES.find((entry) => entry.id === value.frequency)?.unit ?? ''
              }`}
              min={1}
              max={99}
              value={value.interval}
              onChange={(interval) => onChange({ ...value, interval })}
            />
          </div>

          <Select
            label="قانون پایان"
            hideLabel={false}
            size="sm"
            value={value.end.kind}
            onValueChange={setEnd}
            options={END_OPTIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
          />

          {value.end.kind === 'on-date' && (
            <div className="flex flex-col gap-1.5">
              <span className="text-body-sm font-medium text-fg-secondary">تاریخ پایان</span>
              <JalaliDatePicker
                label="انتخاب تاریخ پایان تکرار"
                value={value.end.date}
                onChange={(date) => onChange({ ...value, end: { kind: 'on-date', date } })}
              />
            </div>
          )}

          {value.end.kind === 'after-count' && (
            <NumberField
              label="تعداد دفعات اجرا"
              min={1}
              max={365}
              value={value.end.count}
              onChange={(count) => onChange({ ...value, end: { kind: 'after-count', count } })}
            />
          )}

          <div className="flex flex-col gap-1.5 rounded-lg bg-sunken p-2.5">
            <Badge tone="brand" size="md" iconStart={<RefreshIcon size={12} />}>
              {describeRecurrence(value)}
            </Badge>
            <span className="text-micro text-fg-tertiary">اجراهای بعدی:</span>
            <ul className="flex flex-wrap gap-1.5">
              {preview.map((iso) => (
                <li
                  key={iso}
                  className="numeric rounded-md border border-secondary bg-surface px-1.5 py-0.5 text-micro text-fg-secondary"
                >
                  {formatJalali(iso, 'day-month')}
                </li>
              ))}
              {value.end.kind === 'never' && (
                <li className="text-micro text-fg-quaternary">…</li>
              )}
              {value.end.kind === 'after-count' && (
                <li className="text-micro text-fg-quaternary">
                  {`مجموع ${toPersianDigits(value.end.count)} بار`}
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

function addYears(iso: string, years: number): string {
  const date = new Date(iso);
  date.setFullYear(date.getFullYear() + years);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

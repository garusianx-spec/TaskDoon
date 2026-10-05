'use client';

import { useId } from 'react';
import type { ReminderOffsetId, TaskReminder } from '@/types';
import { cn } from '@/lib/cn';
import { REMINDER_OFFSETS, describeReminderFull, toLocalDateTimeValue } from '@/lib/reminder';
import { formatJalali } from '@/lib/jalali';
import { Badge, Switch } from '@/components/ui';
import { NotificationIcon } from '@/components/icons';

export interface ReminderPickerProps {
  readonly value: TaskReminder | null;
  readonly onChange: (reminder: TaskReminder | null) => void;
  /** Used to resolve preset offsets into a concrete instant for the summary line. */
  readonly dueDate: string;
  readonly className?: string;
}

/**
 * Reminder configuration.
 *
 * The master switch turns the reminder on and off; the offsets are a radio group, since
 * exactly one trigger applies. Choosing "زمان دلخواه شمسی" reveals a `datetime-local` input
 * whose resolved value is echoed back as a Jalali sentence, so the user never has to read
 * the Gregorian value the native control displays.
 */
export function ReminderPicker({ value, onChange, dueDate, className }: ReminderPickerProps) {
  const groupId = `reminder-${useId().replace(/:/g, '')}`;
  const enabled = value !== null;
  const active: ReminderOffsetId | null = value?.offset ?? null;

  return (
    <section className={cn('flex flex-col gap-3 rounded-xl border border-secondary p-3', className)}>
      <div className="flex items-start gap-3">
        <Switch
          checked={enabled}
          onCheckedChange={(next) => onChange(next ? { offset: '1d', customAt: null } : null)}
          labelledBy={`${groupId}-title`}
          describedBy={`${groupId}-desc`}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={`${groupId}-title`} className="flex items-center gap-1.5 text-body-sm font-semibold text-fg-primary">
            <NotificationIcon size={15} variant="twotone" className="text-fg-tertiary" />
            زمان یادآوری
          </span>
          <span id={`${groupId}-desc`} className="text-micro leading-5 text-fg-tertiary">
            پیش از رسیدن مهلت انجام، اعلان دریافت کنید.
          </span>
        </div>
      </div>

      {enabled && value && (
        <>
          <div
            role="radiogroup"
            aria-labelledby={`${groupId}-title`}
            className="flex flex-wrap gap-1.5"
          >
            {REMINDER_OFFSETS.map((option) => {
              const selected = active === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() =>
                    onChange({
                      offset: option.id,
                      customAt:
                        option.id === 'custom'
                          ? (value.customAt ?? new Date(`${dueDate}T09:00:00`).toISOString())
                          : null,
                    })
                  }
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-caption font-medium transition-colors',
                    selected
                      ? 'border-brand bg-brand-subtle text-fg-brand'
                      : 'border-secondary bg-surface text-fg-tertiary hover:bg-hover hover:text-fg-secondary',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {value.offset === 'custom' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-caption font-medium text-fg-tertiary">تاریخ و ساعت دلخواه</span>
              <input
                type="datetime-local"
                value={value.customAt ? toLocalDateTimeValue(value.customAt) : ''}
                onChange={(event) => {
                  const raw = event.target.value;
                  onChange({
                    offset: 'custom',
                    customAt: raw ? new Date(raw).toISOString() : null,
                  });
                }}
                className={cn(
                  'h-10 w-full rounded-lg border border-primary bg-surface px-3 text-body-sm text-fg-primary shadow-xs',
                  'focus-visible:border-brand',
                )}
              />
              {value.customAt && (
                <span className="numeric text-micro text-fg-tertiary">
                  {`معادل شمسی: ${formatJalali(value.customAt, 'full')}`}
                </span>
              )}
            </label>
          )}

          <Badge tone="brand" size="md" numeric iconStart={<NotificationIcon size={12} />}>
            {describeReminderFull(dueDate, value)}
          </Badge>
        </>
      )}
    </section>
  );
}

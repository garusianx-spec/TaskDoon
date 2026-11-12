'use client';

import { useId, useMemo, useState } from 'react';
import { formatJalali, toISODate, toPersianDigits } from '@taskin/jalali';
import { truncate } from '@/lib/format';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { useFormSubmission } from '@/hooks/useFormSubmission';
import { FormError } from '@/components/shared/FormError';
import { Button, Input, Modal } from '@/components/ui';
import { ClockIcon } from '@/components/icons';
import { JalaliDatePicker } from '@/components/shared/JalaliDatePicker';

/** The API sends nothing sooner than this, nor later than a year. */
const MIN_LEAD_MS = 60_000;
const MAX_AHEAD_MS = 365 * 24 * 3600 * 1000;

const hhmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** A local wall-clock `date` + `time` as an instant (this device's zone, like the rest of the UI). */
function instantOf(date: string, time: string): Date | null {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if ([year, month, day, hour, minute].some((part) => part === undefined || Number.isNaN(part))) return null;
  return new Date(year as number, (month as number) - 1, day as number, hour as number, minute as number);
}

/** An hour from now, on the next five minutes. */
function defaultSlot(now: Date): Date {
  const at = new Date(now.getTime() + 3600_000);
  at.setMinutes(Math.ceil(at.getMinutes() / 5) * 5, 0, 0);
  return at;
}

function validateSlot(at: Date | null, now: number): string | null {
  if (!at) return 'تاریخ و ساعت ارسال را کامل کنید.';
  const lead = at.getTime() - now;
  if (lead < MIN_LEAD_MS) return 'زمان ارسال باید دست‌کم یک دقیقه بعد از اکنون باشد.';
  if (lead > MAX_AHEAD_MS) return 'زمان ارسال حداکثر تا یک سال بعد است.';
  return null;
}

interface Preset {
  readonly label: string;
  readonly at: Date;
}

function presets(now: Date): readonly Preset[] {
  const tonight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  return [
    { label: 'یک ساعت دیگر', at: defaultSlot(now) },
    ...(tonight.getTime() - now.getTime() > MIN_LEAD_MS
      ? [{ label: `امشب ساعت ${toPersianDigits('21:00')}`, at: tonight }]
      : []),
    { label: `فردا ساعت ${toPersianDigits('09:00')}`, at: tomorrow },
  ];
}

/**
 * «زمان‌بندی ارسال»: when the drafted message should go out. A Jalali date, a time, and a few
 * shortcuts; the message waits on the server (or, in the demo, in this tab) until then.
 */
export function ScheduleMessageDialog({
  open,
  text,
  onClose,
  onConfirm,
}: {
  readonly open: boolean;
  /** The drafted message, shown so it is clear what is being scheduled. */
  readonly text: string;
  readonly onClose: () => void;
  readonly onConfirm: (at: Date, commandId: string) => Promise<void>;
}) {
  const [date, setDate] = useState(() => toISODate(defaultSlot(new Date())));
  const [time, setTime] = useState(() => hhmm(defaultSlot(new Date())));
  const [touched, setTouched] = useState(false);
  const [openedAt, setOpenedAt] = useState(() => new Date());
  const [checkedAt, setCheckedAt] = useState(0);
  const errorId = useId();
  const submission = useFormSubmission();

  useResetOnOpen(open, () => {
    const now = new Date();
    const slot = defaultSlot(now);
    setDate(toISODate(slot));
    setTime(hhmm(slot));
    setTouched(false);
    setOpenedAt(now);
    setCheckedAt(now.getTime());
    submission.reset();
  });

  const at = useMemo(() => instantOf(date, time), [date, time]);
  const shortcuts = useMemo(() => presets(openedAt), [openedAt]);
  const error = validateSlot(at, checkedAt);
  const visibleError = touched ? error : null;

  const close = () => {
    if (!submission.isPending()) onClose();
  };
  const submit = async () => {
    if (submission.isPending()) return;
    const now = Date.now();
    setCheckedAt(now);
    setTouched(true);
    if (!at || validateSlot(at, now)) return;
    await submission.submit(
      { text, scheduledAt: at.toISOString() },
      (commandId) => onConfirm(at, commandId),
      'پیام زمان‌بندی نشد. دوباره تلاش کنید.',
    );
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title="زمان‌بندی ارسال پیام"
      description={truncate(text, 120)}
      icon={<ClockIcon size={20} />}
      footer={
        <>
          <FormError message={submission.error} className="basis-full" />
          <Button variant="secondary" onClick={close} disabled={submission.saving}>
            انصراف
          </Button>
          <Button onClick={() => void submit()} loading={submission.saving}>
            {submission.saving ? 'در حال ثبت…' : 'زمان‌بندی ارسال'}
          </Button>
        </>
      }
    >
      <fieldset
        className="flex min-w-0 flex-col gap-4"
        disabled={submission.saving}
        aria-busy={submission.saving || undefined}
      >
        <div role="group" aria-label="زمان‌های پیشنهادی" className="flex flex-wrap gap-2">
          {shortcuts.map((preset) => (
            <Button
              key={preset.label}
              size="sm"
              variant="secondary"
              onClick={() => {
                setDate(toISODate(preset.at));
                setTime(hhmm(preset.at));
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-fg-secondary">تاریخ ارسال</span>
            <JalaliDatePicker label="انتخاب تاریخ ارسال" value={date} onChange={setDate} />
          </div>
          <Input
            label="ساعت ارسال"
            type="time"
            dir="ltr"
            step={60}
            value={time}
            required
            aria-invalid={visibleError ? true : undefined}
            aria-describedby={visibleError ? errorId : undefined}
            onBlur={() => {
              setCheckedAt(Date.now());
              setTouched(true);
            }}
            onFocus={() => setTouched(false)}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>
        {visibleError && (
          <p id={errorId} role="alert" className="text-caption text-status-blocked">
            {visibleError}
          </p>
        )}
        {at && !error && (
          <p className="text-body-sm text-fg-secondary" aria-live="polite">
            {`ارسال در ${formatJalali(at, 'full')}`}
          </p>
        )}
      </fieldset>
    </Modal>
  );
}

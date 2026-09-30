'use client';

import { useMemo, useState } from 'react';
import { formatJalali, toISODate, toPersianDigits } from '@taskin/jalali';
import { truncate } from '@/lib/format';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { Button, Input, Modal } from '@/components/ui';
import { ClockIcon } from '@/components/icons';
import { JalaliDatePicker } from '@/components/tasks/JalaliDatePicker';

/** The API sends nothing sooner than this, nor later than a year. */
const MIN_LEAD_MS = 60_000;
const MAX_AHEAD_MS = 365 * 24 * 3600 * 1000;

const hhmm = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

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

interface Preset {
  readonly label: string;
  readonly at: Date;
}

function presets(now: Date): readonly Preset[] {
  const tonight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  return [
    { label: 'یک ساعت دیگر', at: defaultSlot(now) },
    ...(tonight.getTime() - now.getTime() > MIN_LEAD_MS ? [{ label: `امشب ساعت ${toPersianDigits('21:00')}`, at: tonight }] : []),
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
  readonly onConfirm: (at: Date) => void;
}) {
  const [date, setDate] = useState(() => toISODate(defaultSlot(new Date())));
  const [time, setTime] = useState(() => hhmm(defaultSlot(new Date())));
  const [touched, setTouched] = useState(false);
  const [openedAt, setOpenedAt] = useState(() => new Date());

  useResetOnOpen(open, () => {
    const now = new Date();
    const slot = defaultSlot(now);
    setDate(toISODate(slot));
    setTime(hhmm(slot));
    setTouched(false);
    setOpenedAt(now);
  });

  const at = useMemo(() => instantOf(date, time), [date, time]);
  const shortcuts = useMemo(() => presets(openedAt), [openedAt]);
  const lead = at ? at.getTime() - Date.now() : Number.NaN;
  const error = !at
    ? 'تاریخ و ساعت ارسال را کامل کنید.'
    : lead < MIN_LEAD_MS
      ? 'زمان ارسال باید دست‌کم یک دقیقه بعد از اکنون باشد.'
      : lead > MAX_AHEAD_MS
        ? 'زمان ارسال حداکثر تا یک سال بعد است.'
        : null;

  const submit = () => {
    setTouched(true);
    if (error || !at) return;
    onConfirm(at);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="زمان‌بندی ارسال پیام"
      description={truncate(text, 120)}
      icon={<ClockIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit}>زمان‌بندی ارسال</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
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
          <Input label="ساعت ارسال" type="time" dir="ltr" step={60} value={time} onChange={(event) => setTime(event.target.value)} />
        </div>
        {at && !error && (
          <p className="text-body-sm text-fg-secondary" aria-live="polite">
            {`ارسال در ${formatJalali(at, 'full')}`}
          </p>
        )}
        {touched && error && (
          <p role="alert" className="text-caption text-status-blocked">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

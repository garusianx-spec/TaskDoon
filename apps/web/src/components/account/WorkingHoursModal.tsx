'use client';

import { useState } from 'react';
import type { WorkDay, WorkingHours } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { cn } from '@/lib/cn';
import { isWorkingTime, WORK_DAYS } from '@/lib/working-hours';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { Button, Input, Modal, SwitchField, Textarea } from '@/components/ui';
import { ClockIcon } from '@/components/icons';

const HH_MM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const MESSAGE_MAX = 500;

/**
 * «ساعات کاری و پاسخ خودکار» (Phase 3.2): the member's working days and hours in this workspace,
 * and the out-of-office answer a direct message gets outside them — once a day per person, never
 * in groups, channels or project channels.
 */
export function WorkingHoursModal({
  open,
  hours,
  onClose,
  onSave,
}: {
  readonly open: boolean;
  readonly hours: WorkingHours;
  readonly onClose: () => void;
  readonly onSave: (hours: WorkingHours) => void;
}) {
  const [form, setForm] = useState<WorkingHours>(hours);
  const [touched, setTouched] = useState(false);
  useResetOnOpen(open, () => {
    setForm(hours);
    setTouched(false);
  });

  const message = form.message.trim();
  const error = !HH_MM.test(form.start) || !HH_MM.test(form.end)
    ? 'ساعت شروع و پایان را کامل کنید.'
    : form.start === form.end
      ? 'ساعت پایان باید با ساعت شروع فرق کند.'
      : message.length === 0
        ? 'متن پاسخ خودکار را بنویسید.'
        : null;
  const toggleDay = (day: WorkDay) =>
    setForm((current) => ({
      ...current,
      days: current.days.includes(day) ? current.days.filter((entry) => entry !== day) : WORK_DAYS.map((entry) => entry.id).filter((id) => id === day || current.days.includes(id)),
    }));
  const workingNow = !error && isWorkingTime(form, new Date());

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="ساعات کاری و پاسخ خودکار"
      description="بیرون از این ساعت‌ها، پیام‌های مستقیم با متن شما پاسخ داده می‌شوند؛ به هر نفر حداکثر یک بار در ۲۴ ساعت."
      icon={<ClockIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button
            onClick={() => {
              setTouched(true);
              if (error) return;
              onSave({ ...form, message });
            }}
          >
            ذخیره
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <SwitchField
          title="پاسخ خودکار خارج از ساعت کاری"
          description="فقط گفتگوهای مستقیم؛ گروه‌ها، کانال‌ها و کانال‌های پروژه پاسخ خودکار نمی‌گیرند."
          checked={form.autoReplyEnabled}
          onCheckedChange={(autoReplyEnabled) => setForm((current) => ({ ...current, autoReplyEnabled }))}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-body-sm font-medium text-fg-secondary">روزهای کاری</legend>
          <div className="flex flex-wrap gap-2">
            {WORK_DAYS.map((day) => {
              const on = form.days.includes(day.id);
              return (
                <button
                  key={day.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-body-sm transition-colors',
                    on ? 'border-brand bg-brand-subtle font-semibold text-fg-brand' : 'border-primary bg-surface text-fg-secondary hover:bg-hover',
                  )}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          {form.days.length === 0 && <p className="text-caption text-fg-tertiary">بدون روز کاری: تمام هفته در دسترس نیستید (مثلاً در مرخصی).</p>}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Input label="شروع ساعت کاری" type="time" dir="ltr" step={60} value={form.start} onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))} />
          <Input
            label="پایان ساعت کاری"
            type="time"
            dir="ltr"
            step={60}
            value={form.end}
            hint={form.end < form.start ? 'تا بامداد روز بعد' : undefined}
            onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))}
          />
        </div>

        <Textarea
          label="متن پاسخ خودکار"
          rows={3}
          maxLength={MESSAGE_MAX}
          value={form.message}
          hint={`${toPersianDigits(form.message.length)} از ${toPersianDigits(MESSAGE_MAX)} نویسه`}
          onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
        />

        {!error && (
          <p role="status" className="rounded-lg bg-sunken px-3 py-2 text-body-sm text-fg-secondary">
            {workingNow
              ? 'هم‌اکنون در ساعت کاری هستید.'
              : form.autoReplyEnabled
                ? 'هم‌اکنون خارج از ساعت کاری هستید؛ پیام‌های مستقیم پاسخ خودکار می‌گیرند.'
                : 'هم‌اکنون خارج از ساعت کاری هستید؛ پاسخ خودکار خاموش است.'}
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

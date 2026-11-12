'use client';

import { useId, useState } from 'react';
import type { WorkDay, WorkingHours } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { cn } from '@/lib/utils';
import { isWorkingTime, WORK_DAYS } from '@/lib/working-hours';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { useFormSubmission } from '@/hooks/useFormSubmission';
import { FormError } from '@/components/shared/FormError';
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
  readonly onSave: (hours: WorkingHours) => Promise<void>;
}) {
  const [form, setForm] = useState<WorkingHours>(hours);
  const [touched, setTouched] = useState({ start: false, end: false, message: false });
  const endErrorId = useId();
  const submission = useFormSubmission();
  useResetOnOpen(open, () => {
    setForm(hours);
    setTouched({ start: false, end: false, message: false });
    submission.reset();
  });

  const message = form.message.trim();
  const startError = HH_MM.test(form.start) ? undefined : 'ساعت شروع را وارد کنید.';
  const endError = !HH_MM.test(form.end)
    ? 'ساعت پایان را وارد کنید.'
    : form.start === form.end
      ? 'ساعت پایان باید با ساعت شروع فرق کند.'
      : undefined;
  const messageError = message ? undefined : 'متن پاسخ خودکار را بنویسید.';
  const valid = !startError && !endError && !messageError;
  const toggleDay = (day: WorkDay) =>
    setForm((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((entry) => entry !== day)
        : WORK_DAYS.map((entry) => entry.id).filter((id) => id === day || current.days.includes(id)),
    }));
  const workingNow = valid && isWorkingTime(form, new Date());
  const close = () => {
    if (!submission.isPending()) onClose();
  };
  const submit = async () => {
    if (submission.isPending()) return;
    setTouched({ start: true, end: true, message: true });
    if (!valid) return;
    const value = { ...form, message };
    await submission.submit(value, () => onSave(value), 'ساعات کاری ذخیره نشد. دوباره تلاش کنید.');
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title="ساعات کاری و پاسخ خودکار"
      description="بیرون از این ساعت‌ها، پیام‌های مستقیم با متن شما پاسخ داده می‌شوند؛ به هر نفر حداکثر یک بار در ۲۴ ساعت."
      icon={<ClockIcon size={20} />}
      footer={
        <>
          <FormError message={submission.error} className="basis-full" />
          <Button variant="secondary" onClick={close} disabled={submission.saving}>
            انصراف
          </Button>
          <Button onClick={() => void submit()} loading={submission.saving}>
            {submission.saving ? 'در حال ذخیره…' : 'ذخیره'}
          </Button>
        </>
      }
    >
      <fieldset
        className="flex min-w-0 flex-col gap-5"
        disabled={submission.saving}
        aria-busy={submission.saving || undefined}
      >
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
                    on
                      ? 'border-brand bg-brand-subtle font-semibold text-fg-brand'
                      : 'border-primary bg-surface text-fg-secondary hover:bg-hover',
                  )}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          {form.days.length === 0 && (
            <p className="text-caption text-fg-tertiary">
              بدون روز کاری: تمام هفته در دسترس نیستید (مثلاً در مرخصی).
            </p>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="شروع ساعت کاری"
            type="time"
            dir="ltr"
            step={60}
            value={form.start}
            required
            error={touched.start ? startError : undefined}
            onBlur={() => setTouched((current) => ({ ...current, start: true }))}
            onFocus={() => setTouched((current) => ({ ...current, start: false }))}
            onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))}
          />
          <Input
            label="پایان ساعت کاری"
            type="time"
            dir="ltr"
            step={60}
            value={form.end}
            required
            aria-invalid={touched.end && endError ? true : undefined}
            aria-describedby={touched.end && endError ? endErrorId : undefined}
            onBlur={() => setTouched((current) => ({ ...current, end: true }))}
            onFocus={() => setTouched((current) => ({ ...current, end: false }))}
            hint={form.end < form.start && !(touched.end && endError) ? 'تا بامداد روز بعد' : undefined}
            onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))}
          />
          {touched.end && endError && (
            <p id={endErrorId} role="alert" className="col-start-2 text-caption text-status-blocked">
              {endError}
            </p>
          )}
        </div>

        <Textarea
          label="متن پاسخ خودکار"
          rows={3}
          maxLength={MESSAGE_MAX}
          value={form.message}
          required
          error={touched.message ? messageError : undefined}
          onBlur={() => setTouched((current) => ({ ...current, message: true }))}
          onFocus={() => setTouched((current) => ({ ...current, message: false }))}
          hint={`${toPersianDigits(form.message.length)} از ${toPersianDigits(MESSAGE_MAX)} نویسه`}
          onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
        />

        {valid && (
          <p role="status" className="rounded-lg bg-sunken px-3 py-2 text-body-sm text-fg-secondary">
            {workingNow
              ? 'هم‌اکنون در ساعت کاری هستید.'
              : form.autoReplyEnabled
                ? 'هم‌اکنون خارج از ساعت کاری هستید؛ پیام‌های مستقیم پاسخ خودکار می‌گیرند.'
                : 'هم‌اکنون خارج از ساعت کاری هستید؛ پاسخ خودکار خاموش است.'}
          </p>
        )}
      </fieldset>
    </Modal>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { formatDuration, MAX_WORKLOG_MINUTES, parseDuration } from '@/lib/duration';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { TimerIcon } from '@/components/icons';

export interface WorklogDialogProps {
  readonly open: boolean;
  readonly taskTitle: string;
  readonly onClose: () => void;
  readonly onSubmit: (minutes: number, note: string) => void;
}

/**
 * «ثبت زمان»: how long, as people say it («1h 30m», «۹۰», «۱:۳۰»), and what was done. Opens over
 * the task dialog; Escape closes this one only.
 */
export function WorklogDialog({ open, taskTitle, onClose, onSubmit }: WorklogDialogProps) {
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDuration('');
    setNote('');
    setTouched(false);
    // Both dialogs close on Escape at the document; taking it first keeps the task dialog open.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  const minutes = parseDuration(duration);
  const tooLong = minutes !== null && minutes > MAX_WORKLOG_MINUTES;
  const error =
    touched && duration.trim() !== '' && (minutes === null || tooLong)
      ? tooLong
        ? 'هر ثبت حداکثر ۲۴ ساعت است؛ روزهای دیگر را جدا ثبت کنید.'
        : 'مدت را مثلاً «1h 30m»، «۹۰» یا «۱:۳۰» بنویسید.'
      : undefined;

  const submit = () => {
    setTouched(true);
    if (minutes === null || tooLong) return;
    onSubmit(minutes, note);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="ثبت زمان کار"
      description={`زمانی که روی «${taskTitle}» کار کرده‌اید.`}
      icon={<TimerIcon size={20} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={submit} disabled={minutes === null || tooLong}>
            ثبت
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Input
          label="مدت کار"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="مثلاً 1h 30m یا ۹۰"
          hint={minutes !== null && !tooLong ? `= ${formatDuration(minutes)}` : 'ساعت و دقیقه (1h 30m)، فقط دقیقه (۹۰) یا ۱:۳۰'}
          error={error}
          inputMode="text"
          data-autofocus
        />
        <Textarea
          label="یادداشت کار"
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 500))}
          placeholder="چه کاری انجام شد؟ (اختیاری)"
          className="min-h-20"
        />
      </form>
    </Modal>
  );
}

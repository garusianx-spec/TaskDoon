'use client';

import { useRef, useState, type FormEvent } from 'react';
import type { BroadcastLevel, CreateBroadcastBody, SystemBroadcastView, UpdateBroadcastBody } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { adminApi } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { problemMessage } from '@/api/messages';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { BroadcastStrip, BROADCAST_LEVEL_LABELS } from '@/components/layout/BroadcastStrip';

/** A datetime-local uses the operator's local time, converted to UTC only on save. */
function localDateTime(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}
type Field = 'message' | 'startsAt' | 'expiresAt';
type Errors = Partial<Record<Field, string>>;

export function BroadcastDialog({ broadcast, onClose, onDone }: {
  readonly broadcast: SystemBroadcastView | null;
  readonly onClose: () => void;
  readonly onDone: (result: SystemBroadcastView) => void;
}) {
  const { call } = useAdmin();
  const [message, setMessage] = useState(broadcast?.message ?? '');
  const [level, setLevel] = useState<BroadcastLevel>(broadcast?.level ?? 'info');
  const [isActive, setIsActive] = useState(broadcast?.isActive ?? true);
  const originalStart = broadcast ? localDateTime(broadcast.startsAt) : '';
  const originalExpiry = broadcast?.expiresAt ? localDateTime(broadcast.expiresAt) : '';
  const [startsAt, setStartsAt] = useState(originalStart);
  const [expiresAt, setExpiresAt] = useState(originalExpiry);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);

  const validation = (): Errors => {
    const next: Errors = {};
    if (message.trim().length < 1 || message.trim().length > 500) next.message = 'متن اطلاعیه را بین ۱ تا ۵۰۰ نویسه بنویسید.';
    if ((broadcast && !startsAt) || (startsAt && !Number.isFinite(Date.parse(startsAt)))) next.startsAt = 'زمان شروع معتبری انتخاب کنید.';
    if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= (startsAt ? Date.parse(startsAt) : Date.now()))) {
      next.expiresAt = 'زمان پایان را بعد از زمان شروع انتخاب کنید.';
    }
    return next;
  };
  const clear = (field: Field) => setErrors((current) => ({ ...current, [field]: undefined }));
  const blur = (field: Field) => setErrors((current) => ({ ...current, [field]: validation()[field] }));
  const close = () => { if (!busy) onClose(); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const next = validation();
    if (next.message || next.startsAt || next.expiresAt) {
      (next.message ? messageRef : next.startsAt ? startRef : expiryRef).current?.focus();
      setErrors(next);
      return;
    }
    setErrors(next);
    setBusy(true);
    setFailure(null);
    try {
      let result: SystemBroadcastView;
      if (broadcast) {
        // Preserve exact server timestamps when a time field was left untouched.
        const body: UpdateBroadcastBody = {
          ...(message.trim() !== broadcast.message ? { message: message.trim() } : {}),
          ...(level !== broadcast.level ? { level } : {}),
          ...(isActive !== broadcast.isActive ? { isActive } : {}),
          ...(startsAt !== originalStart ? { startsAt: new Date(startsAt).toISOString() } : {}),
          ...(expiresAt !== originalExpiry ? { expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null } : {}),
        };
        if (Object.keys(body).length === 0) { onClose(); return; }
        result = await call(() => adminApi.updateBroadcast(broadcast.id, body));
      } else {
        const body: CreateBroadcastBody = {
          message: message.trim(), level, isActive,
          ...(startsAt ? { startsAt: new Date(startsAt).toISOString() } : {}),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        };
        result = await call(() => adminApi.createBroadcast(body));
      }
      onDone(result);
    } catch (error) {
      setFailure(problemMessage(error, 'ذخیره اطلاعیه ممکن نشد. دوباره تلاش کنید.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={close} title={broadcast ? 'ویرایش اطلاعیه' : 'ساخت اطلاعیه'} size="lg" description="اطلاعیه در زمان تعیین‌شده برای همه کاربران پلتفرم نمایش داده می‌شود.">
      <form noValidate onSubmit={(event) => void save(event)} className="flex flex-col gap-5 text-sm leading-relaxed">
        <div>
          <Textarea ref={messageRef} label="متن اطلاعیه" value={message} required rows={4} maxLength={500}
            className="text-sm" hint={`${toPersianDigits(message.length)} از ۵۰۰ نویسه`}
            aria-invalid={errors.message ? true : undefined} aria-describedby={errors.message ? 'broadcast-message-error' : undefined}
            onBlur={() => blur('message')} onFocus={() => clear('message')} onChange={(event) => { setMessage(event.target.value); clear('message'); }} data-autofocus />
          {errors.message && <p id="broadcast-message-error" role="alert" className="mt-1 text-sm text-status-blocked">{errors.message}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select<BroadcastLevel> label="اهمیت اطلاعیه" hideLabel={false} value={level} onValueChange={setLevel}
            options={(['info', 'warning', 'critical'] as const).map((value) => ({ value, label: BROADCAST_LEVEL_LABELS[value] }))} />
          <label className="flex min-h-11 items-center gap-3 self-end text-sm text-fg-secondary">
            <input type="checkbox" className="size-5 accent-brand-600" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            فعال‌بودن اطلاعیه
          </label>
          <Input ref={startRef} label={`زمان شروع${broadcast ? '' : ' (اختیاری)'}`} type="datetime-local" step="1" dir="ltr" value={startsAt} className="min-h-11 text-sm"
            hint={broadcast ? 'به وقت محلی دستگاه شما' : 'خالی: نمایش از زمان ذخیره، به وقت محلی دستگاه شما'}
            {...(errors.startsAt ? { error: errors.startsAt } : {})}
            onBlur={() => blur('startsAt')} onFocus={() => clear('startsAt')} onChange={(event) => { setStartsAt(event.target.value); clear('startsAt'); }} />
          <Input ref={expiryRef} label="زمان پایان (اختیاری)" type="datetime-local" step="1" dir="ltr" value={expiresAt} className="min-h-11 text-sm"
            hint="خالی: بدون زمان پایان، به وقت محلی دستگاه شما" {...(errors.expiresAt ? { error: errors.expiresAt } : {})}
            onBlur={() => blur('expiresAt')} onFocus={() => clear('expiresAt')} onChange={(event) => { setExpiresAt(event.target.value); clear('expiresAt'); }} />
        </div>
        <section aria-label="پیش‌نمایش اطلاعیه" className="overflow-hidden rounded-lg border border-secondary">
          <h3 className="border-b border-secondary bg-sunken px-4 py-2 text-sm font-medium text-fg-secondary">پیش‌نمایش اطلاعیه</h3>
          <BroadcastStrip preview level={level} message={message.trim() || 'متن اطلاعیه اینجا نمایش داده می‌شود.'} />
        </section>
        {failure && <p role="alert" className="rounded-lg bg-status-blocked-subtle p-3 text-sm text-status-blocked">{failure}</p>}
        <div className="flex flex-wrap justify-end gap-3 border-t border-secondary pt-4">
          <Button variant="secondary" className="min-h-11 text-sm" onClick={close}>انصراف</Button>
          <Button type="submit" className="min-h-11 text-sm" aria-busy={busy}>{busy ? 'در حال ذخیره…' : broadcast ? 'ذخیره تغییرات' : 'ساخت اطلاعیه'}</Button>
        </div>
      </form>
    </Modal>
  );
}

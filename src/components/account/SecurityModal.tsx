'use client';

import { useEffect, useState } from 'react';
import type { ActiveSession } from '@/types';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/jalali';
import { Badge, Button, Input, Modal } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { CheckCircleIcon, MonitorIcon, ShieldIcon, WarningIcon } from '@/components/icons';

export interface SecurityModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly sessions: readonly ActiveSession[];
  readonly onRevokeSession: (sessionId: string) => void;
  readonly onChangePassword: () => void;
}

interface PasswordState {
  readonly current: string;
  readonly next: string;
  readonly confirm: string;
}

const BLANK: PasswordState = { current: '', next: '', confirm: '' };

/** Simple strength heuristic: length plus character-class variety. */
function scorePassword(value: string): { readonly score: number; readonly label: string; readonly tone: string } {
  if (value.length === 0) return { score: 0, label: '', tone: 'bg-gray-300' };
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^\w\s]/.test(value)) score += 1;

  if (score <= 2) return { score, label: 'ضعیف', tone: 'bg-status-blocked' };
  if (score <= 3) return { score, label: 'متوسط', tone: 'bg-status-progress' };
  return { score, label: 'قوی', tone: 'bg-status-done' };
}

/**
 * Security dialog: password change plus the list of devices holding a live session.
 *
 * Validation runs against the confirm field and a strength heuristic, and the submit stays
 * disabled until both pass — rather than accepting anything and reporting failure afterwards.
 */
export function SecurityModal({
  open,
  onClose,
  sessions,
  onRevokeSession,
  onChangePassword,
}: SecurityModalProps) {
  const [form, setForm] = useState<PasswordState>(BLANK);
  const [submitted, setSubmitted] = useState(false);
  const now = useNow();

  useEffect(() => {
    if (!open) return;
    setForm(BLANK);
    setSubmitted(false);
  }, [open]);

  const strength = scorePassword(form.next);
  const mismatch = form.confirm.length > 0 && form.next !== form.confirm;
  const tooWeak = form.next.length > 0 && strength.score <= 2;
  const canSubmit =
    form.current.length > 0 && form.next.length >= 8 && !mismatch && !tooWeak;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="امنیت و ورود"
      description="رمز عبور خود را تغییر دهید و دستگاه‌های دارای نشست فعال را مدیریت کنید."
      icon={<ShieldIcon size={20} variant="twotone" />}
      footer={
        <Button variant="secondary" onClick={onClose}>
          بستن
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <section aria-label="تغییر رمز عبور" className="flex flex-col gap-3">
          <h3 className="text-title-sm font-semibold text-fg-primary">تغییر رمز عبور</h3>

          {submitted ? (
            <div className="flex items-start gap-2 rounded-xl border border-status-done-line bg-status-done-subtle p-3">
              <CheckCircleIcon size={18} className="mt-0.5 shrink-0 text-status-done" />
              <p className="text-body-sm text-status-done">
                رمز عبور با موفقیت تغییر کرد. سایر نشست‌ها همچنان فعال هستند و می‌توانید از فهرست
                پایین آن‌ها را ببندید.
              </p>
            </div>
          ) : (
            <>
              <Input
                label="رمز عبور فعلی"
                type="password"
                autoComplete="current-password"
                value={form.current}
                onChange={(event) => setForm((c) => ({ ...c, current: event.target.value }))}
              />
              <Input
                label="رمز عبور جدید"
                type="password"
                autoComplete="new-password"
                value={form.next}
                onChange={(event) => setForm((c) => ({ ...c, next: event.target.value }))}
                hint="حداقل ۸ نویسه، ترکیبی از حروف بزرگ و کوچک، عدد و نماد."
                error={tooWeak ? 'رمز انتخابی به‌اندازه کافی قوی نیست.' : undefined}
              />

              {form.next.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="flex h-1.5 flex-1 gap-1" aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <span
                        key={step}
                        className={cn(
                          'h-full flex-1 rounded-full',
                          step <= strength.score ? strength.tone : 'bg-sunken',
                        )}
                      />
                    ))}
                  </span>
                  <span className="shrink-0 text-micro font-medium text-fg-tertiary">
                    {strength.label}
                  </span>
                </div>
              )}

              <Input
                label="تکرار رمز عبور جدید"
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(event) => setForm((c) => ({ ...c, confirm: event.target.value }))}
                error={mismatch ? 'رمز عبور و تکرار آن یکسان نیستند.' : undefined}
              />

              <Button
                disabled={!canSubmit}
                onClick={() => {
                  setSubmitted(true);
                  onChangePassword();
                }}
                className="self-start"
              >
                ثبت رمز جدید
              </Button>
            </>
          )}
        </section>

        <section aria-label="نشست‌های فعال" className="flex flex-col gap-3">
          <h3 className="text-title-sm font-semibold text-fg-primary">نشست‌های فعال</h3>
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center gap-3 rounded-xl border border-secondary bg-surface p-3"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-fg-tertiary">
                  <MonitorIcon size={18} variant="twotone" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-sm font-semibold text-fg-primary">
                    {session.device}
                  </span>
                  <span className="numeric truncate text-micro text-fg-tertiary">
                    {session.location}
                    {'، '}
                    {now ? formatRelative(session.lastActiveAt, now) : ''}
                  </span>
                </span>
                {session.current ? (
                  <Badge tone="success" size="md">
                    این دستگاه
                  </Badge>
                ) : (
                  <Button size="xs" variant="secondary" onClick={() => onRevokeSession(session.id)}>
                    خاتمه نشست
                  </Button>
                )}
              </li>
            ))}
          </ul>

          <p className="flex items-start gap-1.5 text-micro leading-5 text-fg-tertiary">
            <WarningIcon size={14} className="mt-0.5 shrink-0 text-status-progress" />
            اگر دستگاهی را نمی‌شناسید، نشست آن را ببندید و بلافاصله رمز عبور را تغییر دهید.
          </p>
        </section>
      </div>
    </Modal>
  );
}

'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { BillingPeriod, CheckoutOrderView, CouponRejection, CouponValidation } from '@taskin/contracts';
import { Button, Input } from '@/components/ui';
import { http, isProblem, newIdempotencyKey } from '@/lib/api-client';
import { problemMessage } from '@/lib/api-problem';

export const COUPON_MESSAGES: Record<CouponRejection, string> = {
  INVALID: 'این کد تخفیف معتبر نیست.',
  INACTIVE: 'این کد تخفیف غیرفعال شده است.',
  EXPIRED: 'مهلت استفاده از این کد گذشته است.',
  EXHAUSTED: 'ظرفیت این کد پر شده یا موقتاً رزرو است.',
  PLAN_INELIGIBLE: 'این کد برای پلن انتخاب‌شده قابل استفاده نیست.',
  MINIMUM_NOT_MET: 'مبلغ سفارش به حداقل لازم برای این کد نمی‌رسد.',
  PRICE_UNAVAILABLE: 'قیمت این پلن هنوز برای خرید فعال نشده است.',
};
const money = (value: number) => `${new Intl.NumberFormat('fa-IR').format(value)} تومان`;
export function CouponWidget({
  workspaceId,
  planId,
  period,
}: {
  workspaceId: string;
  planId: string;
  period: BillingPeriod;
}) {
  const [code, setCode] = useState('');
  const feedbackId = useId();
  const [remote, setRemote] = useState<{
    key: string;
    result: CouponValidation | null;
    error: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [order, setOrder] = useState<CheckoutOrderView | null>(null);
  const flight = useRef(false);
  const retry = useRef<{ signature: string; commandId: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const invalid = !!code && !/^[A-Z0-9]{3,40}$/.test(code);
  const requestKey = JSON.stringify([workspaceId, planId, period, code, attempt]);
  const current = remote?.key === requestKey ? remote : null;
  const quote: CouponValidation | null = invalid
    ? { valid: false, reason: 'INVALID' }
    : (current?.result ?? null);
  const error = orderError || current?.error || '';
  const verifying = !invalid && !current;
  useEffect(() => {
    if (invalid) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void http
        .post<CouponValidation>(
          '/coupons/validate',
          { workspaceId, planId, period, ...(code ? { code } : {}) },
          { signal: controller.signal },
        )
        .then((result) => {
          if (!controller.signal.aborted) setRemote({ key: requestKey, result, error: '' });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setRemote({ key: requestKey, result: null, error: 'بررسی کد انجام نشد؛ دوباره تلاش کنید.' });
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [workspaceId, planId, period, code, requestKey, invalid]);
  // A recoverable network failure can be retried without changing the entered code.
  const submit = async () => {
    if (flight.current || !quote?.valid || verifying) return;
    flight.current = true;
    setBusy(true);
    setOrderError('');
    const signature = JSON.stringify({ workspaceId, planId, period, code });
    if (retry.current?.signature !== signature) retry.current = { signature, commandId: newIdempotencyKey() };
    try {
      const created = await http.post<CheckoutOrderView>(`/workspaces/${workspaceId}/checkout/orders`, {
        planId,
        period,
        ...(code ? { code } : {}),
        commandId: retry.current.commandId,
      });
      setOrder(created);
    } catch (e) {
      const rejection = isProblem(e)
        ? e.body?.errors?.find((field) => field.field === 'code')?.message
        : undefined;
      setOrderError(
        rejection && Object.prototype.hasOwnProperty.call(COUPON_MESSAGES, rejection)
          ? COUPON_MESSAGES[rejection as CouponRejection]
          : problemMessage(e, 'سفارش ثبت نشد؛ اطلاعات حفظ شده است. دوباره تلاش کنید.'),
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      aria-label="خلاصه سفارش و کد تخفیف"
      className="flex flex-col gap-4 rounded-xl border border-secondary bg-surface p-4"
    >
      <Input
        label="کد تخفیف (اختیاری)"
        dir="ltr"
        autoComplete="off"
        maxLength={40}
        aria-invalid={quote?.valid === false}
        aria-describedby={feedbackId}
        value={code}
        disabled={busy || !!order}
        onChange={(e) => {
          const value = e.target.value.trim().toUpperCase();
          setOrderError('');
          setOrder(null);
          setCode(value);
        }}
      />
      <div id={feedbackId} role="status" aria-live="polite">
        {verifying
          ? 'در حال بررسی…'
          : quote && !quote.valid
            ? COUPON_MESSAGES[quote.reason]
            : code && quote?.valid
              ? 'کد تخفیف قابل استفاده است؛ رزرو پس از ثبت سفارش انجام می‌شود.'
              : null}
      </div>
      {quote && !quote.valid && !invalid && (
        <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
          بررسی دوبارهٔ کد
        </Button>
      )}
      {quote?.valid && (
        <dl className="grid grid-cols-2 gap-3 text-body-sm">
          <dt>مبلغ پلن</dt>
          <dd className="text-end">{money(quote.breakdown.subtotal)}</dd>
          <dt>تخفیف</dt>
          <dd className="text-end">{money(quote.breakdown.discount)}</dd>
          <dt className="font-semibold">مبلغ نهایی</dt>
          <dd className="text-end font-semibold">{money(quote.breakdown.total)}</dd>
        </dl>
      )}
      {error && (
        <p role="alert" className="text-status-blocked">
          {error}
        </p>
      )}
      {order ? (
        <p role="status">
          سفارش ثبت شد و منتظر پرداخت است. اتصال درگاه هنوز فعال نیست. رزرو تا{' '}
          {new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(order.reservationExpiresAt),
          )}{' '}
          معتبر است؛ ثبت مصرف نهایی پس از تأیید پرداخت انجام می‌شود.
        </p>
      ) : (
        <Button loading={busy} disabled={!quote?.valid || verifying} onClick={() => void submit()}>
          ثبت سفارش و رزرو تخفیف
        </Button>
      )}
      {error && !quote && (
        <Button
          variant="secondary"
          onClick={() => {
            setAttempt((value) => value + 1);
          }}
        >
          تلاش دوباره
        </Button>
      )}
    </section>
  );
}

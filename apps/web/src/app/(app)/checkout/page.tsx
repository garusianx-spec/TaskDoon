'use client';
import { useEffect, useState } from 'react';
import type { PlanPriceView } from '@taskin/contracts';
import { AppShell } from '@/components/layout/AppShell';
import { useLive, useWorkspace } from '@/store/WorkspaceProvider';
import { Button, Select } from '@/components/ui';
import { http } from '@/lib/api-client';
import { CouponWidget } from '@/features/billing/CouponWidget';
export default function CheckoutPage() {
  const { activeWorkspace, isWorkspaceOwner } = useWorkspace();
  const live = useLive();
  const connected = live !== null;
  const [prices, setPrices] = useState<{ workspaceId: string; items: PlanPriceView[] } | null>(null);
  const [choice, setChoice] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!connected || !isWorkspaceOwner) return;
    const controller = new AbortController();
    void http
      .get<PlanPriceView[]>(`/workspaces/${activeWorkspace.id}/checkout/catalog`, {
        signal: controller.signal,
      })
      .then((items) => {
        if (!controller.signal.aborted) {
          setPrices({ workspaceId: activeWorkspace.id, items });
          setChoice('0');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('دریافت قیمت‌ها انجام نشد. دوباره تلاش کنید.');
      });
    return () => controller.abort();
  }, [activeWorkspace.id, isWorkspaceOwner, connected, attempt]);
  const items = prices?.workspaceId === activeWorkspace.id ? prices.items : null;
  const selected = items?.[Number(choice)];
  return (
    <AppShell pageTitle="اشتراک و سفارش">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 overflow-y-auto p-4">
        <h1 className="text-heading font-bold">اشتراک و سفارش</h1>
        {!live ? (
          <p>خرید در نسخهٔ نمایشی فعال نیست.</p>
        ) : !isWorkspaceOwner ? (
          <p>مدیریت خرید فقط برای مالک فضای کاری در دسترس است.</p>
        ) : (
          <>
            <p className="text-body-sm text-fg-secondary">
              همهٔ مبلغ‌ها به تومان‌اند. اتصال درگاه پرداخت هنوز فعال نیست؛ ثبت سفارش به معنای پرداخت یا
              فعال‌شدن اشتراک نیست.
            </p>
            {error && (
              <>
                <p role="alert">{error}</p>
                <Button
                  onClick={() => {
                    setError('');
                    setAttempt((v) => v + 1);
                  }}
                >
                  تلاش دوباره
                </Button>
              </>
            )}
            {!error && !items && <p role="status">در حال دریافت قیمت‌ها…</p>}
            {items?.length === 0 && <p>هنوز قیمت قابل خریدی تعریف نشده است.</p>}
            {items && items.length > 0 && (
              <Select
                label="پلن و دوره"
                value={choice}
                onValueChange={setChoice}
                options={items.map((p, i) => ({
                  value: String(i),
                  label: `${p.planName ?? p.planId} — ${p.period === 'yearly' ? 'سالانه' : 'ماهانه'}`,
                }))}
              />
            )}
            {selected && (
              <CouponWidget
                key={`${activeWorkspace.id}:${selected.planId}:${selected.period}`}
                workspaceId={activeWorkspace.id}
                planId={selected.planId}
                period={selected.period}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

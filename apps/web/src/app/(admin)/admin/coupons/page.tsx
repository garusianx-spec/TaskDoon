'use client';
import { useRef, useState } from 'react';
import type {
  BillingPeriod,
  CouponPage,
  CouponView,
  CreateCouponBody,
  PlanPriceView,
} from '@taskin/contracts';
import { useAdmin, useAdminMe } from '@/features/admin/hooks/AdminSession';
import { useAdminLoad } from '@/features/admin/hooks/use-admin-load';
import { Button, Checkbox, Input, Modal, Select } from '@/components/ui';
import { JalaliDatePicker } from '@/components/shared/JalaliDatePicker';
import { http, query } from '@/lib/api-client';
import { problemMessage } from '@/lib/api-problem';
import { Loaded, PageHeader, Panel } from '@/features/admin/components/AdminUi';

type Catalog = { plans: { id: string; name: string }[]; prices: PlanPriceView[] };
const digits = (n: number) => new Intl.NumberFormat('fa-IR').format(n);
function CouponConsole() {
  const { call } = useAdmin();
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const page = useAdminLoad(JSON.stringify([filter, search, cursor]), () =>
    http.get<CouponPage>(`/admin/coupons${query({ status: filter, code: search, cursor })}`),
  );
  const catalog = useAdminLoad('coupon-catalog', () => http.get<Catalog>('/admin/billing/prices'));
  const [draft, setDraft] = useState<CreateCouponBody>({
    code: '',
    discountType: 'PERCENTAGE',
    discountValue: 1,
    allowedPlans: [],
  });
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState('23:59');
  const [calendar, setCalendar] = useState('jalali');
  const [pricePlan, setPricePlan] = useState('');
  const [pricePeriod, setPricePeriod] = useState<BillingPeriod>('monthly');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const [deactivating, setDeactivating] = useState<CouponView | null>(null);
  const run = async (work: () => Promise<unknown>, message: string) => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await call(work);
      setNotice(message);
      page.reload();
      catalog.reload();
    } catch (e) {
      setError(problemMessage(e, 'عملیات انجام نشد؛ اطلاعات حفظ شده است. دوباره تلاش کنید.'));
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const set = (value: Partial<CreateCouponBody>) => setDraft((d) => ({ ...d, ...value }));
  return (
    <>
      <PageHeader
        title="کدهای تخفیف"
        description="مبلغ‌ها به تومان‌اند. بررسی کد مصرف ندارد؛ مصرف نهایی فقط پس از تأیید پرداخت ثبت می‌شود."
      />
      {error && (
        <p role="alert" className="mb-4 text-status-blocked">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 text-status-done">
          {notice}
        </p>
      )}
      <Panel title="قیمت مرجع پلن‌ها (سمت سرور)">
        <Loaded load={catalog}>
          {(data) => (
            <div className="flex flex-col gap-4 p-4">
              <p className="text-body-sm text-fg-secondary">
                قیمت CMS صرفاً نمایشی است؛ قیمت خرید را اینجا تعریف کنید. تغییری در سفارش‌های ثبت‌شده ایجاد
                نمی‌شود.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      http.put('/admin/billing/prices', {
                        planId: pricePlan,
                        period: pricePeriod,
                        amountToman: Number(amount),
                      }),
                    'قیمت مرجع ذخیره شد.',
                  );
                }}
              >
                <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="پلن"
                    value={pricePlan}
                    onValueChange={setPricePlan}
                    options={[
                      { value: '', label: 'پلن را انتخاب کنید' },
                      ...data.plans.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                  <Select
                    label="دوره"
                    value={pricePeriod}
                    onValueChange={setPricePeriod}
                    options={[
                      { value: 'monthly', label: 'ماهانه' },
                      { value: 'yearly', label: 'سالانه' },
                    ]}
                  />
                  <Input
                    label="قیمت به تومان"
                    type="number"
                    dir="ltr"
                    required
                    min={0}
                    max={1_000_000_000_000}
                    step={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <Button type="submit" disabled={!pricePlan || amount === ''} loading={busy}>
                    ذخیره قیمت مرجع
                  </Button>
                </fieldset>
              </form>
              <ul className="divide-y divide-secondary">
                {data.prices.map((p) => (
                  <li key={`${p.planId}:${p.period}`} className="py-2">
                    {data.plans.find((plan) => plan.id === p.planId)?.name ?? p.planId}،{' '}
                    {p.period === 'monthly' ? 'ماهانه' : 'سالانه'}: {digits(p.amountToman)} تومان
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Loaded>
      </Panel>
      <Panel title="ایجاد کد تخفیف">
        <form
          className="p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const expiresAt = date ? new Date(`${date}T${time}:00+03:30`).toISOString() : null;
            void run(async () => {
              await http.post('/admin/coupons', { ...draft, expiresAt });
              setDraft({ code: '', discountType: 'PERCENTAGE', discountValue: 1, allowedPlans: [] });
              setDate(null);
            }, 'کد تخفیف ایجاد شد.');
          }}
        >
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <Input
              label="کد (حروف و اعداد لاتین)"
              dir="ltr"
              required
              minLength={3}
              maxLength={40}
              pattern="[A-Za-z0-9]{3,40}"
              value={draft.code}
              onChange={(e) => set({ code: e.target.value.trim().toUpperCase() })}
            />
            <Select
              label="نوع تخفیف"
              value={draft.discountType}
              onValueChange={(discountType) => set({ discountType, maxDiscountAmount: null })}
              options={[
                { value: 'PERCENTAGE', label: 'درصدی' },
                { value: 'FIXED_AMOUNT', label: 'مبلغ ثابت' },
              ]}
            />
            <Input
              label={draft.discountType === 'PERCENTAGE' ? 'درصد تخفیف' : 'مبلغ تخفیف (تومان)'}
              type="number"
              required
              min={1}
              step={1}
              max={draft.discountType === 'PERCENTAGE' ? 100 : 1_000_000_000_000}
              value={draft.discountValue}
              onChange={(e) => set({ discountValue: Number(e.target.value) })}
            />
            {draft.discountType === 'PERCENTAGE' && (
              <Input
                label="سقف تخفیف (تومان، خالی: بدون سقف)"
                type="number"
                min={0}
                max={1_000_000_000_000}
                step={1}
                value={draft.maxDiscountAmount ?? ''}
                onChange={(e) =>
                  set({ maxDiscountAmount: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            )}
            <Input
              label="حداقل مبلغ سفارش (تومان)"
              type="number"
              min={0}
              step={1}
              max={1_000_000_000_000}
              value={draft.minOrderAmount ?? 0}
              onChange={(e) => set({ minOrderAmount: Number(e.target.value) })}
            />
            <Input
              label="سقف تعداد مصرف (خالی: نامحدود)"
              type="number"
              min={1}
              step={1}
              max={2147483647}
              value={draft.usageLimit ?? ''}
              onChange={(e) => set({ usageLimit: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <Select
              label="تقویم تاریخ انقضا"
              value={calendar}
              onValueChange={setCalendar}
              options={[
                { value: 'jalali', label: 'شمسی' },
                { value: 'gregorian', label: 'میلادی' },
              ]}
            />
            {calendar === 'jalali' ? (
              <JalaliDatePicker
                label="تاریخ انقضا (اختیاری)"
                value={date}
                onChange={setDate}
                onClear={() => setDate(null)}
                timeZone="Asia/Tehran"
              />
            ) : (
              <Input
                label="تاریخ انقضا (میلادی، اختیاری)"
                type="date"
                dir="ltr"
                value={date ?? ''}
                onChange={(e) => setDate(e.target.value || null)}
              />
            )}
            {date && (
              <Input
                label="ساعت انقضا به وقت تهران"
                type="time"
                dir="ltr"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            )}
            <div className="flex flex-col gap-2 sm:col-span-2">
              <p>پلن‌های مجاز (بدون انتخاب: همهٔ پلن‌ها)</p>
              {catalog.data?.plans.map((p) => (
                <Checkbox
                  key={p.id}
                  label={p.name}
                  checked={draft.allowedPlans?.includes(p.id) ?? false}
                  onCheckedChange={(checked) =>
                    set({
                      allowedPlans: checked
                        ? [...(draft.allowedPlans ?? []), p.id]
                        : (draft.allowedPlans?.filter((id) => id !== p.id) ?? []),
                    })
                  }
                />
              ))}
            </div>
            <Checkbox
              label="کد پس از ایجاد فعال باشد"
              checked={draft.isActive ?? true}
              onCheckedChange={(isActive) => set({ isActive })}
            />
            <Button type="submit" loading={busy}>
              ایجاد کد تخفیف
            </Button>
          </fieldset>
        </form>
      </Panel>
      <Panel title="فهرست کدها">
        <div className="flex flex-wrap gap-3 p-4">
          <Input
            label="جستجوی کد دقیق"
            dir="ltr"
            value={search}
            onChange={(e) => {
              const value = e.target.value.toUpperCase();
              if (/^[A-Z0-9]*$/.test(value)) {
                setSearch(value);
                setCursor(null);
              }
            }}
          />
          <Select
            label="وضعیت"
            value={filter}
            onValueChange={(v) => {
              setFilter(v);
              setCursor(null);
            }}
            options={[
              { value: 'all', label: 'همه' },
              { value: 'active', label: 'فعال' },
              { value: 'inactive', label: 'غیرفعال' },
            ]}
          />
        </div>
        <Loaded load={page}>
          {(data) => (
            <>
              <div className="overflow-x-auto p-4" role="region" aria-label="جدول کدهای تخفیف" tabIndex={0}>
                <table className="w-full text-start text-body-sm">
                  <thead>
                    <tr>
                      {['کد', 'تخفیف', 'مصرف', 'انقضا', 'وضعیت', 'اقدام'].map((t) => (
                        <th className="p-2 text-start" key={t}>
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((c) => (
                      <tr key={c.id} className="border-t border-secondary">
                        <td className="p-2">
                          <bdi dir="ltr">{c.code}</bdi>
                        </td>
                        <td className="p-2">
                          {digits(c.discountValue)} {c.discountType === 'PERCENTAGE' ? 'درصد' : 'تومان'}
                        </td>
                        <td className="p-2">
                          {digits(c.usedCount)} از {c.usageLimit === null ? 'نامحدود' : digits(c.usageLimit)}
                        </td>
                        <td className="p-2">
                          {c.expiresAt
                            ? new Intl.DateTimeFormat('fa-IR', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                                timeZone: 'Asia/Tehran',
                              }).format(new Date(c.expiresAt))
                            : 'بدون انقضا'}
                        </td>
                        <td className="p-2">
                          {!c.isActive
                            ? 'غیرفعال'
                            : c.expiresAt && new Date(c.expiresAt) <= new Date()
                              ? 'منقضی'
                              : 'فعال'}
                        </td>
                        <td className="p-2">
                          <Button
                            variant="secondary"
                            disabled={!c.isActive || busy}
                            onClick={() => setDeactivating(c)}
                          >
                            غیرفعال کردن
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.items.length === 0 && <p>کدی با این فیلتر پیدا نشد.</p>}
              </div>
              <div className="flex gap-3 p-4">
                <Button variant="secondary" disabled={!cursor} onClick={() => setCursor(null)}>
                  صفحهٔ اول
                </Button>
                <Button
                  disabled={!data.nextCursor || page.loading}
                  onClick={() => setCursor(data.nextCursor)}
                >
                  صفحهٔ بعد
                </Button>
              </div>
            </>
          )}
        </Loaded>
      </Panel>
      <Modal
        title="غیرفعال کردن کد تخفیف"
        open={!!deactivating}
        onClose={() => {
          if (!busy) setDeactivating(null);
        }}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setDeactivating(null)}>
              انصراف
            </Button>
            <Button
              loading={busy}
              onClick={() => {
                if (deactivating)
                  void run(async () => {
                    await http.delete(`/admin/coupons/${deactivating.id}`);
                    setDeactivating(null);
                  }, 'کد غیرفعال شد؛ سابقهٔ مصرف حفظ می‌شود.');
              }}
            >
              غیرفعال کردن
            </Button>
          </>
        }
      >
        <p>
          کد «<bdi dir="ltr">{deactivating?.code}</bdi>» برای سفارش جدید قابل استفاده نخواهد بود. سفارش‌های
          رزروشده تا پایان مهلت رزرو معتبرند؛ سابقه حذف نمی‌شود.
        </p>
        {error && <p role="alert">{error}</p>}
      </Modal>
    </>
  );
}
export default function CouponsPage() {
  const admin = useAdminMe();
  return admin.role === 'SUPER_ADMIN' ? (
    <CouponConsole />
  ) : (
    <p>این بخش فقط برای مدیر ارشد پلتفرم در دسترس است.</p>
  );
}

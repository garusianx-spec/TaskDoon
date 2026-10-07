'use client';

import type { ReactNode } from 'react';
import { toPersianDigits } from '@taskin/jalali';
import { adminApi } from '@/admin/api';
import { bytesLabel, dateTimeLabel } from '@/admin/format';
import { useAdminLoad } from '@/admin/use-admin-load';
import { Loaded, Panel, TableFrame, TD, TH } from '@/components/admin/AdminUi';
import { Badge, Button } from '@/components/ui';
import { RefreshIcon } from '@/components/icons';

const SERVICES = { database: 'پایگاه داده', adminPool: 'اتصال مدیریت', redisCore: 'ردیس اصلی', redisRt: 'ردیس ارتباط زنده', storage: 'ذخیره‌سازی فایل‌ها' } as const;
const QUEUES: Readonly<Record<string, string>> = { notifications: 'اعلان‌ها', work: 'وظایف', maintenance: 'نگهداری' };
function Kpi({ title, value, children }: { readonly title: string; readonly value: string; readonly children: ReactNode }) {
  return <article className="min-w-0 rounded-xl border border-secondary bg-surface p-4">
    <h2 className="text-sm font-medium text-fg-secondary">{title}</h2>
    <p className="my-3 break-words text-2xl font-semibold leading-tight text-fg-primary">{value}</p>
    <div className="text-sm leading-relaxed text-fg-secondary">{children}</div>
  </article>;
}

/** Pattern: Dashboard / Overview. A read-only snapshot with explicit refresh. */
export default function AdminOverviewPage() {
  const metrics = useAdminLoad('platform-metrics', adminApi.metrics);
  const health = useAdminLoad('platform-health', adminApi.health);
  const outbox = useAdminLoad('platform-outbox-health', adminApi.outboxHealth);
  const refresh = () => { metrics.reload(); health.reload(); outbox.reload(); };
  return (
    <div className="mx-auto w-full max-w-screen-xl text-sm leading-relaxed">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-heading font-semibold leading-tight text-fg-primary">نمای کلی پلتفرم</h1>
          <p className="mt-2 text-sm text-fg-secondary">آمار استفاده، سلامت سرویس‌ها و وضعیت پردازش کارها را در یک نگاه ببینید.</p>
        </div>
        <Button variant="secondary" className="min-h-11 text-sm" iconStart={<RefreshIcon size={18} />} aria-busy={metrics.loading || health.loading || outbox.loading} onClick={refresh}>بازخوانی وضعیت</Button>
      </header>
      <Loaded load={metrics}>
        {(data) => <>
          <div className="mb-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi title="کاربران" value={toPersianDigits(data.users.total)}>
              <p>{toPersianDigits(data.users.active)} فعال؛ {toPersianDigits(data.users.suspended)} معلق</p>
              <p>{toPersianDigits(data.users.newLast7Days)} عضو جدید در ۷ روز</p>
            </Kpi>
            <Kpi title="فضاهای کاری" value={toPersianDigits(data.workspaces.total)}>
              <p>{toPersianDigits(data.workspaces.active)} فعال؛ {toPersianDigits(data.workspaces.suspended)} معلق</p>
              <p>{toPersianDigits(data.workspaces.deleted)} حذف‌شده</p>
            </Kpi>
            <Kpi title="فضای مصرف‌شده" value={bytesLabel(data.content.storageUsedBytes)}><p>{toPersianDigits(data.content.readyFiles)} فایل آماده</p></Kpi>
            <Kpi title="وظایف" value={toPersianDigits(data.content.tasks)}><p>در همه فضاهای کاری</p></Kpi>
            <Kpi title="پیام‌ها" value={toPersianDigits(data.content.messages)}><p>{toPersianDigits(data.content.messagesLast7Days)} پیام در ۷ روز اخیر</p></Kpi>
          </div>
          <p className="mb-6 text-xs text-fg-tertiary">زمان آمار: {dateTimeLabel(data.generatedAt)}{data.cached ? '؛ نسخه ذخیره‌شده با اعتبار ۶۰ ثانیه' : ''}. {toPersianDigits(data.users.activeLast7Days)} کاربر در ۷ روز اخیر فعال بوده‌اند؛ {toPersianDigits(data.users.newLast30Days)} عضو جدید در ۳۰ روز.</p>
        </>}
      </Loaded>
      <Panel title="سلامت سرویس‌ها">
        <Loaded load={health}>
          {(data) => <>
            <dl className="divide-y divide-secondary">
              {Object.entries(SERVICES).map(([key, label]) => {
                const service = data.services[key as keyof typeof SERVICES];
                return <div key={key} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                  <dt className="text-sm text-fg-primary">{label}</dt>
                  <dd className="flex flex-wrap items-center gap-3">
                    <Badge size="md" tone={service.ok ? 'success' : 'error'} dot>{service.ok ? 'آماده' : 'نیاز به بررسی'}</Badge>
                    <span className="text-xs text-fg-tertiary">{toPersianDigits(Math.round(service.latencyMs))} میلی‌ثانیه</span>
                    {service.error && <span className="min-w-0 break-words text-sm text-status-blocked [overflow-wrap:anywhere]">{service.error}</span>}
                  </dd>
                </div>;
              })}
            </dl>
            <div className="mt-4 border-t border-secondary pt-4">
              <h3 className="mb-3 text-sm font-semibold text-fg-primary">ارسال پیامک</h3>
              {data.sms.providers.length === 0 ? <p className="text-sm text-fg-secondary">ارائه‌دهنده‌ای ثبت نشده است.</p> : <ul className="flex flex-col gap-3">
                {data.sms.providers.map((provider) => <li key={provider.name} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="break-words text-fg-primary">{provider.name}</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge size="md" tone={provider.openUntil ? 'warning' : 'success'}>{provider.openUntil ? 'موقتاً متوقف' : 'فعال'}</Badge>
                    <span className="text-fg-secondary">{toPersianDigits(provider.failures)} خطای متوالی</span>
                    {provider.openUntil && <span className="text-xs text-fg-tertiary">تا {dateTimeLabel(provider.openUntil)}</span>}
                  </div>
                </li>)}
              </ul>}
              <p className="mt-3 text-sm text-fg-secondary">کارهای ناموفق پیامکی: {data.sms.failedJobs === null ? 'وضعیت در دسترس نیست' : toPersianDigits(data.sms.failedJobs)}</p>
            </div>
            <p className="mt-4 text-xs text-fg-tertiary">زمان بررسی: {dateTimeLabel(data.checkedAt)}</p>
          </>}
        </Loaded>
      </Panel>
      <Panel title="پردازش رویدادها و صف‌ها">
        <Loaded load={outbox}>
          {(data) => <>
            <p className="mb-4 text-sm text-fg-secondary">
              {toPersianDigits(data.pending.count)} رویداد در انتظار انتشار
              {data.pending.oldestAgeSeconds !== null ? `؛ قدیمی‌ترین: ${toPersianDigits(Math.round(data.pending.oldestAgeSeconds))} ثانیه` : ''}
            </p>
            <TableFrame label="وضعیت صف‌ها">
              <table className="w-full min-w-[640px] border-collapse text-start text-sm">
                <thead><tr><th className={TH}>صف</th><th className={TH}>منتظر</th><th className={TH}>در حال اجرا</th><th className={TH}>زمان‌بندی‌شده</th><th className={TH}>ناموفق</th><th className={TH}>متوقف</th></tr></thead>
                <tbody>{data.queues.map((queue) => <tr key={queue.name}>
                  <td className={TD}>{QUEUES[queue.name] ?? queue.name}{queue.error && <p className="mt-1 text-sm text-status-blocked">{queue.error}</p>}</td>
                  {(['waiting', 'active', 'delayed', 'failed', 'paused'] as const).map((state) => <td key={state} className={TD}>{queue.error ? '—' : toPersianDigits(queue.counts[state])}</td>)}
                </tr>)}</tbody>
              </table>
            </TableFrame>
            {data.queues.map((queue) => queue.recentFailures.length > 0 && <section key={queue.name} className="mt-4 rounded-lg border border-secondary p-3">
              <h3 className="mb-2 text-sm font-semibold text-fg-primary">خطاهای اخیر {QUEUES[queue.name] ?? queue.name}</h3>
              <ul className="divide-y divide-secondary">
                {queue.recentFailures.map((failure, index) => <li key={`${failure.name}:${index}`} className="py-3 text-sm first:pt-0">
                  <p className="break-words text-fg-primary">{failure.name}؛ {toPersianDigits(failure.attempts)} تلاش</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-fg-secondary">{failure.reason || 'توضیحی ثبت نشده است.'}</p>
                  {failure.failedAt && <p className="mt-1 text-xs text-fg-tertiary">{dateTimeLabel(failure.failedAt)}</p>}
                </li>)}
              </ul>
            </section>)}
            <p className="mt-4 text-xs text-fg-tertiary">زمان بررسی: {dateTimeLabel(data.checkedAt)}</p>
          </>}
        </Loaded>
      </Panel>
    </div>
  );
}

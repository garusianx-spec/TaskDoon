'use client';
import Link from 'next/link';
import { useState } from 'react';
import type {
  TicketDepartment,
  TicketPage,
  TicketPriority,
  TicketStatus,
  SupportAgentView,
} from '@taskin/contracts';
import { Badge, Button, Input, Select } from '@/components/ui';
import { http, query } from '@/lib/api-client';
import { useSupportResource } from './useSupportResource';
import { DEPARTMENTS, PRIORITIES, STATUSES } from './support-client';
import { NewTicket } from './NewTicket';
export function TicketsList({
  admin = false,
  actorKey,
  call,
}: {
  admin?: boolean;
  actorKey: string;
  call?: <T>(work: () => Promise<T>) => Promise<T>;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [department, setDepartment] = useState<TicketDepartment | ''>('');
  const [assigned, setAssigned] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const base = admin ? '/admin/tickets' : '/support/tickets';
  const params = query({
    q,
    status,
    priority,
    department,
    cursor,
    assignedAdminId: assigned && assigned !== 'none' ? assigned : undefined,
    unassigned: assigned === 'none' ? 'true' : undefined,
  });
  const page = useSupportResource(`${actorKey}:${params}`, (signal) =>
    call
      ? call(() => http.get<TicketPage>(`${base}${params}`, { signal }))
      : http.get<TicketPage>(`${base}${params}`, { signal }),
  );
  const agents = useSupportResource(
    `${actorKey}:agents`,
    (signal) =>
      admin
        ? call
          ? call(() => http.get<SupportAgentView[]>('/admin/tickets/agents', { signal }))
          : http.get<SupportAgentView[]>('/admin/tickets/agents', { signal })
        : Promise.resolve([] as SupportAgentView[]),
    0,
  );
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-heading font-bold">{admin ? 'صف پشتیبانی' : 'درخواست‌های پشتیبانی من'}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={page.reload}>
            به‌روزرسانی
          </Button>
          {!admin && <Button onClick={() => setCreating(true)}>درخواست جدید</Button>}
        </div>
      </div>
      <p className="mb-4 text-body-sm text-fg-secondary">
        {admin
          ? 'درخواست‌ها را بررسی، واگذار یا پاسخ دهید.'
          : 'فقط درخواست‌های خودتان نمایش داده می‌شوند؛ حتی اگر عضویت فضای کاری تغییر کرده باشد.'}{' '}
        به‌روزرسانی خودکار هنگام بازبودن صفحه فعال است.
      </p>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label="جستجوی عنوان یا کد"
          value={q}
          maxLength={100}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(null);
          }}
        />
        <Select
          hideLabel={false}
          label="وضعیت"
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setCursor(null);
          }}
          options={[
            { value: '', label: 'همه وضعیت‌ها' },
            ...Object.entries(STATUSES).map(([value, label]) => ({ value: value as TicketStatus, label })),
          ]}
        />
        <Select
          hideLabel={false}
          label="بخش"
          value={department}
          onValueChange={(v) => {
            setDepartment(v);
            setCursor(null);
          }}
          options={[
            { value: '', label: 'همه بخش‌ها' },
            ...Object.entries(DEPARTMENTS).map(([value, label]) => ({
              value: value as TicketDepartment,
              label,
            })),
          ]}
        />
        <Select
          hideLabel={false}
          label="اولویت"
          value={priority}
          onValueChange={(v) => {
            setPriority(v);
            setCursor(null);
          }}
          options={[
            { value: '', label: 'همه اولویت‌ها' },
            ...Object.entries(PRIORITIES).map(([value, label]) => ({
              value: value as TicketPriority,
              label,
            })),
          ]}
        />
        {admin && (
          <Select
            hideLabel={false}
            label="واگذاری"
            value={assigned}
            onValueChange={(v) => {
              setAssigned(v);
              setCursor(null);
            }}
            options={[
              { value: '', label: 'همه همکاران' },
              { value: 'none', label: 'واگذار نشده' },
              ...(agents.data?.map((a) => ({ value: a.id, label: a.fullName })) ?? []),
            ]}
          />
        )}
      </div>
      {page.error && (
        <p role="alert" className="mb-4 text-status-blocked">
          {page.error}{' '}
          <Button variant="secondary" onClick={page.reload}>
            تلاش دوباره
          </Button>
        </p>
      )}
      {!page.data && !page.error && <p role="status">در حال دریافت درخواست‌ها…</p>}
      {page.data?.items.length === 0 && (
        <p className="rounded-xl border border-secondary bg-surface p-6">
          {q || status || department || priority || assigned
            ? 'درخواستی با این فیلترها پیدا نشد.'
            : 'هنوز درخواستی ثبت نشده است.'}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {page.data?.items.map((t) => (
          <li key={t.id}>
            <Link
              href={`${base}/${t.id}`}
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-secondary bg-surface p-4 transition-colors hover:bg-hover"
            >
              <div className="flex flex-wrap items-center gap-2">
                <bdi dir="ltr" className="text-caption text-fg-secondary">
                  {t.reference}
                </bdi>
                <Badge tone={t.status === 'CLOSED' || t.status === 'RESOLVED' ? 'success' : 'brand'}>
                  {STATUSES[t.status]}
                </Badge>
                <span className="text-caption">اولویت {PRIORITIES[t.priority]}</span>
                {t.unreadCount > 0 && (
                  <Badge tone="warning">
                    {new Intl.NumberFormat('fa-IR').format(t.unreadCount)} پاسخ خوانده‌نشده
                  </Badge>
                )}
              </div>
              <h2 className="break-words text-title-sm font-semibold">{t.subject}</h2>
              <p className="text-caption text-fg-secondary">
                {DEPARTMENTS[t.department]} · {t.workspaceName} ·{' '}
                {new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(
                  new Date(t.updatedAt),
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex gap-3">
        <Button variant="secondary" disabled={!cursor} onClick={() => setCursor(null)}>
          صفحهٔ اول
        </Button>
        <Button disabled={!page.data?.nextCursor} onClick={() => setCursor(page.data?.nextCursor ?? null)}>
          صفحهٔ بعد
        </Button>
      </div>
      {creating && <NewTicket onClose={() => setCreating(false)} />}
    </>
  );
}

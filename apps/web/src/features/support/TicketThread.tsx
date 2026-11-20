'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  FileLink,
  SupportAgentView,
  TicketMessageView,
  TicketPriority,
  TicketStatus,
  TicketThread as Thread,
  UpdateTicketBody,
} from '@taskin/contracts';
import { Badge, Button, Checkbox, Modal, Select, Textarea } from '@/components/ui';
import { http, newIdempotencyKey, query } from '@/lib/api-client';
import { SupportFiles } from './SupportFiles';
import {
  DEPARTMENTS,
  PRIORITIES,
  STATUSES,
  supportError,
  uploadSupportFiles,
  type QueuedSupportFile,
} from './support-client';
import { useSupportResource } from './useSupportResource';
const CANNED = [
  'سلام، برای بررسی درخواست لطفاً مراحل انجام کار و متن خطایی را که می‌بینید بفرستید.',
  'سلام، لطفاً شناسه سفارش و توضیح مشکل پرداخت را بفرستید. اطلاعات کارت بانکی یا رمز را ارسال نکنید.',
  'سلام، لطفاً جزئیات بیشتری درباره درخواستتان بنویسید تا بتوانیم بررسی کنیم.',
];
const date = (value: string) =>
  new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
export function TicketThread({
  id,
  actorKey,
  admin = false,
  call,
}: {
  id: string;
  actorKey: string;
  admin?: boolean;
  call?: <T>(work: () => Promise<T>) => Promise<T>;
}) {
  const base = `/${admin ? 'admin' : 'support'}/tickets`;
  const invoke = useCallback(<T,>(work: () => Promise<T>) => (call ? call(work) : work()), [call]);
  const thread = useSupportResource(`${actorKey}:${id}`, (signal) =>
    invoke(() => http.get<Thread>(`${base}/${id}`, { signal })),
  );
  const agents = useSupportResource(
    `${actorKey}:agents`,
    (signal) =>
      admin
        ? invoke(() => http.get<SupportAgentView[]>('/admin/tickets/agents', { signal }))
        : Promise.resolve([] as SupportAgentView[]),
    0,
  );
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<QueuedSupportFile[]>([]);
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [readError, setReadError] = useState('');
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const retry = useRef<{ hash: string; id: string } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [older, setOlder] = useState<TicketMessageView[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(undefined);
  const [olderBusy, setOlderBusy] = useState(false);
  const [draft, setDraft] = useState<UpdateTicketBody | null>(null);
  const [closing, setClosing] = useState(false);
  const read = useRef(0);
  const data = thread.data;
  useEffect(() => {
    if (!data) return;
    let active = true;
    const mark = () => {
      const seq = Math.max(0, ...data.messages.map((m) => m.publicSeq ?? 0));
      if (document.visibilityState === 'hidden' || seq <= read.current) return;
      void invoke(() => http.post(`${base}/${id}/read`, { throughSeq: seq })).then(
        () => {
          if (active) {
            read.current = seq;
            setReadError('');
          }
        },
        () => {
          if (active) setReadError('ثبت وضعیت خوانده‌شده انجام نشد؛ دوباره بررسی می‌شود.');
        },
      );
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', mark);
    };
  }, [data, id, base, invoke]); // callbacks use the current route/session; the resource drops stale replies.
  const send = async () => {
    if (flight.current || !data) return;
    if (!body.trim()) {
      setError('متن پیام را بنویسید.');
      input.current?.focus();
      return;
    }
    flight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const attachmentIds = await uploadSupportFiles(files, { ticketId: id, admin });
      const content = { body: body.trim(), attachmentIds, ...(admin ? { isInternal: internal } : {}) };
      const hash = JSON.stringify(content);
      if (retry.current?.hash !== hash) retry.current = { hash, id: newIdempotencyKey() };
      await invoke(() => http.post(`${base}/${id}/messages`, { ...content, commandId: retry.current!.id }));
      setBody('');
      setFiles([]);
      retry.current = null;
      setNotice(internal ? 'یادداشت داخلی ثبت شد.' : 'پیام ثبت شد.');
      thread.reload();
    } catch (e) {
      setError(supportError(e));
      thread.reload();
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const update = async (value: UpdateTicketBody) => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await invoke(() =>
        admin
          ? http.patch(`${base}/${id}`, value)
          : http.post(`${base}/${id}/close`, { expectedVersion: value.expectedVersion }),
      );
      setDraft(null);
      setClosing(false);
      setNotice('وضعیت درخواست ذخیره شد.');
      thread.reload();
    } catch (e) {
      setError(supportError(e));
      thread.reload();
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const history = async () => {
    const cursor = olderCursor === undefined ? data?.nextCursor : olderCursor;
    if (!cursor || olderBusy) return;
    setOlderBusy(true);
    try {
      const page = await invoke(() => http.get<Thread>(`${base}/${id}${query({ cursor })}`));
      setOlder((old) => [...old, ...page.messages]);
      setOlderCursor(page.nextCursor);
    } catch (e) {
      setError(supportError(e));
    } finally {
      setOlderBusy(false);
    }
  };
  const download = async (fileId: string) => {
    try {
      const link = await invoke(() => http.get<FileLink>(`${base}/${id}/attachments/${fileId}`));
      window.location.assign(link.url);
    } catch (e) {
      setError(supportError(e));
    }
  };
  const messages = [...new Map([...older, ...(data?.messages ?? [])].map((m) => [m.id, m])).values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  const canReply = data && data.ticket.status !== 'CLOSED';
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Link className="inline-flex min-h-11 items-center self-start text-fg-brand" href={base}>
        بازگشت به فهرست درخواست‌ها
      </Link>
      {thread.error && (
        <p role="alert" className="text-status-blocked">
          {thread.error}{' '}
          <Button variant="secondary" onClick={thread.reload}>
            تلاش دوباره
          </Button>
        </p>
      )}
      {!data && !thread.error && <p role="status">در حال دریافت گفتگو…</p>}
      {data && (
        <>
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <bdi dir="ltr">{data.ticket.reference}</bdi>
              <Badge tone="brand">{STATUSES[data.ticket.status]}</Badge>
              <span className="text-caption">
                {DEPARTMENTS[data.ticket.department]} · اولویت {PRIORITIES[data.ticket.priority]}
              </span>
            </div>
            <h1 className="break-words text-heading font-bold">{data.ticket.subject}</h1>
            <p className="text-caption text-fg-secondary">
              {data.ticket.workspaceName} · ثبت در {date(data.ticket.createdAt)}
            </p>
          </header>
          {admin && (
            <section
              aria-label="مدیریت درخواست"
              className="grid gap-3 rounded-xl border border-secondary bg-surface p-4 sm:grid-cols-3"
            >
              <Select
                hideLabel={false}
                label="وضعیت درخواست"
                value={draft?.status ?? data.ticket.status}
                onValueChange={(status) =>
                  setDraft((d) => ({
                    ...d,
                    expectedVersion: d?.expectedVersion ?? data.ticket.version,
                    status,
                  }))
                }
                options={Object.entries(STATUSES)
                  .filter(
                    ([s]) => data.ticket.status !== 'CLOSED' || ['CLOSED', 'OPEN', 'IN_PROGRESS'].includes(s),
                  )
                  .map(([value, label]) => ({ value: value as TicketStatus, label }))}
              />
              <Select
                hideLabel={false}
                label="اولویت درخواست"
                value={draft?.priority ?? data.ticket.priority}
                onValueChange={(priority) =>
                  setDraft((d) => ({
                    ...d,
                    expectedVersion: d?.expectedVersion ?? data.ticket.version,
                    priority,
                  }))
                }
                options={Object.entries(PRIORITIES).map(([value, label]) => ({
                  value: value as TicketPriority,
                  label,
                }))}
              />
              <Select
                hideLabel={false}
                label="همکار مسئول"
                value={
                  draft?.assignedAdminId === undefined
                    ? (data.ticket.assignedAdminId ?? '')
                    : (draft.assignedAdminId ?? '')
                }
                onValueChange={(value) =>
                  setDraft((d) => ({
                    ...d,
                    expectedVersion: d?.expectedVersion ?? data.ticket.version,
                    assignedAdminId: value || null,
                  }))
                }
                options={[
                  { value: '', label: 'واگذار نشده' },
                  ...(agents.data ?? []).map((a) => ({ value: a.id, label: a.fullName })),
                ]}
              />
              {agents.error && <p role="alert">{agents.error}</p>}
              <div className="flex flex-wrap gap-2 sm:col-span-3">
                <Button loading={busy} disabled={!draft} onClick={() => draft && void update(draft)}>
                  ذخیره تغییرات
                </Button>
                {draft && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setDraft(null);
                      thread.reload();
                    }}
                  >
                    دریافت وضعیت تازه
                  </Button>
                )}
              </div>
            </section>
          )}
          {notice && (
            <p role="status" className="text-status-done">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="text-status-blocked">
              {error}
            </p>
          )}
          {readError && <p className="text-caption text-fg-secondary">{readError}</p>}
          <Button
            variant="secondary"
            disabled={olderBusy || !(olderCursor === undefined ? data.nextCursor : olderCursor)}
            onClick={() => void history()}
          >
            نمایش پیام‌های قدیمی‌تر
          </Button>
          <ol aria-label="گفتگوی پشتیبانی" className="flex flex-col gap-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`min-w-0 rounded-xl border border-secondary p-4 ${m.isInternal ? 'bg-sunken' : 'bg-surface'}`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {m.isInternal
                      ? 'یادداشت داخلی'
                      : m.senderType === 'AGENT'
                        ? 'پشتیبانی تسک‌دون'
                        : 'درخواست‌کننده'}
                  </span>
                  <time className="text-caption text-fg-tertiary" dateTime={m.createdAt}>
                    {date(m.createdAt)}
                  </time>
                </div>
                {m.isInternal && <Badge tone="warning">فقط همکاران پشتیبانی</Badge>}
                <p className="whitespace-pre-wrap break-words text-body leading-7">{m.body}</p>
                {m.attachments.length > 0 && (
                  <ul aria-label="پیوست‌های پیام" className="mt-3 flex flex-col gap-2">
                    {m.attachments.map((f) => (
                      <li key={f.id}>
                        <Button
                          variant="secondary"
                          className="max-w-full whitespace-normal break-all"
                          onClick={() => void download(f.id)}
                        >
                          دریافت <bdi>{f.name}</bdi> ·{' '}
                          {new Intl.NumberFormat('fa-IR').format(Math.ceil(f.size / 1024))} کیلوبایت
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex flex-col gap-3 rounded-xl border border-secondary bg-surface p-4"
          >
            <fieldset disabled={busy || (!canReply && !admin)} className="flex flex-col gap-3">
              {admin && (
                <>
                  <Checkbox
                    label="یادداشت داخلی (برای کاربر نمایش داده نمی‌شود)"
                    checked={internal}
                    onCheckedChange={setInternal}
                  />
                  <Select
                    hideLabel={false}
                    label="پاسخ آماده (پیش از ارسال قابل ویرایش)"
                    value=""
                    onValueChange={(v) => {
                      if (v) setBody((old) => (old ? `${old}\n\n${CANNED[Number(v)]}` : CANNED[Number(v)]!));
                    }}
                    options={[
                      { value: '', label: 'انتخاب پاسخ آماده' },
                      ...CANNED.map((text, i) => ({ value: String(i), label: text })),
                    ]}
                  />
                </>
              )}
              <Textarea
                ref={input}
                label={internal ? 'متن یادداشت داخلی' : 'پاسخ شما'}
                required
                maxLength={8000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <SupportFiles files={files} onChange={setFiles} onError={setError} disabled={busy} />
              {!canReply && (
                <p className="text-body-sm">
                  این درخواست بسته است.{' '}
                  {admin ? 'برای پاسخ عمومی، ابتدا آن را باز کنید.' : 'برای ادامه، درخواست تازه‌ای ثبت کنید.'}
                </p>
              )}
              <Button type="submit" loading={busy} disabled={!canReply && !(admin && internal)}>
                {internal ? 'ثبت یادداشت داخلی' : 'ارسال پاسخ'}
              </Button>
            </fieldset>
          </form>
          {!admin && data.ticket.status !== 'CLOSED' && (
            <Button variant="secondary" disabled={busy} onClick={() => setClosing(true)}>
              بستن درخواست من
            </Button>
          )}
          <Modal
            title="بستن درخواست پشتیبانی"
            open={closing}
            onClose={() => {
              if (!busy) setClosing(false);
            }}
            footer={
              <>
                <Button variant="secondary" disabled={busy} onClick={() => setClosing(false)}>
                  ادامه گفتگو
                </Button>
                <Button
                  loading={busy}
                  onClick={() => void update({ expectedVersion: data.ticket.version, status: 'CLOSED' })}
                >
                  بستن درخواست
                </Button>
              </>
            }
          >
            <p>
              درخواست <bdi dir="ltr">{data.ticket.reference}</bdi> بسته می‌شود. پس از بستن، امکان پاسخ در این
              گفتگو را ندارید. برای موضوع تازه می‌توانید درخواست دیگری ثبت کنید.
            </p>
            {(body || files.length > 0) && <p>یک پیش‌نویس ارسال‌نشده دارید؛ پیش از بستن آن را بررسی کنید.</p>}
            {error && <p role="alert">{error}</p>}
          </Modal>
        </>
      )}
    </div>
  );
}

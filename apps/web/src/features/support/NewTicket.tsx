'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CreateTicketBody, MeResponse, TicketView } from '@taskin/contracts';
import { Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { http, newIdempotencyKey } from '@/lib/api-client';
import { useSupportResource } from './useSupportResource';
import { useSupportUser } from './SupportSession';
import {
  DEPARTMENTS,
  PRIORITIES,
  supportError,
  uploadSupportFiles,
  type QueuedSupportFile,
} from './support-client';
import { SupportFiles } from './SupportFiles';
export function NewTicket({ onClose }: { onClose: () => void }) {
  const user = useSupportUser();
  const router = useRouter();
  const me = useSupportResource(user.id, (signal) => http.get<MeResponse>('/me', { signal }), 0);
  const [workspaceId, setWorkspaceId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [department, setDepartment] = useState<CreateTicketBody['department']>('GENERAL');
  const [priority, setPriority] = useState<CreateTicketBody['priority']>('MEDIUM');
  const [files, setFiles] = useState<QueuedSupportFile[]>([]);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ subject?: string; body?: string }>({});
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState(false);
  const flight = useRef(false);
  const retry = useRef<{ hash: string; id: string } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dirty = !!(
    subject ||
    body ||
    files.length ||
    workspaceId ||
    department !== 'GENERAL' ||
    priority !== 'MEDIUM'
  );
  const close = () => {
    if (flight.current) return;
    if (dirty) setWarning(true);
    else onClose();
  };
  const submit = async () => {
    if (flight.current) return;
    if (subject.trim().length < 3) {
      setError('');
      setFieldErrors({ subject: 'عنوان درخواست را با دست‌کم ۳ نویسه بنویسید.' });
      titleRef.current?.focus();
      return;
    }
    if (!body.trim()) {
      setError('');
      setFieldErrors({ body: 'شرح درخواست را بنویسید.' });
      bodyRef.current?.focus();
      return;
    }
    if (!workspaceId) {
      setError('فضای کاری مرتبط را انتخاب کنید.');
      return;
    }
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      const attachmentIds = await uploadSupportFiles(files, { workspaceId });
      const data = {
        workspaceId,
        subject: subject.trim(),
        body: body.trim(),
        department,
        priority,
        attachmentIds,
      };
      const hash = JSON.stringify(data);
      if (retry.current?.hash !== hash) retry.current = { hash, id: newIdempotencyKey() };
      const ticket = await http.post<TicketView>('/support/tickets', {
        ...data,
        commandId: retry.current.id,
      });
      router.push(`/support/tickets/${ticket.id}`);
      onClose();
    } catch (e) {
      setError(supportError(e));
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title="درخواست پشتیبانی جدید"
      open
      onClose={close}
      size="lg"
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={close}>
            انصراف
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            ثبت درخواست
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={busy} className="flex flex-col gap-4">
          <Input
            ref={titleRef}
            error={fieldErrors.subject}
            errorRole="alert"
            label="عنوان درخواست"
            required
            minLength={3}
            maxLength={160}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setFieldErrors((old) => ({ ...old, subject: undefined }));
            }}
          />
          {me.error && (
            <p role="alert">
              {me.error}
              <Button onClick={me.reload} variant="secondary">
                تلاش دوباره
              </Button>
            </p>
          )}
          <Select
            hideLabel={false}
            label="فضای کاری مرتبط"
            value={workspaceId}
            onValueChange={setWorkspaceId}
            options={[
              { value: '', label: 'انتخاب فضای کاری' },
              ...(me.data?.workspaces.map((w) => ({ value: w.id, label: w.name })) ?? []),
            ]}
          />
          {me.data?.workspaces.length === 0 && (
            <p>
              برای ثبت درخواست مرتبط با یک فضا، باید عضو آن باشید. تیکت‌های قبلی شما همچنان در فهرست می‌مانند.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              hideLabel={false}
              label="بخش"
              value={department}
              onValueChange={setDepartment}
              options={Object.entries(DEPARTMENTS).map(([value, label]) => ({
                value: value as CreateTicketBody['department'],
                label,
              }))}
            />
            <Select
              hideLabel={false}
              label="اولویت"
              value={priority}
              onValueChange={setPriority}
              options={Object.entries(PRIORITIES).map(([value, label]) => ({
                value: value as CreateTicketBody['priority'],
                label,
              }))}
            />
          </div>
          <Textarea
            ref={bodyRef}
            error={fieldErrors.body}
            label="شرح درخواست"
            required
            maxLength={8000}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setFieldErrors((old) => ({ ...old, body: undefined }));
            }}
          />
          <SupportFiles files={files} onChange={setFiles} onError={setError} disabled={busy} />
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-status-blocked">
          {error}
        </p>
      )}
      {warning && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary p-3">
          <p>اطلاعات ارسال‌نشده دارید. می‌خواهید ویرایش را ادامه دهید؟</p>
          <Button onClick={() => setWarning(false)}>ادامه ویرایش</Button>
          <Button variant="secondary" onClick={onClose}>
            کنار گذاشتن پیش‌نویس
          </Button>
        </div>
      )}
    </Modal>
  );
}

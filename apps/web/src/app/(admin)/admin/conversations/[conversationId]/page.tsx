'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { MessageView, PlatformMessagePage } from '@taskin/contracts';
import { toPersianDigits } from '@taskin/jalali';
import { adminApi, type MessageFilters } from '@/admin/api';
import { useAdmin } from '@/admin/AdminSession';
import { CONVERSATION_KINDS, CONVERSATION_ROLES } from '@/admin/format';
import { useAdminLoad } from '@/admin/use-admin-load';
import { problemMessage } from '@/api/messages';
import { Loaded, PageHeader, Panel } from '@/components/admin/AdminUi';
import { MessageItem } from '@/components/admin/MessageItem';
import { Badge, Button, Input, Select } from '@/components/ui';
import { ArrowRightIcon, FilterIcon } from '@/components/icons';

interface FilterDraft {
  readonly from: string;
  readonly to: string;
  readonly type: '' | 'text' | 'voice' | 'image' | 'file';
  readonly senderId: string;
}

const NO_FILTERS: FilterDraft = { from: '', to: '', type: '', senderId: '' };

/** `YYYY-MM-DD` (the date input's value, local calendar) → the instant that day starts here. */
const dayStart = (value: string) => (value ? new Date(`${value}T00:00:00`).toISOString() : undefined);
const dayAfter = (value: string) => {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
};

/** One conversation: its members and its messages, newest page first, with filters. */
export default function AdminConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const targetUserId = useSearchParams().get('targetUserId');
  const { call } = useAdmin();
  const [draft, setDraft] = useState<FilterDraft>(NO_FILTERS);
  const [applied, setApplied] = useState<FilterDraft>(NO_FILTERS);
  const [older, setOlder] = useState<PlatformMessagePage[]>([]);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const filters: MessageFilters = {
    from: dayStart(applied.from),
    to: dayAfter(applied.to),
    type: applied.type,
    senderId: applied.senderId || undefined,
    targetUserId,
  };
  const detail = useAdminLoad(conversationId, () => adminApi.conversation(conversationId, targetUserId));
  const page = useAdminLoad(`${conversationId}:${JSON.stringify(applied)}`, () => adminApi.messages(conversationId, filters));

  const onFilter = (event: FormEvent) => {
    event.preventDefault();
    setOlder([]);
    setApplied(draft);
    if (JSON.stringify(draft) === JSON.stringify(applied)) page.reload();
  };

  const oldestPage = older.at(-1) ?? page.data;
  const loadOlder = async () => {
    if (!oldestPage?.olderBeforeSeq) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const next = await call(() => adminApi.messages(conversationId, { ...filters, beforeSeq: oldestPage.olderBeforeSeq }));
      setOlder((current) => [...current, next]);
    } catch (error) {
      setOlderError(problemMessage(error));
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <>
      <Link
        href={targetUserId ? `/admin/users/${targetUserId}#conversations` : '/admin/conversations'}
        className="mb-3 inline-flex items-center gap-1 text-body-sm text-fg-tertiary hover:text-fg-primary"
      >
        <ArrowRightIcon size={16} />
        {targetUserId ? 'پروفایل کاربر' : 'رصد پیام‌ها و گروه‌ها'}
      </Link>
      <Loaded load={detail}>
        {(conversation) => (
          <>
            <PageHeader
              title={conversation.title}
              description={`${CONVERSATION_KINDS[conversation.kind]} در ${conversation.workspaceName}${conversation.projectName ? ` — پروژه ${conversation.projectName}` : ''} · ${toPersianDigits(conversation.messageCount)} پیام`}
            />
            <Panel title={`اعضا (${toPersianDigits(conversation.memberCount)})`}>
              <ul className="flex flex-wrap gap-2">
                {conversation.members.map((member) => (
                  <li key={member.userId}>
                    <Link href={`/admin/users/${member.userId}`} className="inline-flex items-center gap-1 rounded-full border border-secondary px-3 py-1 text-body-sm hover:bg-hover">
                      {member.fullName}
                      <span className="text-caption text-fg-tertiary">· {CONVERSATION_ROLES[member.role] ?? member.role}</span>
                      {member.leftAt && (
                        <Badge tone="neutral" size="sm">
                          خارج‌شده
                        </Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="پیام‌ها">
              <form onSubmit={onFilter} aria-label="فیلتر پیام‌ها" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Input label="از تاریخ" type="date" dir="ltr" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
                <Input label="تا تاریخ" type="date" dir="ltr" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
                <Select
                  label="نوع پیام"
                  hideLabel={false}
                  value={draft.type || 'any'}
                  onValueChange={(value) => setDraft({ ...draft, type: value === 'any' ? '' : value })}
                  options={[
                    { value: 'any', label: 'همه' },
                    { value: 'text', label: 'متن' },
                    { value: 'voice', label: 'پیام صوتی' },
                    { value: 'image', label: 'تصویر' },
                    { value: 'file', label: 'فایل' },
                  ]}
                />
                <Select
                  label="فرستنده"
                  hideLabel={false}
                  value={draft.senderId || 'any'}
                  onValueChange={(value) => setDraft({ ...draft, senderId: value === 'any' ? '' : value })}
                  options={[{ value: 'any', label: 'همه' }, ...conversation.members.map((member) => ({ value: member.userId, label: member.fullName }))]}
                />
                <div className="flex items-end gap-2">
                  <Button type="submit" iconStart={<FilterIcon size={16} />}>
                    اعمال فیلتر
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setDraft(NO_FILTERS);
                      setOlder([]);
                      setApplied(NO_FILTERS);
                    }}
                  >
                    حذف فیلترها
                  </Button>
                </div>
              </form>
              <Loaded load={page} empty={(data) => data.items.length === 0}>
                {(latest) => {
                  const pages = [...older].reverse().concat(latest);
                  const authors = Object.assign({}, ...pages.map((entry) => entry.authors)) as Record<string, string>;
                  const messages: MessageView[] = pages.flatMap((entry) => entry.items);
                  return (
                    <>
                      {oldestPage?.olderBeforeSeq && (
                        <div className="mb-3 flex justify-center">
                          <Button variant="secondary" size="sm" loading={loadingOlder} onClick={() => void loadOlder()}>
                            پیام‌های قدیمی‌تر
                          </Button>
                        </div>
                      )}
                      {olderError && (
                        <p role="alert" className="mb-3 text-caption text-status-blocked">
                          {olderError}
                        </p>
                      )}
                      <ol aria-label="پیام‌های گفتگو" className="flex flex-col gap-2">
                        {messages.map((message) => (
                          <MessageItem key={message.id} message={message} authors={authors} targetUserId={targetUserId} />
                        ))}
                      </ol>
                    </>
                  );
                }}
              </Loaded>
            </Panel>
          </>
        )}
      </Loaded>
    </>
  );
}

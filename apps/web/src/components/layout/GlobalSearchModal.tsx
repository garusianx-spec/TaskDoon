'use client';

import { useMemo, useState } from 'react';
import type { Conversation, Message, Task } from '@taskin/contracts';
import { statusLabel, statusTone } from '@/data/reference';
import { formatJalali } from '@taskin/jalali';
import { truncate } from '@/lib/format';
import { messagePreview, userById } from '@/store/selectors';
import { Badge, Input, Modal } from '@/components/ui';
import { HashIcon, MessagesIcon, SearchIcon, TaskSquareIcon } from '@/components/icons';

export interface GlobalSearchModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly tasks: readonly Task[];
  readonly conversations: readonly Conversation[];
  readonly messages: readonly Message[];
  readonly onOpenTask: (taskId: string) => void;
  readonly onOpenConversation: (conversationId: string) => void;
}

const RESULT_LIMIT = 6;

/** Cross-module search over tasks, conversations and message bodies. */
export function GlobalSearchModal({
  open,
  onClose,
  tasks,
  conversations,
  messages,
  onOpenTask,
  onOpenConversation,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const normalised = query.trim().toLowerCase();

  const taskResults = useMemo(
    () =>
      normalised
        ? tasks
            .filter((task) =>
              `${task.title} ${task.code} ${task.description}`.toLowerCase().includes(normalised),
            )
            .slice(0, RESULT_LIMIT)
        : [],
    [tasks, normalised],
  );

  const conversationResults = useMemo(
    () =>
      normalised
        ? conversations
            .filter((conversation) =>
              `${conversation.title} ${conversation.topic}`.toLowerCase().includes(normalised),
            )
            .slice(0, RESULT_LIMIT)
        : [],
    [conversations, normalised],
  );

  const messageResults = useMemo(
    () =>
      normalised
        ? messages
            .filter((message) => messagePreview(message).toLowerCase().includes(normalised))
            .slice(-RESULT_LIMIT)
            .reverse()
        : [],
    [messages, normalised],
  );

  const empty =
    normalised.length > 0 &&
    taskResults.length === 0 &&
    conversationResults.length === 0 &&
    messageResults.length === 0;

  return (
    <Modal open={open} onClose={onClose} size="md" title="جستجوی سراسری" description="در وظایف، گفتگوها و پیام‌ها جستجو کنید.">
      <div className="flex flex-col gap-4">
        <Input
          label="عبارت جستجو"
          hideLabel
          data-autofocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="نام وظیفه، کانال یا متن پیام…"
          iconStart={<SearchIcon size={18} />}
        />

        {normalised.length === 0 && (
          <p className="py-6 text-center text-body-sm text-fg-tertiary">
            برای شروع، عبارتی را تایپ کنید.
          </p>
        )}

        {empty && (
          <p className="py-6 text-center text-body-sm text-fg-tertiary">
            نتیجه‌ای برای «{query}» یافت نشد.
          </p>
        )}

        {taskResults.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
              وظایف
            </h3>
            <ul className="flex flex-col gap-1">
              {taskResults.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-hover"
                  >
                    <TaskSquareIcon size={18} className="shrink-0 text-fg-quaternary" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-sm font-medium text-fg-primary">{task.title}</span>
                      <span className="numeric truncate text-micro text-fg-tertiary">
                        {`${task.code}، ${formatJalali(task.dueDate, 'medium')}`}
                      </span>
                    </span>
                    <Badge tone={statusTone(task.status)} size="sm" dot>
                      {statusLabel(task.status)}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {conversationResults.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
              گفتگوها
            </h3>
            <ul className="flex flex-col gap-1">
              {conversationResults.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onOpenConversation(conversation.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-hover"
                  >
                    {conversation.kind === 'channel' ? (
                      <HashIcon size={18} className="shrink-0 text-fg-quaternary" />
                    ) : (
                      <MessagesIcon size={18} className="shrink-0 text-fg-quaternary" />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-sm font-medium text-fg-primary">
                        {conversation.title}
                      </span>
                      <span className="truncate text-micro text-fg-tertiary">{conversation.topic}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {messageResults.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
              پیام‌ها
            </h3>
            <ul className="flex flex-col gap-1">
              {messageResults.map((message) => {
                const author = userById(message.authorId);
                const conversation = conversations.find((entry) => entry.id === message.conversationId);
                return (
                  <li key={message.id}>
                    <button
                      type="button"
                      onClick={() => onOpenConversation(message.conversationId)}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-hover"
                    >
                      <MessagesIcon size={18} className="mt-0.5 shrink-0 text-fg-quaternary" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body-sm text-fg-primary">
                          {truncate(messagePreview(message), 70)}
                        </span>
                        <span className="numeric truncate text-micro text-fg-tertiary">
                          {`${author?.fullName ?? ''}، ${conversation?.title ?? ''}، ${formatJalali(message.sentAt, 'day-month')}`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}

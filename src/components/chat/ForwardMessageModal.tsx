'use client';

import { useMemo, useState } from 'react';
import type { ForwardTarget, ForwardTargetKind, Message } from '@/types';
import { CONVERSATIONS, PROJECTS } from '@/data/workspace';
import { cn } from '@/lib/cn';
import { truncate } from '@/lib/format';
import { toPersianDigits } from '@/lib/jalali';
import { messagePreview, userById } from '@/store/selectors';
import { Avatar, Badge, Button, Checkbox, Input, Modal, SegmentedControl } from '@/components/ui';
import { HashIcon, MessagesIcon, ReplyIcon, SearchIcon, TaskSquareIcon } from '@/components/icons';

export interface ForwardMessageModalProps {
  readonly message: Message | null;
  readonly onClose: () => void;
  readonly onForward: (targets: readonly ForwardTarget[]) => void;
  /** Conversation the message currently lives in — excluded from the destination list. */
  readonly currentConversationId: string;
}

type FilterId = 'all' | ForwardTargetKind;

const FILTERS: ReadonlyArray<{ readonly id: FilterId; readonly label: string }> = [
  { id: 'all', label: 'همه' },
  { id: 'direct', label: 'گفتگوی شخصی' },
  { id: 'channel', label: 'کانال‌ها' },
  { id: 'board', label: 'بوردها' },
];

const KIND_LABELS: Readonly<Record<ForwardTargetKind, string>> = {
  direct: 'گفتگوی شخصی',
  channel: 'کانال تیمی',
  board: 'بورد پروژه',
};

/**
 * Destination picker for "فوروارد به…".
 *
 * Direct messages, team channels and project boards are one searchable list because that is
 * how people actually think about "where do I send this". Selecting a board is not a typo:
 * the reducer turns a board target into a task rather than a message.
 */
export function ForwardMessageModal({
  message,
  onClose,
  onForward,
  currentConversationId,
}: ForwardMessageModalProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);

  const targets = useMemo<readonly ForwardTarget[]>(() => {
    const conversations: ForwardTarget[] = CONVERSATIONS.filter(
      (conversation) => conversation.id !== currentConversationId,
    ).map((conversation) => ({
      id: conversation.id,
      kind: conversation.kind === 'direct' ? 'direct' : 'channel',
      title: conversation.title,
      subtitle:
        conversation.kind === 'direct'
          ? KIND_LABELS.direct
          : `${toPersianDigits(conversation.memberIds.length)} عضو`,
      tone: conversation.tone,
      initials:
        conversation.kind === 'direct'
          ? (userById(conversation.memberIds.find((id) => id !== 'u-sahar') ?? '')?.initials ?? 'گ')
          : conversation.title.slice(0, 2),
    }));

    const boards: ForwardTarget[] = PROJECTS.map((project) => ({
      id: project.id,
      kind: 'board',
      title: project.name,
      subtitle: 'ایجاد وظیفه در این بورد',
      tone: project.color,
      initials: project.name.slice(0, 2),
    }));

    return [...conversations, ...boards];
  }, [currentConversationId]);

  const visible = useMemo(() => {
    const normalised = query.trim().toLowerCase();
    return targets.filter((target) => {
      if (filter !== 'all' && target.kind !== filter) return false;
      if (!normalised) return true;
      return `${target.title} ${target.subtitle}`.toLowerCase().includes(normalised);
    });
  }, [targets, query, filter]);

  const selected = useMemo(
    () => targets.filter((target) => selectedIds.includes(target.id)),
    [targets, selectedIds],
  );

  const toggle = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );

  const close = () => {
    setSelectedIds([]);
    setQuery('');
    setFilter('all');
    onClose();
  };

  if (!message) return null;

  const author = userById(message.authorId);

  return (
    <Modal
      open
      onClose={close}
      size="md"
      title="فوروارد پیام"
      description="مقصدهای موردنظر را انتخاب کنید. می‌توانید هم‌زمان به چند گفتگو یا بورد ارسال کنید."
      icon={<ReplyIcon size={20} />}
      footer={
        <>
          {selected.length > 0 && (
            <Badge tone="brand" size="md" numeric className="me-auto">
              {`${toPersianDigits(selected.length)} مقصد انتخاب شد`}
            </Badge>
          )}
          <Button variant="secondary" onClick={close}>
            انصراف
          </Button>
          <Button
            disabled={selected.length === 0}
            onClick={() => {
              onForward(selected);
              close();
            }}
          >
            ارسال
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-secondary bg-sunken p-3">
          <p className="mb-1 text-micro font-semibold text-fg-tertiary">پیام در حال ارسال</p>
          <p className="text-body-sm leading-6 text-fg-primary">
            {truncate(messagePreview(message), 140)}
          </p>
          {author && (
            <p className="mt-1 text-micro text-fg-tertiary">{`نویسنده اصلی: ${author.fullName}`}</p>
          )}
        </div>

        <Input
          label="جستجوی مقصد"
          hideLabel
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="جستجوی نام همکار، کانال یا بورد…"
          iconStart={<SearchIcon size={18} />}
        />

        <SegmentedControl
          ariaLabel="نوع مقصد"
          fullWidth
          value={filter}
          onValueChange={setFilter}
          options={FILTERS.map((entry) => ({ value: entry.id, label: entry.label }))}
        />

        {visible.length === 0 ? (
          <p className="py-8 text-center text-body-sm text-fg-tertiary">
            مقصدی با این مشخصات پیدا نشد.
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto scrollbar-thin" role="listbox" aria-multiselectable="true" aria-label="مقصدهای فوروارد">
            {visible.map((target) => {
              const isSelected = selectedIds.includes(target.id);
              return (
                <li key={target.id} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => toggle(target.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-start transition-colors',
                      isSelected
                        ? 'border-brand bg-brand-subtle'
                        : 'border-transparent hover:border-secondary hover:bg-hover',
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(target.id)}
                      ariaLabel={target.title}
                      size="sm"
                    />
                    {target.kind === 'channel' ? (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-fg-secondary">
                        <HashIcon size={18} variant="twotone" />
                      </span>
                    ) : target.kind === 'board' ? (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-fg-brand">
                        <TaskSquareIcon size={18} variant="twotone" />
                      </span>
                    ) : (
                      <Avatar
                        name={target.title}
                        initials={target.initials}
                        tone={target.tone}
                        size="md"
                        decorative
                      />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-sm font-semibold text-fg-primary">
                        {target.title}
                      </span>
                      <span className="numeric truncate text-micro text-fg-tertiary">
                        {target.subtitle}
                      </span>
                    </span>
                    {target.kind === 'board' && (
                      <Badge tone="review" size="sm">
                        وظیفه
                      </Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="flex items-start gap-1.5 text-micro leading-5 text-fg-tertiary">
          <MessagesIcon size={14} className="mt-0.5 shrink-0" />
          ارسال به یک بورد، به‌جای پیام یک وظیفه جدید با متن و پیوست همین پیام می‌سازد.
        </p>
      </div>
    </Modal>
  );
}

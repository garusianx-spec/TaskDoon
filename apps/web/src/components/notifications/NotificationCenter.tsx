'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { AppNotification, NotificationEvent, NotificationFilterId } from '@taskin/contracts';
import { NOTIFICATION_FILTERS, statusLabel, statusTone } from '@/data/reference';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { formatDateDivider, parseISODate, toISODate } from '@taskin/jalali';
import { filterNotifications, isMentionNotification, userById } from '@/store/selectors';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  IconButton,
  RelativeTime,
  SegmentedControl,
  SlideOver,
} from '@/components/ui';
import {
  ArrowLeftIcon,
  CheckIcon,
  DoubleCheckIcon,
  MessagesIcon,
  NotificationIcon,
  RefreshIcon,
  ReplyIcon,
  TaskSquareIcon,
} from '@/components/icons';

export interface NotificationCenterProps {
  readonly open: boolean;
  readonly notifications: readonly AppNotification[];
  readonly onClose: () => void;
  readonly onMarkRead: (notificationId: string) => void;
  readonly onMarkAllRead: () => void;
  /** Marks the notification read and navigates to the task or conversation it is about. */
  readonly onOpenTarget: (notification: AppNotification) => void;
}

const EVENT_ICONS: Readonly<Record<NotificationEvent['kind'], typeof TaskSquareIcon>> = {
  'task-assigned': TaskSquareIcon,
  'status-changed': RefreshIcon,
  comment: MessagesIcon,
  mention: MessagesIcon,
  reply: ReplyIcon,
};

/** Narrower views the quick actions open on top of the tabs. */
type QuickView = 'mentioned-messages' | 'assigned-today';

const EMPTY_COPY: Readonly<Record<NotificationFilterId | QuickView, { readonly title: string; readonly description: string }>> = {
  all: { title: 'اعلانی ندارید', description: 'ارجاع وظایف، تغییر وضعیت‌ها و اشاره‌ها اینجا نمایش داده می‌شوند.' },
  unread: { title: 'همه اعلان‌ها را خوانده‌اید', description: 'اعلان تازه‌ای در انتظار شما نیست.' },
  mentions: { title: 'اشاره‌ای در کار نیست', description: 'وقتی کسی به شما اشاره کند یا به دیدگاهتان پاسخ دهد، اینجا می‌بینید.' },
  'mentioned-messages': { title: 'پیامی با اشاره به شما نیست', description: 'وقتی کسی در گفتگو از شما نام ببرد، پیامش اینجا می‌آید.' },
  'assigned-today': { title: 'امروز وظیفه‌ای به شما ارجاع نشده', description: 'وظایفی که امروز به شما سپرده شود، اینجا نمایش داده می‌شود.' },
};

const QUICK_VIEWS: ReadonlyArray<{ readonly id: QuickView; readonly label: string; readonly icon: ReactNode }> = [
  { id: 'mentioned-messages', label: 'پیام‌های اشاره‌شده', icon: <MessagesIcon size={14} /> },
  { id: 'assigned-today', label: 'وظایف ارجاع‌شده امروز', icon: <TaskSquareIcon size={14} /> },
];

function inQuickView(notification: AppNotification, view: QuickView, today: string): boolean {
  if (view === 'mentioned-messages') return notification.event.kind === 'mention' && notification.target.kind === 'conversation';
  return notification.event.kind === 'task-assigned' && toISODate(parseISODate(notification.createdAt)) === today;
}

/**
 * Notification centre: a drawer beside the rail with All / Unread / Mentions tabs. Each
 * card names who did what, where, and when (relative Jalali time); the card opens its task
 * or conversation, and a separate control marks it read without navigating away.
 */
export function NotificationCenter({
  open,
  notifications,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onOpenTarget,
}: NotificationCenterProps) {
  const [filter, setFilter] = useState<NotificationFilterId>('all');
  const [quick, setQuick] = useState<QuickView | null>(null);
  // The drawer only renders on the client once opened, so "today" never differs from the server's.
  const today = toISODate(new Date());

  useResetOnOpen(open, () => {
    setFilter('all');
    setQuick(null);
  });

  const counts = useMemo(
    () => ({
      all: notifications.length,
      unread: notifications.filter((notification) => !notification.read).length,
      mentions: notifications.filter(isMentionNotification).length,
    }),
    [notifications],
  );

  const quickCounts = useMemo(
    () =>
      Object.fromEntries(
        QUICK_VIEWS.map(({ id }) => [id, notifications.filter((notification) => !notification.read && inQuickView(notification, id, today)).length]),
      ) as Record<QuickView, number>,
    [notifications, today],
  );

  const visible = useMemo(() => {
    const filtered = filterNotifications(notifications, filter);
    return quick ? filtered.filter((notification) => inQuickView(notification, quick, today)) : filtered;
  }, [notifications, filter, quick, today]);

  // Bucket by local day so the list reads "امروز / دیروز / …" like the chat dividers.
  const groups = useMemo(() => {
    const buckets: Array<{ readonly day: string; readonly label: string; readonly items: AppNotification[] }> = [];
    for (const notification of visible) {
      const day = toISODate(parseISODate(notification.createdAt));
      const last = buckets[buckets.length - 1];
      if (last && last.day === day) last.items.push(notification);
      else buckets.push({ day, label: formatDateDivider(notification.createdAt), items: [notification] });
    }
    return buckets;
  }, [visible]);

  const empty = EMPTY_COPY[quick ?? filter];

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="اعلان‌ها"
      description={
        counts.unread > 0 ? `${formatCount(counts.unread)} اعلان خوانده‌نشده` : 'همه اعلان‌ها خوانده شده‌اند'
      }
      toolbar={
        <div className="flex flex-col gap-3">
          <SegmentedControl
            ariaLabel="فیلتر اعلان‌ها"
            fullWidth
            value={filter}
            onValueChange={(next) => {
              setFilter(next);
              setQuick(null);
            }}
            options={NOTIFICATION_FILTERS.map((entry) => ({
              value: entry.id,
              label: entry.label,
              ...(counts[entry.id] > 0 ? { count: formatCount(counts[entry.id]) } : {}),
            }))}
          />
          <div role="group" aria-label="دسترسی سریع" className="flex flex-wrap items-center gap-2">
            {QUICK_VIEWS.map((view) => {
              const pressed = quick === view.id;
              const count = quickCounts[view.id];
              return (
                <button
                  key={view.id}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => {
                    setFilter('all');
                    setQuick(pressed ? null : view.id);
                  }}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-caption font-medium transition-colors',
                    pressed
                      ? 'border-brand bg-brand-subtle text-fg-brand'
                      : 'border-secondary text-fg-secondary hover:bg-hover',
                  )}
                >
                  {view.icon}
                  {view.label}
                  {count > 0 && (
                    <span className="numeric rounded-full bg-brand-solid px-1.5 text-micro font-semibold text-fg-on-brand">
                      {formatCount(count)}
                    </span>
                  )}
                </button>
              );
            })}
            <Button
              variant="link"
              className="ms-auto text-caption"
              iconStart={<DoubleCheckIcon size={16} />}
              disabled={counts.unread === 0}
              onClick={onMarkAllRead}
            >
              علامت‌گذاری همه به‌عنوان خوانده‌شده
            </Button>
          </div>
        </div>
      }
    >
      {visible.length === 0 ? (
        <EmptyState icon={<NotificationIcon size={24} />} title={empty.title} description={empty.description} />
      ) : (
        <div className="flex flex-col pb-3">
          {groups.map((group) => (
            <section key={group.day} aria-label={group.label}>
              <h3 className="sticky top-0 z-10 bg-surface/95 px-4 pb-1 pt-3 text-micro font-semibold text-fg-quaternary backdrop-blur">
                {group.label}
              </h3>
              <ul className="flex flex-col gap-1 px-2">
                {group.items.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    onOpen={() => onOpenTarget(notification)}
                    onMarkRead={() => onMarkRead(notification.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </SlideOver>
  );
}

interface NotificationCardProps {
  readonly notification: AppNotification;
  readonly onOpen: () => void;
  readonly onMarkRead: () => void;
}

function NotificationCard({ notification, onOpen, onMarkRead }: NotificationCardProps) {
  const actor = userById(notification.actorId);
  const actorName = actor?.fullName ?? 'یک همکار';
  const { event } = notification;
  const Icon = EVENT_ICONS[event.kind];
  const targetLabel = notification.target.kind === 'task' ? 'وظیفه' : 'گفتگو';

  return (
    <li
      className={cn(
        'group/card relative flex items-start gap-1 rounded-xl transition-colors',
        notification.read ? 'hover:bg-hover' : 'bg-brand-subtle/60 hover:bg-brand-subtle',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-3 text-start"
      >
        {!notification.read && <span className="sr-only">خوانده‌نشده: </span>}
        <span className="relative shrink-0">
          {actor ? (
            <Avatar name={actor.fullName} initials={actor.initials} tone={actor.avatarTone} size="md" decorative />
          ) : (
            <span className="flex size-10 items-center justify-center rounded-full bg-sunken text-fg-tertiary">
              <NotificationIcon size={18} />
            </span>
          )}
          <span className="absolute -bottom-0.5 -end-0.5 flex size-5 items-center justify-center rounded-full bg-surface text-fg-tertiary ring-2 ring-surface">
            <Icon size={13} />
          </span>
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-body-sm leading-6 text-fg-secondary">
            <Sentence actorName={actorName} notification={notification} />
          </span>

          {'excerpt' in event && (
            <span className="line-clamp-2 border-s-2 border-secondary ps-2.5 text-caption text-fg-tertiary">
              {event.excerpt}
            </span>
          )}

          {event.kind === 'status-changed' && (
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone={statusTone(event.from)} size="sm">
                {statusLabel(event.from)}
              </Badge>
              <ArrowLeftIcon size={12} className="text-fg-quaternary ltr:rotate-180" aria-hidden="true" />
              <Badge tone={statusTone(event.to)} size="sm" dot>
                {statusLabel(event.to)}
              </Badge>
            </span>
          )}

          <span className="numeric flex items-center gap-1.5 text-micro text-fg-quaternary">
            <RelativeTime iso={notification.createdAt} />
            <span aria-hidden="true">،</span>
            <span>{targetLabel}</span>
          </span>
        </span>
      </button>

      <span className="flex shrink-0 flex-col items-center gap-1 pe-2 pt-3">
        {notification.read ? (
          <span className="flex size-7 items-center justify-center text-fg-disabled" aria-hidden="true">
            <CheckIcon size={14} />
          </span>
        ) : (
          <>
            <span className="size-2 rounded-full bg-brand-solid" aria-hidden="true" />
            <IconButton
              label="علامت‌گذاری به‌عنوان خوانده‌شده"
              icon={<CheckIcon size={15} />}
              size="xs"
              onClick={onMarkRead}
            />
          </>
        )}
      </span>
    </li>
  );
}

/** The visible sentence, with the actor and subject emphasised. */
function Sentence({ actorName, notification }: { readonly actorName: string; readonly notification: AppNotification }) {
  const actor = <strong className="font-semibold text-fg-primary">{actorName}</strong>;
  const subject = <strong className="font-semibold text-fg-primary">{`«${notification.subject}»`}</strong>;
  const { event } = notification;
  let rest: ReactNode;
  switch (event.kind) {
    case 'task-assigned':
      rest = <> وظیفه {subject} را به شما ارجاع داد</>;
      break;
    case 'status-changed':
      rest = <> وضعیت {subject} را تغییر داد</>;
      break;
    case 'comment':
      rest = <> روی {subject} دیدگاه گذاشت</>;
      break;
    case 'mention':
      rest = <> در {subject} به شما اشاره کرد</>;
      break;
    case 'reply':
      rest = <> به دیدگاه شما در {subject} پاسخ داد</>;
      break;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
  return (
    <>
      {actor}
      {rest}
    </>
  );
}

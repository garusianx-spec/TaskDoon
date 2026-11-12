'use client';

import { type ReactNode } from 'react';
import type { AppNotification,NotificationEvent } from '@taskin/contracts';
import { statusLabel,statusTone } from '@/data/reference';
import { cn } from '@/lib/utils';
import { userById } from '@/store/selectors';
import {
Avatar,
Badge,IconButton,
RelativeTime
} from '@/components/ui';
import {
ArrowLeftIcon,
CheckIcon,MessagesIcon,
NotificationIcon,
RefreshIcon,
ReplyIcon,
TaskSquareIcon
} from '@/components/icons';


const EVENT_ICONS: Readonly<Record<NotificationEvent['kind'], typeof TaskSquareIcon>> = {
  'task-assigned': TaskSquareIcon,
  'status-changed': RefreshIcon,
  comment: MessagesIcon,
  mention: MessagesIcon,
  reply: ReplyIcon,
};

interface NotificationCardProps {
  readonly notification: AppNotification;
  readonly onOpen: () => void;
  readonly onMarkRead: () => void;
}

export function NotificationCard({ notification, onOpen, onMarkRead }: NotificationCardProps) {
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

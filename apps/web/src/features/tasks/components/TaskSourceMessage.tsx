'use client';

import { Button } from '@/components/ui';
import { MessagesIcon } from '@/components/icons';
import { type TaskSourceView } from '@/features/tasks/types/inspector';

export function TaskSourceMessage({
  source,
  onOpenSource,
}: {
  readonly source: TaskSourceView;
  readonly onOpenSource: (() => void) | undefined;
}) {
  return (
    <section
      aria-labelledby="task-source-title"
      className="flex flex-col gap-2 rounded-xl border border-secondary bg-sunken p-3"
    >
      <div className="flex items-center gap-2">
        <MessagesIcon size={16} className="text-fg-tertiary" />
        <h3 id="task-source-title" className="text-title-sm font-semibold text-fg-primary">
          پیام مبدأ
        </h3>
        {source.accessible && source.conversationTitle && (
          <span className="truncate text-caption text-fg-tertiary">{`در ${source.conversationTitle}`}</span>
        )}
      </div>
      {!source.accessible ? (
        <p className="text-caption text-fg-tertiary">
          این وظیفه از پیامی در گفتگویی ساخته شده که شما عضو آن نیستید.
        </p>
      ) : source.deleted ? (
        <p className="text-caption text-fg-tertiary">پیام مبدأ حذف شده است.</p>
      ) : (
        <>
          <p className="line-clamp-3 text-body-sm leading-6 text-fg-secondary">
            {source.authorName && (
              <strong className="font-semibold text-fg-primary">{`${source.authorName}: `}</strong>
            )}
            {source.excerpt ?? 'فایل یا پیام صوتی'}
          </p>
          {onOpenSource && (
            <Button
              size="xs"
              variant="secondary"
              className="self-start"
              iconStart={<MessagesIcon size={14} />}
              onClick={onOpenSource}
            >
              نمایش پیام در گفتگو
            </Button>
          )}
        </>
      )}
    </section>
  );
}

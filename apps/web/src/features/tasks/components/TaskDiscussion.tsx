'use client';

import { useState } from 'react';
import type { Task, User } from '@taskin/contracts';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format';
import { userById } from '@/store/selectors';
import { Avatar, IconButton, RelativeTime, Textarea } from '@/components/ui';
import { CloseIcon, MessagesIcon, SendIcon } from '@/components/icons';
import { type TaskInspectorProps } from '@/features/tasks/types/inspector';

export function TaskDiscussion({
  currentUser,
  comments,
  onAddComment,
}: {
  readonly currentUser: User;
  readonly comments: Task['comments'];
  readonly onAddComment: TaskInspectorProps['onAddComment'];
}) {
  const [comment, setComment] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);

  const submitComment = () => {
    const body = comment.trim();
    if (!body) return;
    onAddComment(body, replyToId);
    setComment('');
    setReplyToId(null);
  };

  return (
    <section aria-label="نظرات و گزارش‌ها">
      <div className="mb-2 flex items-center gap-2">
        <MessagesIcon size={16} className="text-fg-tertiary" />
        <h3 className="text-title-sm font-semibold text-fg-primary">نظرات و گزارش‌ها</h3>
        <span className="text-caption text-fg-tertiary numeric">{formatCount(comments.length)}</span>
      </div>
      <p className="mb-3 text-micro text-fg-tertiary">
        دیدگاه‌ها، گزارش پیشرفت و گفتگوی مربوط به وظیفه را در همین بخش بنویسید.
      </p>

      <ul className="flex flex-col gap-3">
        {comments.map((entry) => {
          const author = userById(entry.authorId);
          const parent = entry.replyToId
            ? comments.find((candidate) => candidate.id === entry.replyToId)
            : undefined;
          const parentAuthor = parent ? userById(parent.authorId) : undefined;

          return (
            <li key={entry.id} className={cn('flex gap-2.5', parent && 'ps-6')}>
              {author && (
                <Avatar
                  name={author.fullName}
                  initials={author.initials}
                  tone={author.avatarTone}
                  size="sm"
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-caption font-semibold text-fg-primary">
                    {author?.fullName ?? 'کاربر'}
                  </span>
                  <RelativeTime iso={entry.createdAt} className="text-micro text-fg-quaternary numeric" />
                </div>
                {parentAuthor && (
                  <p className="border-brand-300 border-s-2 ps-2 text-micro text-fg-tertiary">
                    {`در پاسخ به ${parentAuthor.fullName}`}
                  </p>
                )}
                <p className="whitespace-pre-wrap rounded-lg rounded-ss-sm bg-sunken px-3 py-2 text-body-sm leading-6 text-fg-secondary">
                  {entry.body}
                </p>
                <button
                  type="button"
                  onClick={() => setReplyToId(entry.id)}
                  className="self-start text-micro font-semibold text-fg-brand hover:underline"
                >
                  پاسخ
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-col gap-2">
        {replyToId && (
          <div className="flex items-center gap-2 rounded-lg border-s-2 border-brand bg-sunken px-2.5 py-1.5">
            <span className="flex-1 text-micro text-fg-tertiary">در حال پاسخ به یک دیدگاه</span>
            <IconButton
              label="لغو پاسخ"
              icon={<CloseIcon size={14} />}
              size="xs"
              onClick={() => setReplyToId(null)}
            />
          </div>
        )}
        <div className="flex items-end gap-2">
          <Avatar
            name={currentUser.fullName}
            initials={currentUser.initials}
            tone={currentUser.avatarTone}
            size="sm"
            decorative
          />
          <Textarea
            label="نوشتن نظر یا گزارش"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submitComment();
              }
            }}
            placeholder="نظر یا گزارش پیشرفت را بنویسید…  (Ctrl + Enter برای ارسال)"
            className="min-h-10 text-body-sm"
            containerClassName="flex-1"
          />
          <IconButton
            label="ارسال نظر یا گزارش"
            icon={<SendIcon size={18} />}
            variant="primary"
            onClick={submitComment}
            disabled={comment.trim().length === 0}
          />
        </div>
      </div>
    </section>
  );
}

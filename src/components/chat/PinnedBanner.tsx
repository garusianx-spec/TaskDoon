'use client';

import { useState } from 'react';
import type { Message } from '@/types';
import { cn } from '@/lib/cn';
import { truncate } from '@/lib/format';
import { toPersianDigits } from '@/lib/jalali';
import { messagePreview, userById } from '@/store/selectors';
import { IconButton, Tooltip } from '@/components/ui';
import { ChevronDownIcon, CloseIcon, PinIcon } from '@/components/icons';

export interface PinnedBannerProps {
  readonly pinned: readonly Message[];
  readonly onJump: (messageId: string) => void;
  readonly onUnpin: (messageId: string) => void;
  readonly onUnpinAll: () => void;
  /** Only Admin/Owner-level roles see the unpin controls; everyone can jump. */
  readonly canManage: boolean;
}

/**
 * Sticky banner above the message list.
 *
 * With more than one pinned message the banner cycles through them — the same affordance
 * Telegram and Mizito use — rather than stacking and eating the viewport. The rail on the
 * inline-start edge shows which of the pinned messages is in view.
 */
export function PinnedBanner({ pinned, onJump, onUnpin, onUnpinAll, canManage }: PinnedBannerProps) {
  const [index, setIndex] = useState(0);

  if (pinned.length === 0) return null;

  const safeIndex = Math.min(index, pinned.length - 1);
  const current = pinned[safeIndex];
  if (!current) return null;

  const author = userById(current.authorId);
  const cycle = () => setIndex((value) => (value + 1) % pinned.length);

  return (
    <div className="flex shrink-0 items-stretch gap-2 border-b border-secondary bg-brand-subtle/60 px-3 py-2">
      {/* Segment rail: one bar per pinned message, the active one filled. */}
      {pinned.length > 1 && (
        <span className="flex w-0.5 shrink-0 flex-col gap-0.5 py-0.5" aria-hidden="true">
          {pinned.map((message, i) => (
            <span
              key={message.id}
              className={cn(
                'w-full flex-1 rounded-full transition-colors',
                i === safeIndex ? 'bg-brand-600' : 'bg-brand-300',
              )}
            />
          ))}
        </span>
      )}

      <button
        type="button"
        onClick={() => onJump(current.id)}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 text-start transition-colors hover:bg-brand-100/60"
      >
        <PinIcon size={16} className="shrink-0 text-fg-brand" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="text-micro font-semibold text-fg-brand">پیام پین‌شده</span>
            {pinned.length > 1 && (
              <span className="numeric text-micro text-fg-tertiary">
                {`${toPersianDigits(safeIndex + 1)} از ${toPersianDigits(pinned.length)}`}
              </span>
            )}
          </span>
          <span className="truncate text-caption text-fg-secondary">
            {author ? `${author.fullName}: ` : ''}
            {truncate(messagePreview(current), 80)}
          </span>
        </span>
        <span className="shrink-0 rounded-md border border-brand bg-surface px-1.5 py-0.5 text-micro font-semibold text-fg-brand">
          پرش به پیام
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        {pinned.length > 1 && (
          <Tooltip content="پیام پین‌شده بعدی">
            <IconButton
              label="نمایش پیام پین‌شده بعدی"
              icon={<ChevronDownIcon size={16} />}
              size="xs"
              onClick={cycle}
            />
          </Tooltip>
        )}
        {canManage && (
          <>
            <Tooltip content="برداشتن پین این پیام">
              <IconButton
                label="برداشتن پین این پیام"
                icon={<CloseIcon size={16} />}
                size="xs"
                onClick={() => {
                  onUnpin(current.id);
                  setIndex(0);
                }}
              />
            </Tooltip>
            {pinned.length > 1 && (
              <button
                type="button"
                onClick={onUnpinAll}
                className="rounded-md px-1.5 py-1 text-micro font-medium text-fg-tertiary transition-colors hover:bg-hover hover:text-fg-primary"
              >
                برداشتن همه
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import { stamp } from '@/features/chat/lib/shared-media';

import { userById } from '@/store/selectors';
import { EmptyState } from '@/components/shared/EmptyState';
import { LinkIcon } from '@/components/icons';

import type { SharedLinkEntry } from '@/features/chat/types/shared-media';

export function LinksPanel({ links }: { readonly links: readonly SharedLinkEntry[] }) {
  if (links.length === 0) {
    return (
      <EmptyState
        compact
        icon={<LinkIcon size={18} />}
        title="پیوندی به اشتراک گذاشته نشده"
        description="پیوندهایی که در پیام‌ها فرستاده می‌شوند به‌طور خودکار اینجا فهرست می‌شوند."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {links.map(({ message, link }, index) => {
        const sender = userById(message.authorId);
        return (
          <li key={`${message.id}-${index}`}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-lg border border-secondary bg-surface p-2 transition-colors hover:border-brand"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-fg-brand">
                <LinkIcon size={18} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-caption font-semibold text-fg-primary">{link.title}</span>
                <span className="truncate text-micro text-fg-tertiary">
                  {`${link.siteName}، `}
                  <span className="latin-inline">{link.host}</span>
                </span>
                <span className="truncate text-micro text-fg-quaternary numeric">{`${sender?.fullName ?? ''}، ${stamp(message)}`}</span>
              </span>
              <span className="sr-only">(در زبانه جدید باز می‌شود)</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

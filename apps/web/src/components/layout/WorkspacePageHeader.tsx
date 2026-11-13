import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface WorkspacePageHeaderProps {
  readonly title: string;
  readonly backLink?: ReactNode;
  readonly actions?: ReactNode;
  readonly contentClassName?: string;
}

/** Workspace section header with the same typography and divider as the module headers. */
export function WorkspacePageHeader({
  title,
  backLink,
  actions,
  contentClassName,
}: WorkspacePageHeaderProps) {
  return (
    <header className="border-b border-secondary bg-surface">
      <div className={cn('mx-auto flex max-w-2xl flex-col px-4 py-3 sm:px-6 sm:py-4', contentClassName)}>
        {backLink}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="min-w-0 break-words text-heading-sm font-bold text-fg-primary">{title}</h1>
          {actions}
        </div>
      </div>
    </header>
  );
}

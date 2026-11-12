'use client';

import { cn } from '@/lib/utils';
import { ChevronDownIcon } from '@/components/icons';

interface SortableHeaderProps {
  readonly label: string;
  readonly active: boolean;
  readonly ascending: boolean;
  readonly sort: 'ascending' | 'descending' | 'none';
  readonly onClick: () => void;
  readonly className?: string;
}

export function SortableHeader({ label, active, ascending, sort, onClick, className }: SortableHeaderProps) {
  return (
    <th scope="col" aria-sort={sort} className={cn('px-4 py-3 text-start', className)}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-title-sm font-semibold text-fg-secondary transition-colors hover:text-fg-primary"
      >
        {label}
        <ChevronDownIcon
          size={14}
          className={cn(
            'transition-transform',
            active ? 'text-fg-brand' : 'text-fg-quaternary',
            active && !ascending && 'rotate-180',
          )}
        />
      </button>
    </th>
  );
}

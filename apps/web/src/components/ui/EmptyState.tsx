import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly className?: string;
  readonly compact?: boolean;
}

export function EmptyState({ icon, title, description, action, className, compact = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-16',
        className,
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full bg-sunken text-fg-quaternary',
          compact ? 'size-10' : 'size-14',
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <h3 className={cn('font-semibold text-fg-primary', compact ? 'text-body-sm' : 'text-title')}>{title}</h3>
      <p className={cn('max-w-sm text-fg-tertiary', compact ? 'text-caption' : 'text-body-sm')}>{description}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

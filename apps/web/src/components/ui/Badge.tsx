import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'error'
  | 'done'
  | 'progress'
  | 'blocked'
  | 'todo'
  | 'review';

export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly size?: BadgeSize;
  readonly children: ReactNode;
  readonly iconStart?: ReactNode;
  readonly dot?: boolean;
  /** Renders counts/dates with tabular Persian figures. */
  readonly numeric?: boolean;
  readonly className?: string;
}

const TONES: Readonly<Record<BadgeTone, string>> = {
  neutral: 'bg-sunken text-fg-secondary border-secondary',
  brand: 'bg-brand-subtle text-fg-brand border-brand',
  success: 'bg-status-done-subtle text-status-done border-status-done-line',
  warning: 'bg-status-progress-subtle text-status-progress border-status-progress-line',
  error: 'bg-status-blocked-subtle text-status-blocked border-status-blocked-line',
  done: 'bg-status-done-subtle text-status-done border-status-done-line',
  progress: 'bg-status-progress-subtle text-status-progress border-status-progress-line',
  blocked: 'bg-status-blocked-subtle text-status-blocked border-status-blocked-line',
  todo: 'bg-status-todo-subtle text-status-todo border-status-todo-line',
  review: 'bg-status-review-subtle text-status-review border-status-review-line',
};

const DOT_TONES: Readonly<Record<BadgeTone, string>> = {
  neutral: 'bg-gray-400',
  brand: 'bg-brand-500',
  success: 'bg-status-done',
  warning: 'bg-status-progress',
  error: 'bg-status-blocked',
  done: 'bg-status-done',
  progress: 'bg-status-progress',
  blocked: 'bg-status-blocked',
  todo: 'bg-status-todo',
  review: 'bg-status-review',
};

const SIZES: Readonly<Record<BadgeSize, string>> = {
  sm: 'h-5 gap-1 px-1.5 text-micro',
  md: 'h-6 gap-1.5 px-2 text-caption',
};

/** Untitled UI pill badge. 11–12px, Regular 400 weight per the micro-copy scale. */
export function Badge({
  tone = 'neutral',
  size = 'sm',
  children,
  iconStart,
  dot = false,
  numeric = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border font-medium',
        TONES[tone],
        SIZES[size],
        numeric && 'numeric',
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', DOT_TONES[tone])} aria-hidden="true" />}
      {iconStart}
      {children}
    </span>
  );
}

export interface CountPillProps {
  readonly value: string;
  readonly tone?: 'brand' | 'neutral' | 'error';
  readonly className?: string;
}

/** Compact unread/notification counter with tabular Persian digits. */
export function CountPill({ value, tone = 'brand', className }: CountPillProps) {
  const tones: Readonly<Record<'brand' | 'neutral' | 'error', string>> = {
    brand: 'bg-brand-solid text-fg-on-brand',
    neutral: 'bg-gray-500 text-white',
    error: 'bg-error-600 text-white',
  };
  return (
    <span
      className={cn(
        'numeric inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-micro font-semibold leading-none',
        tones[tone],
        className,
      )}
    >
      {value}
    </span>
  );
}

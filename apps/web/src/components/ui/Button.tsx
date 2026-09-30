'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'ghost'
  | 'destructive'
  | 'link';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly iconStart?: ReactNode;
  readonly iconEnd?: ReactNode;
  readonly fullWidth?: boolean;
  readonly loading?: boolean;
  readonly className?: string;
}

const VARIANTS: Readonly<Record<ButtonVariant, string>> = {
  primary:
    'bg-brand-solid text-fg-on-brand border border-transparent shadow-xs hover:bg-brand-solid-hover active:bg-brand-solid-hover disabled:bg-muted disabled:text-fg-disabled disabled:shadow-none',
  secondary:
    'bg-surface text-fg-secondary border border-primary shadow-xs hover:bg-hover hover:text-fg-primary active:bg-active disabled:text-fg-disabled disabled:border-disabled disabled:shadow-none',
  tertiary:
    'bg-brand-subtle text-fg-brand border border-transparent hover:bg-brand-subtle-hover active:bg-brand-subtle-hover disabled:bg-muted disabled:text-fg-disabled',
  ghost:
    'bg-transparent text-fg-tertiary border border-transparent hover:bg-hover hover:text-fg-primary active:bg-active disabled:text-fg-disabled',
  destructive:
    'bg-error-600 text-fg-on-brand border border-transparent shadow-xs hover:bg-error-700 active:bg-error-900 disabled:bg-muted disabled:text-fg-disabled disabled:shadow-none',
  link: 'bg-transparent text-fg-brand border border-transparent underline-offset-4 hover:underline disabled:text-fg-disabled p-0',
};

const SIZES: Readonly<Record<ButtonSize, string>> = {
  xs: 'h-8 gap-1.5 px-2.5 text-caption font-medium rounded-md',
  sm: 'h-9 gap-1.5 px-3 text-body-sm font-semibold rounded-lg',
  md: 'h-10 gap-2 px-3.5 text-body font-semibold rounded-lg',
  lg: 'h-11 gap-2 px-4 text-body font-semibold rounded-xl',
};

/**
 * Untitled UI button. `loading` swaps the leading slot for a spinner and blocks activation
 * without collapsing the button's width, so surrounding layout never jumps.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    iconStart,
    iconEnd,
    fullWidth = false,
    loading = false,
    disabled,
    type = 'button',
    children,
    className,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled === true || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center whitespace-nowrap transition-colors duration-150',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        variant === 'link' ? 'h-auto gap-1 p-0 text-body font-semibold' : SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : iconStart}
      {children}
      {iconEnd}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

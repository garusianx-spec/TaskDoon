'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type IconButtonVariant = 'ghost' | 'secondary' | 'primary' | 'subtle';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  /** Required: an icon-only control must carry its own accessible name. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly size?: IconButtonSize;
  readonly variant?: IconButtonVariant;
  readonly active?: boolean;
  readonly className?: string;
}

const SIZES: Readonly<Record<IconButtonSize, string>> = {
  xs: 'size-7 rounded-md',
  sm: 'size-8 rounded-lg',
  md: 'size-9 rounded-lg',
  lg: 'size-10 rounded-xl',
};

const VARIANTS: Readonly<Record<IconButtonVariant, string>> = {
  ghost: 'text-fg-tertiary hover:bg-hover hover:text-fg-primary active:bg-active',
  subtle: 'bg-sunken text-fg-tertiary hover:bg-hover hover:text-fg-primary',
  secondary: 'border border-primary bg-surface text-fg-secondary shadow-xs hover:bg-hover',
  primary: 'bg-brand-solid text-fg-on-brand shadow-xs hover:bg-brand-solid-hover',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'md', variant = 'ghost', active = false, type = 'button', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      title={label}
      aria-label={label}
      aria-pressed={rest['aria-pressed'] ?? (active ? true : undefined)}
      className={cn(
        'inline-flex items-center justify-center transition-colors duration-150 disabled:cursor-not-allowed disabled:text-fg-disabled',
        SIZES[size],
        VARIANTS[variant],
        active && variant === 'ghost' && 'bg-brand-subtle text-fg-brand',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});

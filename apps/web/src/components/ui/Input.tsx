'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { useNamespacedId } from '@/hooks/useId';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'size'> {
  readonly label?: string;
  readonly hint?: string;
  readonly error?: string;
  readonly iconStart?: ReactNode;
  readonly iconEnd?: ReactNode;
  readonly className?: string;
  readonly containerClassName?: string;
  /** Hides the visual label while keeping it available to screen readers. */
  readonly hideLabel?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, iconStart, iconEnd, className, containerClassName, hideLabel = false, id, ...rest },
  ref,
) {
  const generatedId = useNamespacedId('input-');
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className={cn('text-body-sm font-medium text-fg-secondary', hideLabel && 'sr-only')}>
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {iconStart && (
          <span className="pointer-events-none absolute start-3 flex text-fg-quaternary" aria-hidden="true">
            {iconStart}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            'h-10 w-full rounded-lg border bg-surface text-body text-fg-primary shadow-xs transition-colors',
            'placeholder:text-fg-placeholder',
            'focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-0',
            'disabled:cursor-not-allowed disabled:bg-muted disabled:text-fg-disabled',
            error ? 'border-error-500 focus-visible:ring-error' : 'border-primary',
            iconStart ? 'ps-10' : 'ps-3.5',
            iconEnd ? 'pe-10' : 'pe-3.5',
            className,
          )}
          {...rest}
        />
        {iconEnd && <span className="absolute end-3 flex text-fg-quaternary">{iconEnd}</span>}
      </div>
      {error ? (
        <p id={errorId} className="text-caption text-status-blocked">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-caption text-fg-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  readonly label?: string;
  readonly hint?: string;
  readonly className?: string;
  readonly containerClassName?: string;
  readonly hideLabel?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, className, containerClassName, hideLabel = false, id, ...rest },
  ref,
) {
  const generatedId = useNamespacedId('textarea-');
  const textareaId = id ?? generatedId;
  const hintId = `${textareaId}-hint`;

  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={textareaId} className={cn('text-body-sm font-medium text-fg-secondary', hideLabel && 'sr-only')}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        aria-describedby={hint ? hintId : undefined}
        className={cn(
          'min-h-20 w-full resize-y rounded-lg border border-primary bg-surface px-3.5 py-2.5 text-body leading-6 text-fg-primary shadow-xs transition-colors',
          'placeholder:text-fg-placeholder',
          'focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-0',
          'disabled:cursor-not-allowed disabled:bg-muted disabled:text-fg-disabled',
          className,
        )}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="text-caption text-fg-tertiary">
          {hint}
        </p>
      )}
    </div>
  );
});

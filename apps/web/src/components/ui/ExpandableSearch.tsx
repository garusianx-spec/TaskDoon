'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useNamespacedId } from '@/hooks/useId';
import { CloseIcon, SearchIcon } from '@/components/icons';

export interface ExpandableSearchProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Accessible name of both the toggle and the field. */
  readonly label: string;
  readonly placeholder?: string;
  /** Open, take the container's full width instead of a fixed 14rem (narrow headers). */
  readonly fill?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
}

/**
 * Header search that starts as an icon button and widens into a field on activation.
 * It stays open while it holds a query, collapses when it is left empty, and Escape clears
 * the query and returns focus to the button — so a filter is never hidden while active.
 */
export function ExpandableSearch({
  value,
  onChange,
  label,
  placeholder,
  fill = false,
  onOpenChange,
  className,
}: ExpandableSearchProps) {
  const [expanded, setExpandedState] = useState(value.length > 0);
  const setExpanded = (next: boolean) => {
    setExpandedState(next);
    onOpenChange?.(next || value.length > 0);
  };
  const inputRef = useRef<HTMLInputElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const id = useNamespacedId('search-');
  const open = expanded || value.length > 0;

  const expand = () => {
    setExpanded(true);
    // After the width transition has started, so the caret lands in a visible field.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const collapse = (clear: boolean) => {
    if (clear) onChange('');
    setExpandedState(false);
    onOpenChange?.(!clear && value.length > 0);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  return (
    <div
      role="search"
      className={cn(
        'relative flex h-9 items-center overflow-hidden rounded-lg border transition-[width,border-color,background-color] duration-200 ease-out',
        open
          ? cn(
              fill ? 'w-full' : 'w-56',
              'border-primary bg-surface shadow-xs focus-within:border-brand focus-within:ring-2 focus-within:ring-brand',
            )
          : 'w-9 border-transparent bg-transparent',
        className,
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => (open ? inputRef.current?.focus() : expand())}
        className={cn(
          'absolute inset-y-0 start-0 flex w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
          open ? 'text-fg-quaternary' : 'text-fg-tertiary hover:bg-hover hover:text-fg-primary',
        )}
      >
        <SearchIcon size={18} />
      </button>
      <input
        ref={inputRef}
        id={id}
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        tabIndex={open ? 0 : -1}
        aria-hidden={open ? undefined : true}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (!value) setExpanded(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            collapse(true);
          }
        }}
        className={cn(
          'h-full w-full min-w-0 bg-transparent pe-8 ps-9 text-body-sm text-fg-primary outline-none placeholder:text-fg-placeholder',
          'focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-search-cancel-button]:hidden',
          !open && 'pointer-events-none opacity-0',
        )}
      />
      {value && (
        <button
          type="button"
          aria-label="پاک کردن جستجو"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          className="absolute inset-y-0 end-0 flex w-8 items-center justify-center text-fg-quaternary transition-colors hover:text-fg-secondary"
        >
          <CloseIcon size={14} />
        </button>
      )}
    </div>
  );
}

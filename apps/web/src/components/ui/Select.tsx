'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { useNamespacedId } from '@/hooks/useId';
import { CheckIcon, ChevronDownIcon } from '@/components/icons';

export interface SelectOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface SelectProps<TValue extends string> {
  readonly options: ReadonlyArray<SelectOption<TValue>>;
  readonly value: TValue;
  readonly onValueChange: (value: TValue) => void;
  readonly label: string;
  readonly hideLabel?: boolean;
  readonly placeholder?: string;
  readonly size?: 'sm' | 'md';
  readonly className?: string;
  readonly disabled?: boolean;
}

/**
 * ARIA 1.2 combobox/listbox. Keyboard contract:
 *   Enter / Space / ArrowDown  open the list and focus the active option
 *   ArrowUp / ArrowDown        move the active option
 *   Home / End                 jump to first/last
 *   Enter                      commit, Escape cancels and returns focus to the trigger
 *   printable characters       type-ahead over option labels
 */
export function Select<TValue extends string>({
  options,
  value,
  onValueChange,
  label,
  hideLabel = true,
  placeholder = 'انتخاب کنید',
  size = 'md',
  className,
  disabled = false,
}: SelectProps<TValue>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((option) => option.value === value)),
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const typeAhead = useRef<{ query: string; timer: number | null }>({ query: '', timer: null });

  const id = useNamespacedId('select-');
  const labelId = `${id}-label`;
  const listId = `${id}-list`;

  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);
  const refs = useMemo(() => [triggerRef, listRef], []);
  useOnClickOutside(refs, () => setOpen(false), open);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      onValueChange(option.value);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [options, onValueChange],
  );

  const moveActive = useCallback(
    (delta: number) => {
      setActiveIndex((current) => {
        const total = options.length;
        for (let step = 1; step <= total; step += 1) {
          const next = (current + delta * step + total * total) % total;
          if (!options[next]?.disabled) return next;
        }
        return current;
      });
    },
    [options],
  );

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, activeIndex]);

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
      setOpen(true);
      return;
    }
    if (!open) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(activeIndex);
        break;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default: {
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        const state = typeAhead.current;
        state.query += event.key;
        if (state.timer !== null) window.clearTimeout(state.timer);
        state.timer = window.setTimeout(() => {
          state.query = '';
        }, 600);
        const match = options.findIndex(
          (option) => !option.disabled && option.label.startsWith(state.query),
        );
        if (match !== -1) setActiveIndex(match);
        break;
      }
    }
  };

  return (
    <div className={cn('relative flex w-full flex-col gap-1.5', className)}>
      <span id={labelId} className={cn('text-body-sm font-medium text-fg-secondary', hideLabel && 'sr-only')}>
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={labelId}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-primary bg-surface text-start shadow-xs transition-colors',
          'hover:bg-hover focus-visible:border-brand disabled:cursor-not-allowed disabled:bg-muted disabled:text-fg-disabled',
          size === 'sm' ? 'h-9 px-3 text-body-sm' : 'h-10 px-3.5 text-body',
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
          {selected?.icon}
          <span className={cn('truncate font-medium', selected ? 'text-fg-primary' : 'text-fg-placeholder')}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <ChevronDownIcon
          size={16}
          className={cn('shrink-0 text-fg-quaternary transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          className="surface-floating absolute top-full z-popover mt-1.5 max-h-64 w-full animate-scale-in overflow-y-auto p-1.5 scrollbar-thin"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                data-active={isActive}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm',
                  isActive ? 'bg-hover' : 'bg-transparent',
                  option.disabled && 'cursor-not-allowed text-fg-disabled',
                )}
              >
                {option.icon}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn('truncate font-medium', isSelected ? 'text-fg-brand' : 'text-fg-primary')}>
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="truncate text-micro text-fg-tertiary">{option.description}</span>
                  )}
                </span>
                {isSelected && <CheckIcon size={16} className="shrink-0 text-fg-brand" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

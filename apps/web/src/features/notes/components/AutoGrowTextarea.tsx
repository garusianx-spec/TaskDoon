'use client';

import {
forwardRef,useLayoutEffect,
useRef,type KeyboardEvent
} from 'react';


interface AutoGrowTextareaProps {
  readonly value: string;
  readonly onChange: (field: HTMLTextAreaElement) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onFocus: () => void;
  readonly placeholder: string | undefined;
  readonly compact: boolean;
}

/** A borderless textarea that grows with its content instead of scrolling inside the note. */
export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(function AutoGrowTextarea(
  { value, onChange, onKeyDown, onFocus, placeholder, compact },
  forwardedRef,
) {
  const local = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const field = local.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={(node) => {
        local.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      aria-label="متن یادداشت"
      rows={compact ? 1 : 3}
      value={value}
      placeholder={placeholder}
      onFocus={onFocus}
      onChange={(event) => onChange(event.currentTarget)}
      onKeyDown={onKeyDown}
      className="w-full resize-none overflow-hidden bg-transparent text-body leading-7 text-fg-primary outline-none placeholder:text-fg-placeholder focus-visible:ring-0 focus-visible:ring-offset-0"
    />
  );
});

'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TagTone } from '@taskin/contracts';
import { TAG_TONES } from '@/data/reference';
import { cn } from '@/lib/utils';
import { TAG_DOT } from '@/lib/tag-tone';
import { useNamespacedId } from '@/hooks/useId';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { Button, Input } from '@/components/ui';
import { AddIcon, CheckIcon } from '@/components/icons';

interface AddColumnCardProps {
  readonly existingTitles: readonly string[];
  readonly onAdd: (title: string, tone: TagTone) => void;
  /** Scrolls the board so the column being drafted is fully in view. */
  readonly onOpen: () => void;
}

/**
 * Dashed "+ افزودن ستون جدید" card. Collapsed it is a single button; activated it spawns a
 * column-shaped draft — name plus an accent colour — at the board's far end, scrolls it into
 * view and puts the caret in its name field. Submitting appends the column.
 */
export function AddColumnCard({ existingTitles, onAdd, onOpen }: AddColumnCardProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [tone, setTone] = useState<TagTone>('blue');
  const [error, setError] = useState<string | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const id = useNamespacedId('add-column-');

  useEffect(() => {
    if (!editing) return;
    // Scroll first, then focus without letting the browser jump-scroll instead.
    const frame = requestAnimationFrame(() => {
      onOpen();
      nameRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [editing, onOpen]);
  const { registerItem, onKeyDown } = useRovingFocus(TAG_TONES.length, 'horizontal', {
    onActivate: (index) => {
      const entry = TAG_TONES[index];
      if (entry) setTone(entry.id);
    },
  });

  const reset = () => {
    setEditing(false);
    setTitle('');
    setTone('blue');
    setError(undefined);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = title.trim();
    if (!name) {
      setError('نام ستون را وارد کنید.');
      return;
    }
    if (existingTitles.some((existing) => existing.trim() === name)) {
      setError('ستونی با این نام وجود دارد.');
      return;
    }
    onAdd(name, tone);
    reset();
  };

  if (!editing) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          'flex w-36 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary px-3 text-center',
          'text-body-sm font-semibold text-fg-tertiary transition-colors',
          'hover:border-brand hover:bg-brand-subtle/40 hover:text-fg-brand',
        )}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-sunken" aria-hidden="true">
          <AddIcon size={20} />
        </span>
        افزودن ستون جدید
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          reset();
        }
      }}
      aria-labelledby={`${id}-title`}
      className="flex w-72 shrink-0 animate-scale-in flex-col gap-3 rounded-2xl border-2 border-dashed border-brand bg-surface p-3 shadow-xs"
    >
      <h3 id={`${id}-title`} className="text-title-sm font-semibold text-fg-primary">
        ستون جدید
      </h3>
      <Input
        ref={nameRef}
        label="نام ستون"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          setError(undefined);
        }}
        placeholder="مثلاً: تست کیفیت"
        error={error}
        maxLength={32}
      />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-body-sm font-medium text-fg-secondary">رنگ شاخص</legend>
        <div
          role="radiogroup"
          aria-label="رنگ شاخص ستون"
          onKeyDown={onKeyDown}
          className="flex flex-wrap gap-1.5"
        >
          {TAG_TONES.map((entry, index) => {
            const selected = entry.id === tone;
            return (
              <button
                key={entry.id}
                ref={registerItem(index)}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={entry.label}
                title={entry.label}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTone(entry.id)}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-surface transition-shadow',
                  TAG_DOT[entry.id],
                  selected ? 'ring-2 ring-brand' : 'hover:ring-2 hover:ring-gray-300',
                )}
              >
                {selected && <CheckIcon size={14} />}
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="text-micro text-fg-tertiary">
        کارت‌های این ستون در فیلترها و گزارش‌ها «در حال انجام» شمرده می‌شوند.
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" fullWidth iconStart={<AddIcon size={16} />}>
          افزودن ستون
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={reset}>
          انصراف
        </Button>
      </div>
    </form>
  );
}

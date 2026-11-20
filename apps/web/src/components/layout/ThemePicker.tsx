'use client';

import type { AccentDescriptor, AccentId } from '@taskin/contracts';
import { ACCENTS } from '@/lib/theme';
import { useTheme } from '@/components/theme/ThemeProvider';
import { cn } from '@/lib/utils';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { Badge, Button, Checkbox } from '@/components/ui';
import { CheckIcon } from '@/components/icons';

/**
 * Theme controls shared by the desktop popover and the two settings screens.
 *
 * Six brand palettes × OLED-dark. The preview row at the bottom is painted with the
 * live semantic tokens, so it shows the accessible text/fill steps the palette actually
 * resolves to — not just its swatch.
 */
export function ThemePicker({
  className,
  section = 'all',
}: {
  readonly className?: string;
  readonly section?: 'all' | 'mode' | 'accent';
}) {
  const { theme, resolvedMode, setAccent } = useTheme();
  const accents = useRovingFocus(ACCENTS.length, 'horizontal', {
    onActivate: (index) => {
      const accent = ACCENTS[index];
      if (accent) setAccent(accent.id);
    },
  });

  if (section === 'mode') {
    return null;
  }

  return (
    <div className={cn('flex w-80 flex-col gap-4 p-1', className)}>


      <section className="flex flex-col gap-2">
        <h3 className="px-1 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
          پالت برند سازمان
        </h3>
        <div
          role="radiogroup"
          aria-label="پالت برند سازمان"
          onKeyDown={accents.onKeyDown}
          className="grid grid-cols-2 gap-1.5"
        >
          {ACCENTS.map((accent, index) => (
            <AccentCard
              key={accent.id}
              accent={accent}
              selected={theme.accent === accent.id}
              registerRef={accents.registerItem(index)}
              onSelect={setAccent}
            />
          ))}
        </div>
      </section>

      <section aria-label="پیش‌نمایش پوسته" className="flex flex-col gap-2">
        <h3 className="px-1 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
          {`پیش‌نمایش، ${resolvedMode === 'dark' ? 'حالت تیره' : 'حالت روشن'}`}
        </h3>
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border border-secondary bg-canvas p-2.5"
          aria-hidden="true"
        >
          <Button size="xs" tabIndex={-1}>
            دکمه اصلی
          </Button>
          <Badge tone="brand" size="sm">
            برچسب
          </Badge>
          <span className="text-caption font-semibold text-fg-brand">پیوند متنی</span>
          <Checkbox
            checked
            onCheckedChange={() => undefined}
            size="sm"
            ariaLabel="نمونه"
            className="pointer-events-none"
          />
        </div>
      </section>
    </div>
  );
}

interface AccentCardProps {
  readonly accent: AccentDescriptor;
  readonly selected: boolean;
  readonly registerRef: (node: HTMLElement | null) => void;
  readonly onSelect: (accent: AccentId) => void;
}

function AccentCard({ accent, selected, registerRef, onSelect }: AccentCardProps) {
  return (
    <button
      ref={registerRef}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${accent.name}، ${accent.subtitle}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(accent.id)}
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-2 text-start transition-colors',
        selected ? 'border-brand bg-brand-subtle' : 'border-secondary bg-surface hover:bg-hover',
      )}
    >
      <span className="flex h-6 overflow-hidden rounded-md ring-1 ring-inset ring-black/5" aria-hidden="true">
        {accent.swatch.map((color) => (
          <span key={color} className="flex-1" style={{ backgroundColor: color }} />
        ))}
      </span>
      <span className="flex items-center gap-1">
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              'truncate text-caption font-semibold',
              selected ? 'text-fg-brand' : 'text-fg-primary',
            )}
          >
            {accent.name}
          </span>
          <span className="truncate text-micro text-fg-tertiary">
            {accent.subtitle} <span className="latin-inline">{accent.primaryHex}</span>
          </span>
        </span>
        {selected && <CheckIcon size={14} className="shrink-0 text-fg-brand" />}
      </span>
    </button>
  );
}

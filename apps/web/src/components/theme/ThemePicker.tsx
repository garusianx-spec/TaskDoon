'use client';

import type { AccentDescriptor, AccentId, ThemeMode } from '@taskin/contracts';
import { ACCENTS, THEME_MODES } from '@/lib/theme';
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/cn';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { Badge, Button, Checkbox } from '@/components/ui';
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from '@/components/icons';

const MODE_ICONS: Readonly<Record<ThemeMode, typeof SunIcon>> = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
};

/**
 * Theme picker body. Rendered inside the rail popover on desktop and inside the "بیشتر" tab
 * on mobile, so it is a plain block with no positioning of its own.
 *
 * Six brand palettes × light / OLED-dark. The preview row at the bottom is painted with the
 * live semantic tokens, so it shows the accessible text/fill steps the palette actually
 * resolves to — not just its swatch.
 */
export function ThemePicker({ className }: { readonly className?: string }) {
  const { theme, resolvedMode, setMode, setAccent } = useTheme();
  const modes = useRovingFocus(THEME_MODES.length, 'horizontal', {
    onActivate: (index) => {
      const mode = THEME_MODES[index];
      if (mode) setMode(mode.id);
    },
  });
  const accents = useRovingFocus(ACCENTS.length, 'horizontal', {
    onActivate: (index) => {
      const accent = ACCENTS[index];
      if (accent) setAccent(accent.id);
    },
  });

  return (
    <div className={cn('flex w-80 flex-col gap-4 p-1', className)}>
      <section className="flex flex-col gap-2">
        <h3 className="px-1 text-micro font-semibold uppercase tracking-wide text-fg-quaternary">
          حالت نمایش
        </h3>
        <div role="radiogroup" aria-label="حالت نمایش" onKeyDown={modes.onKeyDown} className="grid grid-cols-3 gap-1.5">
          {THEME_MODES.map(({ id, label }, index) => {
            const Icon = MODE_ICONS[id];
            const selected = theme.mode === id;
            return (
              <button
                key={id}
                ref={modes.registerItem(index)}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setMode(id)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-caption font-medium transition-colors',
                  selected
                    ? 'border-brand bg-brand-subtle text-fg-brand'
                    : 'border-secondary bg-surface text-fg-tertiary hover:bg-hover hover:text-fg-secondary',
                )}
              >
                <Icon size={18} variant={selected ? 'twotone' : 'linear'} />
                {label}
              </button>
            );
          })}
        </div>
      </section>

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
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-secondary bg-canvas p-2.5" aria-hidden="true">
          <Button size="xs" tabIndex={-1}>
            دکمه اصلی
          </Button>
          <Badge tone="brand" size="sm">
            برچسب
          </Badge>
          <span className="text-caption font-semibold text-fg-brand">پیوند متنی</span>
          <Checkbox checked onCheckedChange={() => undefined} size="sm" ariaLabel="نمونه" className="pointer-events-none" />
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
          <span className={cn('truncate text-caption font-semibold', selected ? 'text-fg-brand' : 'text-fg-primary')}>
            {accent.name}
          </span>
          <span className="truncate text-micro text-fg-tertiary">
            {accent.subtitle}
            {' '}
            <span className="latin-inline">{accent.primaryHex}</span>
          </span>
        </span>
        {selected && <CheckIcon size={14} className="shrink-0 text-fg-brand" />}
      </span>
    </button>
  );
}

'use client';
import type { ThemeMode } from '@taskin/contracts';
import { THEME_MODES } from '@/lib/theme';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
const ICONS: Record<ThemeMode, typeof SunIcon> = { light: SunIcon, dark: MoonIcon, system: MonitorIcon };
export function ThemePicker({ className }: { readonly className?: string }) {
  const { theme, setMode } = useTheme();
  const focus = useRovingFocus(THEME_MODES.length, 'horizontal', {
    onActivate: (index) => {
      const mode = THEME_MODES[index];
      if (mode) setMode(mode.id);
    },
  });
  return (
    <div
      role="radiogroup"
      aria-label="حالت نمایش"
      onKeyDown={focus.onKeyDown}
      className={cn(
        'grid w-72 max-w-full grid-cols-3 gap-1 rounded-xl border border-secondary bg-sunken p-1',
        className,
      )}
    >
      {THEME_MODES.map(({ id, label }, index) => {
        const Icon = ICONS[id];
        const selected = theme.theme === id;
        return (
          <button
            key={id}
            ref={focus.registerItem(index)}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => setMode(id)}
            className={cn(
              'flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 py-3 text-caption font-semibold transition-colors motion-reduce:transition-none',
              selected ? 'bg-surface text-fg-brand shadow-sm' : 'text-fg-secondary hover:bg-hover',
            )}
          >
            <Icon size={18} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

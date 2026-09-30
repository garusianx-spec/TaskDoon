import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

/**
 * Every colour below resolves to a CSS variable declared in `src/styles/tokens.css`.
 * The `<alpha-value>` slot keeps Tailwind's opacity modifiers working
 * (`bg-surface/80`, `text-fg-primary/60`, …) without a single literal hex in any component.
 */
const withAlpha = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const ramp = (name: string, steps: readonly string[]) =>
  Object.fromEntries(steps.map((step) => [step, withAlpha(`--${name}-${step}`)]));

/** `bg-tag-red`, `bg-tag-red-subtle`, `text-tag-red-ink`, `border-tag-red-line`. */
const tag = (tone: string) => ({
  DEFAULT: withAlpha(`--tag-${tone}`),
  subtle: withAlpha(`--tag-${tone}-bg`),
  ink: withAlpha(`--tag-${tone}-fg`),
  line: withAlpha(`--tag-${tone}-border`),
});

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        /* Accent ramp — re-pointed by [data-accent]; components never name a palette. */
        brand: ramp('brand', ['25', '50', '100', '200', '300', '400', '500', '600', '700', '800', '900']),
        gray: ramp('gray', ['25', '50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']),
        success: ramp('success', ['50', '100', '200', '500', '600', '700', '900']),
        warning: ramp('warning', ['50', '100', '200', '500', '600', '700', '900']),
        error: ramp('error', ['50', '100', '200', '500', '600', '700', '900']),

        /* Surfaces — read as `bg-canvas`, `bg-surface`, `hover:bg-hover`, … */
        canvas: withAlpha('--bg-canvas'),
        surface: withAlpha('--bg-surface'),
        raised: withAlpha('--bg-raised'),
        sunken: withAlpha('--bg-sunken'),
        rail: withAlpha('--bg-rail'),
        hover: withAlpha('--bg-hover'),
        active: withAlpha('--bg-active'),
        muted: withAlpha('--bg-disabled'),
        overlay: withAlpha('--bg-overlay'),
        'brand-subtle': withAlpha('--bg-brand-subtle'),
        'brand-subtle-hover': withAlpha('--bg-brand-subtle-hover'),
        'brand-solid': withAlpha('--bg-brand-solid'),
        'brand-solid-hover': withAlpha('--bg-brand-solid-hover'),

        /* Foreground — read as `text-fg-primary`, `fill-fg-tertiary`, … */
        fg: {
          primary: withAlpha('--fg-primary'),
          secondary: withAlpha('--fg-secondary'),
          tertiary: withAlpha('--fg-tertiary'),
          quaternary: withAlpha('--fg-quaternary'),
          placeholder: withAlpha('--fg-placeholder'),
          disabled: withAlpha('--fg-disabled'),
          'on-brand': withAlpha('--fg-on-brand'),
          brand: withAlpha('--fg-brand'),
        },

        /* Task/Message status — `text-status-done`, `bg-status-done-subtle`, `border-status-done-line` */
        status: {
          done: { DEFAULT: withAlpha('--status-done'), subtle: withAlpha('--status-done-bg'), line: withAlpha('--status-done-border') },
          progress: { DEFAULT: withAlpha('--status-progress'), subtle: withAlpha('--status-progress-bg'), line: withAlpha('--status-progress-border') },
          blocked: { DEFAULT: withAlpha('--status-blocked'), subtle: withAlpha('--status-blocked-bg'), line: withAlpha('--status-blocked-border') },
          todo: { DEFAULT: withAlpha('--status-todo'), subtle: withAlpha('--status-todo-bg'), line: withAlpha('--status-todo-border') },
          review: { DEFAULT: withAlpha('--status-review'), subtle: withAlpha('--status-review-bg'), line: withAlpha('--status-review-border') },
        },

        /* Fixed tag tones for custom board columns and note colour tags. */
        tag: Object.fromEntries(
          ['gray', 'blue', 'teal', 'green', 'amber', 'red', 'pink', 'violet'].map((tone) => [tone, tag(tone)]),
        ),
      },
      /* Border utilities get their own aliases so `border-primary` means "the primary
         border token", not "the primary colour ramp". */
      borderColor: {
        DEFAULT: withAlpha('--border-secondary'),
        primary: withAlpha('--border-primary'),
        secondary: withAlpha('--border-secondary'),
        tertiary: withAlpha('--border-tertiary'),
        brand: withAlpha('--border-brand'),
        disabled: withAlpha('--border-disabled'),
      },
      outlineColor: {
        brand: withAlpha('--ring-brand'),
      },
      ringColor: {
        brand: withAlpha('--ring-brand'),
        error: withAlpha('--ring-error'),
      },
      fontFamily: {
        sans: ['IRANYekanX', 'Vazirmatn', 'Segoe UI', 'Tahoma', 'system-ui', 'sans-serif'],
      },
      /* Persian text needs a touch more leading than Latin at the same optical size. */
      fontSize: {
        'micro': ['0.6875rem', { lineHeight: '1.125rem', letterSpacing: '0' }],       // 11px — badges
        'caption': ['0.75rem', { lineHeight: '1.25rem', letterSpacing: '0' }],        // 12px — micro-copy
        'body-sm': ['0.8125rem', { lineHeight: '1.375rem', letterSpacing: '0' }],     // 13px — chat
        'body': ['0.875rem', { lineHeight: '1.5rem', letterSpacing: '0' }],           // 14px — body / table
        'title-sm': ['0.875rem', { lineHeight: '1.375rem', letterSpacing: '0' }],     // 14px — tab labels
        'title': ['1rem', { lineHeight: '1.625rem', letterSpacing: '0' }],            // 16px — section titles
        'heading-sm': ['1.125rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }], // 18px
        'heading': ['1.25rem', { lineHeight: '1.875rem', letterSpacing: '-0.01em' }], // 20px
        'display': ['1.5rem', { lineHeight: '2.125rem', letterSpacing: '-0.02em' }],  // 24px — workspace header
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },
      spacing: {
        rail: '4rem',      // 64px global navigation rail
        sidebar: '18.75rem', // 300px contextual sidebar
        inspector: '23.75rem', // 380px right inspector
      },
      borderRadius: {
        xs: '0.25rem',
        sm: '0.375rem',
        md: '0.5rem',
        lg: '0.625rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      zIndex: {
        rail: '30',
        sticky: '20',
        drawer: '50',
        overlay: '60',
        modal: '70',
        popover: '80',
        toast: '90',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-start': {
          from: { opacity: '0', transform: 'translateX(-1.5rem)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        /* Physical, because a panel anchored to the inline-start edge in RTL enters from
           the right; LTR uses `slide-in-start`. */
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(1.5rem)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'scale-in': 'scale-in 140ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-start': 'slide-in-start 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-ring': 'pulse-ring 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [
    plugin(({ addUtilities, addVariant }) => {
      /* `dir-aware:` — styles that only apply while the document is RTL and the element is
         inside a horizontally scrolling region. Kept alongside Tailwind's own rtl:/ltr:. */
      addVariant('rtl-only', '&:where([dir="rtl"] *)');

      addUtilities({
        /* Persian digits (ss01) + tabular figures. Applied to any numeric surface:
           Jalali dates, task counters, timesheet totals, unread pills. */
        '.numeric': {
          fontFeatureSettings: '"ss01" 1, "tnum" 1, "lnum" 1',
          fontVariantNumeric: 'tabular-nums lining-nums',
          fontVariantLigatures: 'none',
        },
        '.persian-digits': {
          fontFeatureSettings: '"ss01" 1',
        },
        /* Latin fragments inside RTL copy (file sizes, @mentions, codes). */
        '.latin-inline': {
          direction: 'ltr',
          unicodeBidi: 'isolate',
          display: 'inline-block',
        },
        '.scrollbar-thin': {
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgb(var(--gray-300)) transparent',
        },
        '.no-scrollbar': {
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
      });
    }),
  ],
};

export default config;

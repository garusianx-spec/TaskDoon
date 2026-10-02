# تسکدون — TaskDoon

پلتفرم ارتباط و مدیریت وظایف سازمانی، راست‌به‌چپ و با تقویم هجری شمسی.

An RTL-first, Persian enterprise communication and task-management platform built on
Next.js (App Router), React and TypeScript in strict mode, styled with Tailwind CSS against
a fully tokenised Untitled UI design system.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit (strict, noUncheckedIndexedAccess)
npm run lint       # eslint (next/core-web-vitals + next/typescript)
```

---

## Typography

`IRANYekanX` is self-hosted from `public/fonts` as WOFF2. **Two masters ship in this
repository** (Medium and ExtraBold), and `src/styles/fonts.css` declares each `@font-face`
with a *weight range* so every step of the type scale resolves to the nearest available
master rather than being synthesised by the browser:

| Master     | `font-weight` range | Covers                                          |
| ---------- | ------------------- | ----------------------------------------------- |
| Medium     | `400 600`           | micro-copy, body, chat, titles, table headers    |
| ExtraBold  | `700 900`           | page headers, workspace headers                  |

To add the remaining masters, drop `IRANYekanWebRegular.woff2`,
`IRANYekanWebSemiBold.woff2` or `IRANYekanWebBold.woff2` into `public/fonts` and narrow the
ranges in `fonts.css`. **No component changes are needed** — components only ever reference
weights through Tailwind's `font-*` utilities.

The type scale lives in `tailwind.config.ts` and is sized for Persian, which needs slightly
more leading than Latin at the same optical size:

| Token          | Size | Weight | Used for                                  |
| -------------- | ---- | ------ | ----------------------------------------- |
| `text-micro`   | 11px | 400    | badges, counters                          |
| `text-caption` | 12px | 400    | micro-copy, metadata                      |
| `text-body-sm` | 13px | 400/500| chat messages                             |
| `text-body`    | 14px | 400    | body copy, table cells                    |
| `text-title-sm`| 14px | 600    | tab labels, table headers                 |
| `text-title`   | 16px | 600    | section titles                            |
| `text-heading` | 18–20px | 700 | page headers                              |
| `text-display` | 24px | 800    | workspace headers                         |

### OpenType

`font-feature-settings: "ss01"` is applied document-wide on `body`, which selects the
Persian ۴/۵/۶ glyph variants. The `.numeric` utility adds `tnum` + `lnum` and
`font-variant-numeric: tabular-nums` and is applied to every numeric surface — Jalali dates,
task counters, timesheet totals, unread pills and financial tables — so digits stay aligned
in columns.

`.latin-inline` isolates Latin fragments (emails, file names, task codes) inside RTL copy
with `direction: ltr; unicode-bidi: isolate`.

---

## Theme engine

Three layers, all in `src/styles/tokens.css`:

1. **Primitive ramps** — raw `R G B` channel triplets, so Tailwind's `<alpha-value>` slot
   works (`bg-surface/80`, `text-fg-primary/60`).
2. **Accent alias** — `--brand-50…900` is re-pointed by `[data-accent]`. Components never
   name a palette.
3. **Semantic surfaces** — `--bg-*`, `--fg-*`, `--border-*`, `--status-*`. These flip in dark
   mode; every component reads only this layer.

### Colour modes

`data-theme="light" | "dark"` on `<html>`. "System" resolves to one of the two at runtime so
there is a single source of truth in the DOM. Dark mode is OLED Charcoal: `#0C111D`
background, `#161B26` cards, `#1F242F` borders.

### Accent palettes

Swappable Primary 50→900 scales, selected with `data-accent`:

| Accent   | Name                | Primary 600 |
| -------- | ------------------- | ----------- |
| `indigo` | برند کلاسیک          | `#3538CD`   |
| `teal`   | تمرکز و شفافیت       | `#0E766E`   |
| `violet` | استارتاپ مدرن        | `#6941C6`   |
| `amber`  | سازمانی گرم          | `#B54708`   |

### Status tokens

Done `#027A48` · In Progress `#B54708` · Blocked `#B42318` · Todo `#667085`. In dark mode the
foreground steps lift to the 300/400 range so they clear WCAG AA on charcoal.

### No flash of the wrong palette

`THEME_BOOTSTRAP_SCRIPT` (in `src/lib/theme.ts`) runs synchronously in `<head>` before first
paint and writes `data-theme` / `data-accent` from `localStorage` or the OS preference.
`ThemeProvider` then adopts exactly what the script applied, so React hydrates against the
attributes it would have produced itself. The theme also syncs across open tabs via the
`storage` event, and falls back to an in-memory theme when storage is blocked.

**Zero hard-coded hex values exist in any component class.** The only raw hex outside
`tokens.css` is the four-swatch preview in the theme picker, which must render all four
palettes at once and therefore cannot read the single active `--brand-*` variable.

---

## RTL

The document is `dir="rtl"` at the root. The codebase uses **logical properties throughout**
(`ps-`/`pe-`, `ms-`/`me-`, `start-`/`end-`, `border-s`/`border-e`, `text-start`/`text-end`)
rather than physical left/right, with `rtl:`/`ltr:` variants reserved for the few cases where
a transform has to be mirrored explicitly (the switch knob, direction-aware chevrons).

Direction-aware details that are easy to get wrong and are handled here:

- **Chevrons and arrows.** `ChevronForwardIcon` points along the reading direction (left in
  RTL); `ChevronBackwardIcon` points against it. "Previous month/week" uses *backward*
  (earlier content lies to the right in RTL); "next" uses *forward*.
- **Kanban keyboard movement.** With a card picked up, `ArrowLeft` advances to the next
  column and `ArrowRight` retreats.
- **Waveform scrubbing.** The voice player measures the click offset from the track's right
  edge, and `ArrowLeft` seeks forward.
- **Gantt.** The timeline is a CSS grid of one column per day. Because the container inherits
  `dir="rtl"`, column 1 is the right-most cell and bars run right-to-left with no coordinate
  mirroring — only `gridColumnStart` / `gridColumnEnd`.
- **Avatar stacks** use `flex-row-reverse` plus a negative inline margin so the first member
  still stacks on top.
- Separators between a word and a number use the Persian comma `،` rather than `·`, which is
  a bidi-neutral character and renders ambiguously next to digits.

---

## Jalali calendar

`src/lib/jalali.ts` implements the Solar Hijri arithmetic conversion (the 33-year
leap-cycle algorithm) with no runtime dependency on `Intl`, so output is byte-identical on
every platform and ICU build. It was verified day-by-day against
`Intl.DateTimeFormat('en-u-ca-persian')` across 1990–2035 (16,436 days): **zero mismatches**,
and every date round-trips back to the same Gregorian day.

It provides month grids (Saturday-first), leap-year and month-length calculation, relative
phrasing (`۵ دقیقه پیش`), chat date dividers (`امروز` / `دیروز` / weekday), deadline
descriptions (`۲ روز تأخیر`, `فردا`) and Persian-digit formatting.

### Clock-dependent rendering

These routes are statically prerendered, so the server's clock is *build* time. Anything
phrased relative to "now" would therefore never match the visitor. `useNow()` returns `null`
until mount, letting callers emit a deterministic absolute value for SSR and upgrade to live
phrasing after hydration — which also keeps timestamps ticking instead of freezing at page
load. `<RelativeTime>` wraps this in a semantic `<time>` element.

---

## Architecture

```
src/
├── app/                    # App Router routes (one per module) + root layout
├── components/
│   ├── ui/                 # Headless-ish primitives: Button, Switch, Modal, Drawer, …
│   ├── icons/              # ~60 hand-authored Iconsax-style glyphs
│   ├── layout/             # AppShell, NavRail, TopAppBar, BottomNav, GlobalSearch
│   ├── chat/               # ChatView, MessageBubble, VoicePlayer, composer, action sheet
│   ├── tasks/              # Kanban, List, Gantt, Inspector, Jalali date picker, swipe rows
│   ├── rbac/               # Permission matrix + advanced editing modal
│   └── theme/              # ThemeProvider, ThemePicker
├── data/                   # Typed reference data + seed workspace fixture
├── hooks/                  # focus trap, scroll lock, roving focus, media query, clock
├── lib/                    # jalali, formatting, cn, theme bootstrap
├── store/                  # Pure reducer + selectors + container provider
├── styles/                 # fonts.css, tokens.css
└── types/                  # The whole domain model
```

### Separation of concerns

`WorkspaceProvider` is the **single stateful container**. Everything below it is
presentational: it receives data and callbacks and owns no domain state. `workspace-reducer.ts`
is a pure function with a closed, exhaustively-switched action union — it has no React
import and is directly unit-testable. In production the transport layer (React Query, server
actions) would feed this same reducer; the contract would not change.

`AppShell` owns the cross-module overlays — the task composer, global search and the
inspector — because each can be opened from more than one module, and publishes
`useShellActions()` so pages open them without prop-drilling.

### Icons

~60 glyphs hand-authored on a 24×24 grid with round caps and joins. Stroke width is computed
as `1.5 × 24 / size`, so a 16px icon and a 24px icon render at an identical 1.5 CSS px —
uniform optical weight across every toolbar. Variants: `linear`, `twotone` (secondary
geometry at 40%) and `bold` (secondary geometry filled, used for active nav states).

---

## Type safety

`strict: true` plus `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `noUnusedLocals` and `noUnusedParameters`.
**Zero `any` in the codebase**, enforced by `@typescript-eslint/no-explicit-any: error`.

All domain unions are closed and exhaustively switched with a `const exhaustive: never`
guard, so adding a member surfaces as a compile error rather than a runtime fallthrough:
`RoleId`, `PermissionModuleId`, `PermissionActionId`, `TaskStatus`, `TaskPriority`,
`MessageBody`, `ThemeMode`, `AccentId`, `SmartViewId`, `ChatFilterId`.

---

## Accessibility

- **Modals, drawers and sheets** implement the full WAI-ARIA dialog contract: `aria-modal`,
  labelled by their title, focus trapped (verified: focus never escapes across 40 tabs),
  Escape to close, background scroll locked (reference-counted for nesting) and focus
  restored to the opener.
- **The inspector** is a docked column on desktop — it does *not* trap focus or lock scroll
  there, because the rest of the app stays interactive — and promotes to a full dialog on
  mobile.
- **Kanban drag and drop has a complete keyboard path**: focus a card, `Space` picks it up,
  arrow keys move it between columns, `Space` drops, `Escape` cancels. Every transition is
  announced through the shell's single `aria-live` region, so the operation is fully
  non-visual. Subtask reordering and the mobile swipe actions likewise have keyboard and
  button equivalents — no interaction is pointer-only.
- **Composite widgets** use roving tabindex (`useRovingFocus`), resolving arrow direction
  from the computed `dir` at keypress time.
- `Select` implements the ARIA 1.2 combobox/listbox contract including `aria-activedescendant`
  and printable-character type-ahead.
- The permission matrix labels each switch by the intersection it controls, so a screen
  reader announces "بوردها و پروژه‌ها — ویرایش، روشن" rather than an anonymous toggle.
  Master switches report `aria-checked="mixed"` and park their knob mid-track.
- Icon-only controls require a `label` prop at the type level.
- Tables use `<caption>`, `scope` and `aria-sort`.
- A skip link targets `#workspace-main`; `prefers-reduced-motion` disables all animation.

---

## Layout

**Desktop (≥1024px)** — a four-column shell on a 1440px grid: 64px navigation rail pinned to
the inline-end (right) edge, 300px contextual sidebar, fluid workspace, and a 380px
collapsible inspector. Kanban columns share the available width and only scroll once they hit
their minimum, so all four fit at 1440px with the inspector closed.

**Mobile (375–414px)** — top app bar, five fixed bottom tabs (میز کار · گفتگوها · وظایف من ·
تقویم · بیشتر) and per-route adaptation: the chat list pushes to a detail view, and the task
list becomes a swipeable single column with the contextual sidebar behind a فیلترها toggle.
Swipe right completes a task, swipe left opens postpone/reassign. Long-pressing a chat bubble
opens a sheet whose primary action is «تبدیل مستقیم به وظیفه», pre-filling the composer with
the message text and any attachment. Verified: zero horizontal overflow on every route at
390px.

---

## What is mocked

This is a complete front end against an in-memory fixture (`src/data/workspace.ts`); there is
no backend. Two consequences worth stating plainly:

- **Voice messages have no audio files.** `VoicePlayer` implements both transports: when a
  message carries a `src` it drives a real `HTMLAudioElement` (seeking, `timeupdate`,
  duration); with `src: null` — the state of a recording that is still uploading — it runs a
  `requestAnimationFrame` clock over the known duration so scrubbing and progress still work.
  The seed data uses the second path.
- **Avatars are generated initials**, not uploaded images, so no binary assets ship in the
  repository. `AvatarTone` selects from the neutral and status ramps rather than the brand
  ramp, so members stay distinguishable when the workspace accent changes.

State changes (moving cards, editing permissions, sending messages, creating tasks) are real
and flow through the reducer; they reset on reload because nothing is persisted except the
theme.

---
name: TaskDoon
description: Persian-first visual language for the public website and account entry.
colors:
  indigo: 'rgb(53 56 205)'
  indigo-hover: 'rgb(45 49 166)'
  indigo-pressed: 'rgb(45 50 130)'
  indigo-deep: 'rgb(31 33 99)'
  indigo-ring: 'rgb(97 114 243)'
  indigo-line: 'rgb(199 215 254)'
  indigo-mist: 'rgb(224 234 255)'
  indigo-tint: 'rgb(238 244 255)'
  surface: 'rgb(255 255 255)'
  canvas: 'rgb(249 250 251)'
  sunken: 'rgb(242 244 247)'
  line: 'rgb(208 213 221)'
  divider: 'rgb(234 236 240)'
  ink: 'rgb(16 24 40)'
  ink-secondary: 'rgb(52 64 84)'
  ink-muted: 'rgb(102 112 133)'
  ink-disabled: 'rgb(152 162 179)'
  progress-ink: 'rgb(181 71 8)'
  progress-fill: 'rgb(255 250 235)'
  progress-line: 'rgb(254 223 137)'
  done-ink: 'rgb(2 122 72)'
  done-fill: 'rgb(236 253 243)'
  done-line: 'rgb(166 244 197)'
  error-ink: 'rgb(180 35 24)'
  error-line: 'rgb(217 45 32)'
typography:
  display:
    fontFamily: 'IRANYekanX, Vazirmatn, Segoe UI, Tahoma, system-ui, sans-serif'
    fontSize: 'clamp(36px, 4.5vw, 60px)'
    fontWeight: 800
    lineHeight: 1.55
    letterSpacing: '-.025em'
  headline:
    fontFamily: 'IRANYekanX, Vazirmatn, Segoe UI, Tahoma, system-ui, sans-serif'
    fontSize: 'clamp(27px, 3vw, 40px)'
    fontWeight: 800
    lineHeight: 1.65
    letterSpacing: '-.018em'
  auth-heading:
    fontFamily: 'IRANYekanX, Vazirmatn, Segoe UI, Tahoma, system-ui, sans-serif'
    fontSize: 'clamp(24px, 2.3vw, 30px)'
    fontWeight: 800
    lineHeight: 1.65
  title:
    fontFamily: 'IRANYekanX, Vazirmatn, Segoe UI, Tahoma, system-ui, sans-serif'
    fontSize: '18px'
    fontWeight: 600
    lineHeight: 1.9
  body:
    fontFamily: 'IRANYekanX, Vazirmatn, Segoe UI, Tahoma, system-ui, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.85
  label:
    fontFamily: 'IRANYekanX, Vazirmatn, Segoe UI, Tahoma, system-ui, sans-serif'
    fontSize: '11px'
    fontWeight: 500
    lineHeight: '18px'
  button:
    fontFamily: 'IRANYekanX, Vazirmatn, Segoe UI, Tahoma, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 600
    lineHeight: 1.6
  auth-button:
    fontFamily: 'IRANYekanX, Vazirmatn, Segoe UI, Tahoma, system-ui, sans-serif'
    fontSize: '15px'
    fontWeight: 600
    lineHeight: '24px'
  field-value:
    fontFamily: 'IRANYekanX, Vazirmatn, Segoe UI, Tahoma, system-ui, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: '24px'
rounded:
  inset: '8px'
  control: '10px'
  media: '12px'
  frame: '14px'
  banner: '16px'
  auth-panel: '20px'
  pill: '9999px'
spacing:
  compact-gap: '8px'
  action-gap: '12px'
  task-inset: '16px'
  form-gap: '22px'
  desktop-gutter: '32px'
  mobile-gutter: '16px'
components:
  button-primary:
    backgroundColor: '{colors.indigo}'
    textColor: '{colors.surface}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '12px 22px'
  button-primary-hover:
    backgroundColor: '{colors.indigo-hover}'
  button-primary-active:
    backgroundColor: '{colors.indigo-pressed}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink-secondary}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '12px 22px'
  button-secondary-hover:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
  button-auth-submit:
    backgroundColor: '{colors.indigo}'
    textColor: '{colors.surface}'
    typography: '{typography.auth-button}'
    rounded: '{rounded.control}'
    padding: '0 16px'
  button-auth-link:
    backgroundColor: 'transparent'
    textColor: '{colors.indigo}'
    padding: '0'
  auth-phone-field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.field-value}'
    rounded: '{rounded.control}'
    height: '50px'
    padding: '0 40px 0 64px'
  marketing-nav-link:
    textColor: '{colors.ink-secondary}'
    padding: '14px 0'
  preview-tab-selected:
    backgroundColor: '{colors.indigo-tint}'
    textColor: '{colors.indigo}'
    rounded: '{rounded.inset}'
    padding: '10px 18px'
  status-badge-progress:
    backgroundColor: '{colors.progress-fill}'
    textColor: '{colors.progress-ink}'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    height: '20px'
    padding: '0 6px'
  status-badge-done:
    backgroundColor: '{colors.done-fill}'
    textColor: '{colors.done-ink}'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    height: '20px'
    padding: '0 6px'
  sample-task:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '{spacing.task-inset}'
---

# Design System: TaskDoon

## Overview

**Creative North Star: "The Shared Workspace"**

TaskDoon's public surfaces bring the product into view through familiar Persian type, crisp white panels and purposeful indigo. A task shows its status, owner and date together. That same visual language carries through the website, the interactive demonstration and account entry.

Public pages use generous space for reading and put real workspace detail inside bounded previews. Account entry uses the same type, controls and colors at a tighter scale, with a single form as the main task.

**Key Characteristics:**

- Persian-first reading order with IRANYekanX and deliberate direction for numeric fields.
- White and cool-gray planes, fine borders and indigo for actions and selection.
- Real product captures and interactive samples with synthetic data.
- A light public presentation scoped to marketing and account entry.

## Colors

TaskDoon uses one brand accent with cool neutrals and semantic status colors. The frontmatter records CSS colors resolved from the app's RGB channel tokens. [Semantic and accent tokens](apps/web/src/styles/tokens.css)

### Primary

- **TaskDoon indigo** is `--brand-600` (`#3538CD`), the public fill, action text and focus outline. `--brand-700` darkens solid hover, `--brand-800` is the marketing primary pressed state, and `--brand-900` anchors the footer. `--brand-500` supplies the shared `--ring-brand` focus ring.
- **Indigo tint** (`--brand-50`) marks selected tabs and the entry emblem. `--brand-200` borders selected preview tabs. `--brand-100` supplies muted light copy and focus outlines on dark indigo sections.

### Neutral

- **Surface**, **canvas** and **sunken** are `--bg-surface`, `--bg-canvas` and `--bg-sunken`. Use white for form fields and task cards, canvas gray for section alternation and demo board columns, and sunken gray for media backdrops.
- **Ink**, **secondary ink** and **muted ink** are `--fg-primary`, `--fg-secondary` and `--fg-tertiary`. Muted ink supports descriptions, metadata and public placeholders. `--fg-disabled` belongs to disabled controls.
- **Line** (`--border-primary`) frames previews and fields. **Divider** (`--border-secondary`) separates inner content and edges of task cards.

**The Public Surface Rule.** Apply light and indigo through `.public-surface[data-theme="light"][data-accent="indigo"]`. The wrapper scopes both `color-scheme` and semantic tokens. `ThemeProvider` owns the saved workspace theme and applies mode and accent at the document root. [Public wrapper](apps/web/src/components/public/PublicSurface.tsx), [Public styles](apps/web/src/components/public/public.css), [Workspace theme provider](apps/web/src/components/theme/ThemeProvider.tsx)

**The Semantic Status Rule.** Pair `--status-progress`, `--status-done` and `--status-blocked` with their matching background and border tokens and a readable status label. Use `--error-600` for invalid auth field borders and `--error-700` for the accompanying Persian message. [Shared badge](apps/web/src/components/ui/Badge.tsx), [Auth styles](apps/web/src/components/auth/auth.css)

## Typography

IRANYekanX is the display and text family. The self-hosted Medium master covers weights 400–600 and ExtraBold covers 700–900. The stack falls through Vazirmatn, Segoe UI, Tahoma and system sans. The document applies the `ss01` feature for Persian digit forms. [Font faces](apps/web/src/styles/fonts.css), [Tailwind scales](apps/web/tailwind.config.ts), [Global styles](apps/web/src/app/globals.css)

- **Display and headline.** `.home-heading h1` and `.home-heading h2` pair weight 800 with generous Persian leading. The homepage display uses the fluid scale on desktop, then sets 40px at 800px and 34px at 600px. Section headings drop to 30px and then 27px at those same breakpoints. [Homepage styles](apps/web/src/components/marketing/homepage.css)
- **Auth heading and content titles.** `.auth-form-heading h1` gives each form step a compact, heavy heading. Medium-weight titles and captions organize the content beneath it. [Auth styles](apps/web/src/components/auth/auth.css)
- **Body and labels.** `.public-surface` sets the body base. Homepage descriptions use line height 2.1 and the hero description caps at 650px. `.marketing-prose` keeps long CMS text to 75ch. Auth labels are 14px, fields are 16px, and shared small badges use the 11px label scale. [Public styles](apps/web/src/components/public/public.css), [Homepage styles](apps/web/src/components/marketing/homepage.css), [Marketing styles](apps/web/src/components/marketing/marketing.css), [Auth styles](apps/web/src/components/auth/auth.css)

**The Persian Reading Order Rule.** Let `lang="fa"` and `dir="rtl"` set the reading order. Use logical alignment and isolate phone numbers, codes and password entry in LTR fields. Keep Persian and Latin digits usable in phone and OTP entry and use tabular figures for the OTP. [Root layout](apps/web/src/app/layout.tsx), [Auth fields](apps/web/src/components/auth/AuthFields.tsx), [Sign-in flow](apps/web/src/components/auth/SignInScreen.tsx), [OTP normalization](apps/web/src/lib/auth-input.ts)

## Layout

- **Marketing measure.** `.marketing-container` and `.home-container` cap content at 1160px, with 32px side gutters at full width. The homepage moves to 20px side gutters at 800px and both containers use 16px at 600px. Homepage sections use 80px vertical spacing on desktop and 56px at 800px and below. [Marketing styles](apps/web/src/components/marketing/marketing.css), [Homepage styles](apps/web/src/components/marketing/homepage.css)
- **Responsive hierarchy.** Desktop navigation gives way to a menu at 900px. Feature and FAQ columns stack at 800px. At 600px, `.workspace-preview-mobile` replaces the desktop preview and the interactive board stacks its active and completed columns. On desktop viewports up to 800px tall, the hero tightens its spacing to bring the workspace preview into view earlier. [Marketing styles](apps/web/src/components/marketing/marketing.css), [Homepage styles](apps/web/src/components/marketing/homepage.css)
- **Account entry.** `.auth-layout` is an equal desktop split with a 400px form measure and 22px fieldset gaps. The sample composition simplifies at 1100px. At 800px and below, `.auth-brand-panel` is hidden and the form can reach 420px in the single-column layout. The functional panel uses 24px side padding on mobile and 20px at 390px and below. [Auth styles](apps/web/src/components/auth/auth.css)

## Elevation & Depth

The public interface establishes depth with white and cool-gray fills, one-pixel boundaries and occasional low shadows. The desktop product frame sits flat against its section. The desktop auth sample has a distinct ambient shadow inside the indigo panel. [Semantic tokens](apps/web/src/styles/tokens.css), [Homepage styles](apps/web/src/components/marketing/homepage.css), [Auth styles](apps/web/src/components/auth/auth.css)

- **Shared control shadow** (`--shadow-xs`, `0 1px 2px 0 rgb(16 24 40 / 0.05)`) gives shared filled and outlined buttons and inputs a slight edge.
- **Auth sample shadow** (`0 24px 48px -24px rgb(var(--brand-900) / .7)`) separates `.auth-workspace-sample` from the surrounding indigo.

**The Borders First Rule.** Define product frames and task cards with a surface fill and a one-pixel semantic border. Use shadows for the shared control treatment and for lifting the auth sample. [Public styles](apps/web/src/components/public/public.css), [Homepage styles](apps/web/src/components/marketing/homepage.css), [Auth styles](apps/web/src/components/auth/auth.css)

## Shapes

- Give `.marketing-button`, `.auth-form-panel input` and `.demo-task` modest rounded corners (10px). Small tab and menu controls use an 8px radius. Shared status badges are pills.
- Clip the contents of preview and journey frames to their rounded boundary (14px). Use larger corners for the closing call to action (16px) and the desktop auth panel (20px). [Marketing styles](apps/web/src/components/marketing/marketing.css), [Homepage styles](apps/web/src/components/marketing/homepage.css), [Public styles](apps/web/src/components/public/public.css), [Auth styles](apps/web/src/components/auth/auth.css)

## Components

### Actions and navigation

- `.marketing-button` sets the default public CTA to a 48px minimum height with weight 600. The primary uses white on indigo with distinct hover and pressed tones. The outlined secondary uses a white surface and cool-gray line, then takes the canvas tint on hover. The closing indigo banner uses a light-filled primary and a transparent outlined secondary. [Marketing styles](apps/web/src/components/marketing/marketing.css), [Homepage styles](apps/web/src/components/marketing/homepage.css)
- `.marketing-header` is sticky with a border below it. The desktop current link uses indigo, an underline and `aria-current="page"`. The compact menu has an expanded state, an inert closed panel and Escape-to-close behavior that returns focus to its toggle. Marketing and auth both offer a skip link. [Marketing header](apps/web/src/components/marketing/MarketingHeader.tsx), [Marketing layout](<apps/web/src/app/(marketing)/layout.tsx>), [Auth card](apps/web/src/components/auth/AuthCard.tsx)
- `.public-surface :focus-visible` uses a 2px indigo outline at a 4px offset alongside the shared focus treatment. Auth inputs bring the outline flush to the field. The footer and closing section use a pale indigo outline against their dark fills. [Public styles](apps/web/src/components/public/public.css), [Global styles](apps/web/src/app/globals.css), [Auth styles](apps/web/src/components/auth/auth.css)

### Account entry fields

`AuthCard` carries a single focused form step. The shared submit action is full width with a 50px minimum height. Inputs have visible labels, field-linked hints and error messages, and semantic invalid state. Password visibility is a named, pressed-state button with a 44px hit area. [Auth card](apps/web/src/components/auth/AuthCard.tsx), [Auth fields](apps/web/src/components/auth/AuthFields.tsx), [Shared input](apps/web/src/components/ui/Input.tsx), [Auth styles](apps/web/src/components/auth/auth.css)

The SMS code is one field with a numeric keyboard hint, one-time-code autocomplete and normalized paste. Step changes focus the current field, pending forms expose busy state, and expired codes explain when to request a replacement. Keep the same visual feedback across phone entry, OTP, password recovery and account creation. [Sign-in flow](apps/web/src/components/auth/SignInScreen.tsx), [Auth fields](apps/web/src/components/auth/AuthFields.tsx)

### Workspace previews and sample task

The desktop workspace preview uses authentic 1440×960 captures of the running app in four tabs for the board, conversations, Jalali calendar and notes. The asset set also includes the task list and feed. `kanban.png` and `tasks.png` come from `/tasks` in board and list views, `chat.png` from `/chats`, `calendar.png` from `/calendar`, `notes.png` from `/notes`, and `feed.png` from `/feed`. The capture script requires an isolated synthetic demo build and sets Persian locale, light indigo and reduced motion. Images have Persian alternative text. Preview tabs support RTL arrow keys, Home and End. [Product screenshots](apps/web/public/marketing), [Capture script](apps/web/scripts/capture-marketing-previews.mjs), [Preview tabs](apps/web/src/components/marketing/ProductPreview.tsx)

The mobile workspace presents readable task, conversation and calendar states with the app's shared controls. The reusable `.demo-task` shows a status pill and dot, task title, Jalali date and assignee. A completion action toggles the sample between in-progress and done, with a screen-reader status message. [Mobile and desktop workspace preview](apps/web/src/components/marketing/WorkspacePreview.tsx), [Sample task](apps/web/src/components/public/DemoTask.tsx)

### Conversation-to-project walkthrough

`ProductJourney` lets visitors convert a sample message, edit a prefilled task title and complete or restore the task in a sample board. It uses native buttons and fields with labelled tab panels. Arrow keys follow RTL order and action buttons move focus to the next tab. Completion is announced through a status message. Sample state lives in the preview and its disclosure explains the scope. [Interactive walkthrough](apps/web/src/components/marketing/ProductJourney.tsx)

The walkthrough animates a newly selected panel for 240ms ease-out. The auth form enters for 350ms ease-out. Both entrances require `prefers-reduced-motion: no-preference`, and reduced motion also removes the auth sample tilt. The global reduced-motion rule shortens transitions and sets scroll behavior to `auto`. [Homepage styles](apps/web/src/components/marketing/homepage.css), [Auth styles](apps/web/src/components/auth/auth.css), [Global styles](apps/web/src/app/globals.css)

## Do's and Don'ts

### Do

- Do use semantic colors for interactive and status states and pair status color with a readable Persian label.
- Do preserve visible focus, native form labels and logical RTL navigation through previews and account entry.
- Do use synthetic data from the demo build for screenshots and visibly label interactive samples.

### Don't

- Don't apply the public theme to the document root or store it as a workspace preference.
- Don't shrink a desktop screenshot to serve as the mobile product demonstration.
- Don't use real workspace data in public product previews.

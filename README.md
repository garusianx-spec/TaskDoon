# تسک‌دون — TaskDoon

پلتفرم ارتباط و مدیریت وظایف سازمانی، راست‌به‌چپ و با تقویم هجری شمسی.

An RTL-first, Persian enterprise communication and task-management platform built on
Next.js (App Router), React and TypeScript in strict mode, styled with Tailwind CSS against
a fully tokenised Untitled UI design system. The backend (`apps/api`) is a NestJS modular
monolith on PostgreSQL, Redis and S3-compatible storage, designed in
[RFC 0001](docs/rfc/0001-backend-architecture.md) and built milestone by milestone.

---

## Running it

Node.js 22.12 or newer. Every command runs from the repository root:

```bash
npm install
npm run dev             # builds the shared packages, then http://localhost:3000 (the live app: needs the API on :4000)
NEXT_PUBLIC_DATA_SOURCE=demo npm run dev   # the same app on the in-memory demo workspace, no backend needed
npm run build           # packages, apps/api and the production build of apps/web
npm run typecheck       # every workspace (strict, noUncheckedIndexedAccess)
npm run lint            # Next rules for apps/web, typescript-eslint for packages and apps/api
npm test                # unit tests: packages/jalali, packages/text, apps/api (no services needed)
npm run check:contrast  # WCAG AA audit of every palette × mode (see Theme engine)
NEXT_PUBLIC_DATA_SOURCE=demo npm run build && npm run test:e2e   # Playwright suites (demo data), production build
API_LOG=<api log file> npm run test:e2e:live                    # two people against the running API (see Live app)

# Backend (Docker for the backing services)
npm run infra:up        # PostgreSQL 18, PgBouncer, Redis ×2, S3 (SeaweedFS), Mailpit
npm run test:int        # API integration suites against a database migrated from zero
npm run infra:app       # also builds and runs the API image (migrations first) on :4000
npm run infra:down
# The scaled topology: REST node, two WebSocket nodes, worker, nginx on :8080
docker compose -f infra/docker-compose.yml -f infra/compose.scale.yml --profile scale up -d --build --wait
```

See [apps/api/README.md](apps/api/README.md) for running the API outside Docker, its
configuration, its test layout, and the scale-out smoke test and chat load results.

The repository is an npm-workspaces monorepo:

| Path | Contents |
| --- | --- |
| `apps/web` | The Next.js app |
| `apps/api` | The NestJS API: auth, workspaces, RBAC, projects, board, tasks, files, notes, calendar, notifications, and real-time chat on a Socket.IO gateway (M1–M3 of RFC 0001) |
| `packages/contracts` | Domain types, API contracts and the permission vocabulary, shared by web and API |
| `packages/jalali` | Jalali calendar engine and Persian date formatting |
| `packages/text` | Persian text helpers: digits, Iranian mobile numbers, monograms, note Markdown and checklists, search normalisation |
| `infra` | Docker Compose stacks for local development and the scaled topology, database roles, S3 and nginx configuration |
| `docs/rfc` | Architecture decisions; the backend design is [RFC 0001](docs/rfc/0001-backend-architecture.md) |

Packages compile to `dist/`. While `npm run dev` is running, run `npm run build:packages -- --watch`
in a second terminal to pick up package edits.

`npm run test:e2e` starts `next start` on port 3100 (`E2E_PORT`), or uses `BASE_URL` if you
already run a server, and takes suite names to run a subset (`npm run test:e2e -- kanban theme`).
It needs a demo build and says so when it finds a live one (the root element carries
`data-source`). It launches Chromium from `CHROMIUM_PATH` when set, otherwise from
`npx playwright-core install chromium`. Screenshots land in `apps/web/e2e/out`.

---

## Live app

By default the web app runs against the TaskDoon API. Next.js proxies `/api/v1/*` and the
Socket.IO path `/rt/` to the API, so the browser only ever talks to the app's own origin: the
refresh cookie is first-party and no CORS is involved. In production the edge (nginx) routes
both paths the same way.

| Variable | Read at | Default | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_DATA_SOURCE` | build | `api` | `api` for the live app, `demo` for the in-memory fixture workspace |
| `TASKIN_API_ORIGIN` | build | `http://localhost:4000` | Where `/api/v1` and `/rt` are proxied. Rewrites are compiled into the build, so set it before `next build` |
| `NEXT_PUBLIC_RT_URL` | build | the page's origin | Connect the socket to another origin instead (an edge that routes `/rt` itself) |

Locally: `npm run infra:app` (or `infra:up` plus the API from `apps/api`), then `npm run dev`.
Sign in with any Iranian mobile number; the API's console SMS driver writes the code to its log
(`"text":"کد ورود شما به تسک‌دون: 123456"`). A new number signs up with a name and then creates
its first workspace, which asks for the admin password owners need for sensitive actions.
Invitations sent by SMS log a link (`/invite?token=…`): open it in another browser, sign in with
the invited number, and the account joins that workspace. An account that has set a password (in
«امنیت و ورود») may also sign in with phone and password; «فراموشی رمز عبور» texts a reset code
(`"text":"کد بازنشانی رمز عبور تسک‌دون: 123456"`) that sets a new one (RFC Addendum I).

**How the data flows.** The reducer the screens were built on is unchanged; `store/live` feeds
it. After sign-in one round of parallel requests loads the workspace into the reducer. Every
action is applied at once (the optimistic update) and then sent to the API, which answers with
its ids, versions and placements; those replace the optimistic values, and changes made to a
still-local entity wait for its server id. A refusal is shown as a toast and the entity is
re-read; a stale version (`412`) reloads the task as it now is. Socket events — other people's
messages, typing, read cursors, reactions, presence, task and column changes, notifications,
membership and permission changes — become `sync/*` actions. The socket subscribes before the
load, so events that arrive meanwhile wait and are applied after it; after a reconnect,
`sync:resume` replays what was missed. The access token lives in memory only; the refresh token
is an HttpOnly cookie, refreshed a minute before the access token expires and once more on a
`401`. Signing out revokes the session on the server and clears both.

**Files.** Uploads go from the browser straight to object storage with the presigned POST (or
multipart parts above 16 MB) the API plans; the API then checks the stored bytes. The bucket must
therefore allow the web origin by CORS (and expose `ETag` for multipart); SeaweedFS in development
reflects any origin. Stored files open through short-lived links from
`GET /files/:id/link`: images, audio and video in place, everything else as a download under its
own (Persian) name.

**Live end to end.** `npm run test:e2e:live` drives two browsers through one workspace: sign-up,
first workspace, a project, an SMS invitation accepted through its link, a task created and
assigned by one person and completed live on the other's board, a direct chat with delivery,
typing, read receipts and ❤️ / 👎 reactions, the notification quick views and «علامت‌گذاری همه
به‌عنوان خوانده‌شده», and sign-out from the profile menu. It also sends a file, an image and a
voice note (from a fake microphone), checks the shared-media tabs, turns a message into a task and
follows «پیام مبدأ» back to it, reorders subtasks, attaches a file to the task and creates a
workspace with an uploaded icon — each checked again after a reload. It reads codes and links from
`API_LOG` (the API's log file) and targets `BASE_URL` (default `http://localhost:3000`, which
must be an origin the API allows: its `PUBLIC_WEB_ORIGIN` or `CORS_ORIGINS`); any
console error or warning, hydration mismatches included, fails it. CI runs it against the
Compose API and a production build of the web app.

**Platform super admin** (`/admin`, RFC Addendum H). The operators of TaskDoon itself get a separate
shell with three sections: «کاربران و سشن‌ها» (user directory, workspaces and exact roles, sessions
with IP and device, ending sessions, single-use password reset codes), «رصد پیام‌ها و گروه‌ها»
(conversations and messages with date, type and sender filters) and «ورک‌اسپیس‌ها و نقش‌ها». It also
has an audit log of everything looked at. Only flagged accounts get in, and only after a password
step-up. Everyone else gets a 404, and the workspace app never links there.

- **Flag an account** from the server: `npm run platform-admin -w @taskin/api -- grant 09121234567`. Use `revoke` to remove the flag and `list` to see who has it. It needs `DATABASE_MIGRATOR_URL`.
- **Database role.** The API reads across tenants only through the read-only
  `taskin_platform_admin` role on its own pool: set `DATABASE_PLATFORM_ADMIN_URL` (the Compose
  stack does). Without it, or with a role that cannot log in, the admin routes answer 503. If the
  database volume is older than the role, run
  `docker exec -i taskin-postgres-1 psql -U postgres -d taskin < infra/postgres/platform-admin-role.sql` once.
- **With a password.** An admin may sign in with phone and password instead of the SMS code. The panel then asks once for a code sent to their own phone, and then for the usual password step-up.
- **Live test.** `npm run test:e2e:live:admin` needs `API_LOG` like the live flow. It flags its
  operator with `GRANT_PLATFORM_ADMIN` (default: the local API build's CLI).

---

## Typography

`IRANYekanX` is self-hosted from `public/fonts` as WOFF2. **Two masters ship in this
repository** (Medium and ExtraBold), and `apps/web/src/styles/fonts.css` declares each `@font-face`
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

Three layers, all in `apps/web/src/styles/tokens.css`:

1. **Primitive ramps** — raw `R G B` channel triplets, so Tailwind's `<alpha-value>` slot
   works (`bg-surface/80`, `text-fg-primary/60`).
2. **Accent alias** — `--brand-50…900` is re-pointed by `[data-accent]`, together with three
   accessible anchors: `--brand-solid` (fill carrying white text), `--brand-solid-hover` and
   `--brand-ink` (brand text on light surfaces). Components never name a palette or a ramp
   step for text or fills.
3. **Semantic surfaces** — `--bg-*`, `--fg-*`, `--border-*`, `--status-*`. These flip in dark
   mode; every component reads only this layer.

### Colour modes

`data-theme="light" | "dark"` on `<html>`. "System" resolves to one of the two at runtime so
there is a single source of truth in the DOM. Dark mode is OLED Charcoal: `#0C111D`
background, `#161B26` cards, `#1F242F` borders.

### Accent palettes

Six swappable Primary 50→900 scales, selected with `data-accent`, each in light and OLED dark:

| Accent   | Name              | Primary 600 | Accessible anchors                          |
| -------- | ----------------- | ----------- | ------------------------------------------- |
| `indigo` | سازمانی پیش‌فرض    | `#3538CD`   | default (600 fill, 600 ink) — the default   |
| `teal`   | تمرکز عمیق         | `#0E766E`   | ink → 700 (600 on its hover tint is 4.46:1) |
| `violet` | استارتاپ مدرن      | `#6941C6`   | default                                     |
| `rose`   | رز شرابی           | `#9E165F`   | default                                     |
| `amber`  | گرمای سازمانی      | `#B54708`   | ring → 600 (500 is 2.2:1 on white)          |
| `ocean`  | اقیانوس عمیق       | `#088AB2`   | fill + ink → 700 (600 is 3.9:1 with white)  |

A palette keeps its 600 identity colour for borders, rings and swatches; only the steps that
carry text move where the 600 would miss AA. `npm run check:contrast` parses `tokens.css`,
resolves the cascade for all 6 palettes × 2 modes and asserts 26 text/fill pairs each (body
text, brand text on surface/canvas/tint, button fills, status and tag badges, selected-card
borders and focus rings). In dark mode `--border-brand` uses the 400 step, which clears 3:1 on
charcoal under every palette, so selected and hovered cards share one border treatment.

Custom Kanban columns and note colour tags draw from a separate fixed set of eight **tag tones**
(`--tag-*`) that do not follow the accent, so a red column stays red under every palette.

### Status tokens

Done `#027A48` · In Progress `#B54708` · Blocked `#B42318` · Todo `#667085`. In dark mode the
foreground steps lift to the 300/400 range so they clear WCAG AA on charcoal.

### No flash of the wrong palette

`THEME_BOOTSTRAP_SCRIPT` (in `apps/web/src/lib/theme.ts`) runs synchronously in `<head>` before first
paint and writes `data-theme` / `data-accent` from `localStorage` or the OS preference.
`ThemeProvider` then adopts exactly what the script applied, so React hydrates against the
attributes it would have produced itself. The theme also syncs across open tabs via the
`storage` event, and falls back to an in-memory theme when storage is blocked.

**Zero hard-coded hex values exist in any component class.** The only raw hex outside
`tokens.css` is the swatch preview in the theme picker, which must render all six palettes
at once and therefore cannot read the single active `--brand-*` variable.

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
  mirroring — only `gridColumnStart` / `gridColumnEnd`. Later days sit at a *negative*
  `scrollLeft`, so the week buttons work in "px from the window's first day" and apply the
  sign of the document direction.
- **Avatar stacks** use `flex-row-reverse` plus a negative inline margin so the first member
  still stacks on top.
- Separators between a word and a number use the Persian comma `،` rather than `·`, which is
  a bidi-neutral character and renders ambiguously next to digits.

---

## Jalali calendar

`packages/jalali` implements the Solar Hijri arithmetic conversion (the 33-year
leap-cycle algorithm) with no runtime dependency on `Intl`, so output is byte-identical on
every platform and ICU build. `npm test` verifies it day by day against
`Intl.DateTimeFormat('en-u-ca-persian')` across 1990–2035 (16,801 days): **zero mismatches**,
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
apps/web/src/
├── app/                    # App Router routes (one per module) + root layout
├── components/
│   ├── ui/                 # Headless-ish primitives: Button, Switch, Modal, Drawer, …
│   ├── icons/              # ~60 hand-authored Iconsax-style glyphs
│   ├── overlays/           # OverlayProvider (global dialog store) + OverlayHost
│   ├── layout/             # AppShell, NavRail, TopAppBar, BottomNav, QuickCreate, search
│   ├── chat/               # ChatView, MessageBubble, VoicePlayer, composer, shared-media tabs
│   ├── tasks/              # Kanban, List, Gantt, Inspector, Jalali date picker, swipe rows
│   ├── calendar/           # Month grid, day summary, event dialog
│   ├── notes/              # Category sidebar, block editor with live checklists, Markdown renderer
│   ├── notifications/      # Notification centre drawer
│   ├── account/            # Profile, security & sign-in, sign-out dialogs
│   ├── auth/               # Live sign-in (SMS code), first workspace, loading and connection states
│   ├── directory/          # Invite dialog (email or Iranian mobile)
│   ├── workspace/          # Switcher menu, create / settings / delete-workspace dialogs
│   ├── rbac/               # Permission matrix + advanced editing modal
│   └── theme/              # ThemeProvider, ThemePicker
├── api/                    # REST client, session and tokens, Socket.IO client, API → domain mappers
├── data/                   # Typed reference data + seed workspace fixture (the demo data source)
├── hooks/                  # focus trap, scroll lock, roving focus, media query, clock
├── lib/                    # formatting, link metadata, downloads, tag tones, theme bootstrap
├── store/                  # Pure reducer + selectors + container provider
│   └── live/               # LiveStore: loads from the API, sends changes, applies socket events
└── styles/                 # fonts.css, tokens.css
```

The domain model lives in `packages/contracts`, the Jalali engine in `packages/jalali`, and the
Persian text helpers (digits, mobile numbers, monograms, note Markdown and checklists) in
`packages/text`; the app imports them as `@taskin/contracts`, `@taskin/jalali` and
`@taskin/text`.

### Separation of concerns

`WorkspaceProvider` is the **single stateful container**. Everything below it is
presentational: it receives data and callbacks and owns no domain state. `workspace-reducer.ts`
is a pure function with a closed, exhaustively-switched action union — it has no React
import and is directly unit-testable. In the live app `LiveStore` sits beside it: the provider
applies each action to the reducer and hands it to the store, which sends it to the API and
feeds server answers and socket events back as `sync/*` actions (see Live app). The screens do
not know which data source they run on.

Every modal dialog lives in one global store, `OverlayProvider`, mounted in the root layout
above all routes. `useOverlays()` opens any of them from anywhere — the rail, a board column,
a calendar cell, a note — and they survive the route change some flows trigger (creating a
chat navigates to `/chats`, an event to `/calendar`). The store holds a single closed
`Overlay` union, so exactly one dialog is open at a time; `OverlayHost` renders each one once
and is the only place that turns their callbacks into reducer actions. It also binds the
quick-create shortcuts **N** (new task) and **M** (new chat), matched on `KeyboardEvent.code`
so they work on a Persian keyboard layout and ignored while typing. `AppShell` keeps only the
inspectors, which follow the workspace state's `inspector`: a task's details open in a
centred dialog, and a conversation's details dock into the layout on `/chats`.

## Modules

Navigation runs میز کار → پروژه‌ها و وظایف → گفتگوها → تقویم → یادداشت‌ها → اعضای سازمان on
the rail, and میز کار · وظایف من · گفتگوها · تقویم · بیشتر on the mobile tab bar.

- **Workspaces** — the switcher (rail badge on desktop, top bar on mobile, «بیشتر» on phones)
  lists every workspace. «ایجاد فضای کاری جدید» asks for a name, an optional description and
  an icon: an uploaded image (read locally as a data URL, images only, ≤1MB) or, without one,
  a two-letter monogram generated from the name on a chosen colour. The new workspace is
  registered and becomes active at once. Each workspace owns its own tasks, columns, chats,
  events, notes, notifications, invitations and activity; switching parks the current slices
  and restores the target's, while the account, profile, permissions and theme carry across.
  «تنظیمات فضای کاری» shows the owner and a danger zone: only the **Owner** can delete, never
  the last workspace, and only after typing the workspace's exact name and ticking an
  acknowledgement in a dialog that ignores overlay clicks.
- **Feed** — summary cards, progress, «نیاز به اقدام شما» with a quick-complete checkbox per
  task (a task ticked here stays listed, struck through, so it can be unticked in place) and
  the workspace's recent activity.
- **Chats** — messages append at the tail and the thread follows them with a smooth scroll;
  a conversation always opens at its newest message. Date dividers (امروز / دیروز / weekday)
  sit in the message flow rather than floating. Seven quick reactions (👍 ❤️ 🔥 🙏 ✅ 👀 👎)
  toggle per member, with counter pills that ring the ones you added. Clicking the header
  title opens the details panel, whose «رسانه‌های مشترک» section is split into tabs with
  counts and empty states: files and documents (size, time, download), photos and videos (a
  grid with a preview dialog), audio (an inline mini player with a scrubber) and links (site,
  title and host, parsed from message text).
- **Tasks** — board, list and Jalali Gantt. Every project has a board of its own: it starts
  with its own copy of the four built-in columns, and a column added, renamed, moved or
  deleted on one project's board never reaches another's. A project's board also shows its
  sub-projects' cards, each in the column of its status. «همه وظایف» and the smart views group
  every card by status in four columns, which are not edited there. Columns are added from the
  dashed «افزودن ستون جدید» card (name + accent colour),
  which scrolls the board to its far (left, in RTL) end and focuses the name field. Every
  column is 320px wide, so a new column extends the board, which scrolls sideways, instead
  of narrowing the others. A task opens in a centred dialog: the work (description,
  checklist, source message, files, discussion) beside its properties. Every
  column's ⋮ menu renames it inline or deletes it: an empty column goes at once; one with
  cards asks whether to move them to another column or archive them. The last column can
  never be deleted, and a task whose column disappears falls back to the first one rather
  than going missing. Search lives in the page header as an expanding icon next to «وظیفه
  جدید». Custom columns take part in drag and drop and keyboard moves; tasks in them count as
  in progress. Every card and row has a quick-complete checkbox: checking moves the task to
  «انجام شد» with a struck-through, muted title; unchecking returns it to the column it came
  from (or «برای انجام» when it has no history). The list view collects completed work in a
  collapsible group. The Gantt loads twelve weeks of fixed-width days, opens on today, and
  scrolls sideways; «هفته قبل» / «هفته بعد» glide a week at a time and load four more weeks
  past either end, and the header shows the dates in view. Hovering or focusing a bar shows
  its title, status and dates. The task column is `sticky` on the inline-start edge and
  opaque (`z-20`) so bars (`z-10`) slide beneath it over the grid lines (`z-0`), under a
  sticky header (`z-30`).
- **Calendar** — deadlines, meetings, reminders and project milestones only. One toolbar sits
  above the grid: the legend, then the month navigation (previous, month, next, امروز)
  centred on the grid, then «رویداد جدید». A day shows at most two badges; the rest fold into «+X مورد دیگر», which opens the day summary. Clicking
  any day opens the task composer with that Jalali date as the deadline. Deadlines are derived
  from live tasks, never stored twice.
- **Notes** — the notebook column holds its actions: «یادداشت جدید» beside the «دفترچه
  یادداشت» title, and a dashed «افزودن دسته» row above the categories («همه یادداشت‌ها» first
  and active by default). Every category but «همه یادداشت‌ها», the built-ins included, has a
  delete button; it asks «آیا از حذف این دسته‌بندی اطمینان دارید؟» first, and the category's
  notes are never deleted with it: they stay under «همه یادداشت‌ها» as «بدون دسته». The list header
  keeps the expanding search (and, on phones, the categories button and a new-note button).
  A new note lands in the active category, and the editor has a category switcher. In
  edit mode, `- [ ]` / `- [x]` lines render as real checkboxes with inline text inputs —
  Enter adds the next item, Backspace on an empty one leaves the list, typing `[] ` starts
  one — and everything is stored back as plain Markdown. A pinned shelf and colour-tag
  filters sit in the sidebar. «تبدیل یادداشت به وظیفه» opens the
  composer pre-filled; open checklist items become subtasks and the note links to the task.
- **Notification centre** — a drawer from the rail bell with همه / خوانده‌نشده / اشاره‌ها
  tabs, actor avatars, relative Jalali times, per-item and bulk mark-as-read; a card opens its
  task or conversation.
- **Invitations** — one field takes emails and Iranian mobile numbers together. Each entry is
  classified as it is committed: a mobile number in any common form (`09…`, `+98…`, `0098…`,
  grouped with spaces or dashes, Persian or Latin digits) is normalised to `09xxxxxxxxx` and
  invited by SMS; an email is invited by email. Chips and the pending queue carry an envelope
  or handset icon, existing members and pending invitations are flagged per entry, and a
  space inside a half-typed number groups digits instead of committing it.
- **Account** — the profile menu opens «پروفایل من» (presence and status line), «امنیت و
  ورود» (password change with strength meter, SMS two-step sign-in, active sessions) and a
  sign-out confirmation that clears the session state and routes to `/signed-out`.

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
`MessageBody`, `ThemeMode`, `AccentId`, `SmartViewId`, `ChatFilterId`, `NotificationEvent`,
`NotificationFilterId`, `CalendarEventKind`, `TagTone`, `Overlay`.

---

## Accessibility

- **Modals, drawers and sheets** implement the full WAI-ARIA dialog contract: `aria-modal`,
  labelled by their title, focus trapped (verified: focus never escapes across 40 tabs),
  Escape to close, background scroll locked (reference-counted for nesting) and focus
  restored to the opener.
- **The task dialog** is modal everywhere: focus moves to the dialog (so its name is read
  first), stays inside it and returns to the card that opened it.
- **The conversation inspector** is a docked column on desktop — it does *not* trap focus or
  lock scroll there, because the chat stays interactive — and promotes to a full dialog on
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
  Master switches report `aria-checked="mixed"`; the knob stays fully at the off end (never
  mid-track, in either direction) and shows a dash, so a partial state reads as partial.
- Icon-only controls require a `label` prop at the type level.
- Tables use `<caption>`, `scope` and `aria-sort`.
- A skip link targets `#workspace-main`; `prefers-reduced-motion` disables all animation.

---

## Layout

**Desktop (≥1024px)** — a four-column shell on a 1440px grid: 64px navigation rail pinned to
the inline-end (right) edge, 300px contextual sidebar, fluid workspace, and a 380px
collapsible conversation inspector on `/chats`. Kanban columns are a fixed 320px and the
board scrolls sideways (smoothly) once they outgrow it; task details open in a centred
dialog (at most `max-w-4xl`, 90% of the viewport's height).

**Mobile (375–414px)** — top app bar (workspace switcher, quick create, search,
notifications), five fixed bottom tabs (میز کار · وظایف من · گفتگوها · تقویم · بیشتر — notes
and account actions live under بیشتر) and per-route adaptation: the chat list pushes to a detail view, and the task
list becomes a swipeable single column with the contextual sidebar behind a فیلترها toggle.
Swipe right completes a task, swipe left opens postpone/reassign. Long-pressing a chat bubble
opens a sheet whose primary action is «تبدیل مستقیم به وظیفه», pre-filling the composer with
the message text and any attachment. Verified: zero horizontal overflow on every route at
390px.

---

## What is not wired yet

The live app persists and synchronises what the screens do through the API: sign-in and
sessions, workspaces (with their icons), invitations, roles and permissions, projects, the board
and its columns, tasks with ordered subtasks, comments and files, chat (messages, files and voice
notes, reactions, read receipts, typing, pins and mutes, the shared-media tabs, and messages
turned into tasks), the calendar, notes, notifications and presence. What is still missing:

- **«نامرئی».** The server derives offline from connectivity, so the invisible status is stored
  as «خارج از دسترس».
- **Two-step sign-in.** The SMS code is already the first factor, so the live security dialog
  offers the admin password instead of the demo's SMS two-step switch.

The demo data source (`NEXT_PUBLIC_DATA_SOURCE=demo`) is the complete front end against an
in-memory fixture (`apps/web/src/data/workspace.ts`), which the Playwright suites drive.
Consequences worth stating plainly for it:

- **Voice messages have no audio files.** `VoicePlayer` implements both transports: when a
  message carries a `src` it drives a real `HTMLAudioElement` (seeking, `timeupdate`,
  duration); with `src: null` — the state of a recording that is still uploading — it runs a
  `requestAnimationFrame` clock over the known duration so scrubbing and progress still work.
  The seed data uses the second path.
- **Shared files have no binaries.** Attachments carry `url: null`, so «دانلود» saves a small
  text receipt named after the file; an attachment with a real `url` downloads it directly.
  Media previews are drawn from the file's kind and name.
- **Workspace icons stay in memory.** An uploaded icon is kept as a data URL in state and is
  never sent anywhere; invitations likewise record the channel (email or SMS) without sending.
- **Avatars are generated initials**, not uploaded images, so no binary assets ship in the
  repository. `AvatarTone` selects from the neutral and status ramps rather than the brand
  ramp, so members stay distinguishable when the workspace accent changes.

In the demo, state changes (moving cards, adding, renaming and deleting columns, archiving
tasks, editing permissions, sending messages, creating tasks, events, notes, categories,
invitations and workspaces) are real and flow through the reducer; they reset on reload because
nothing is persisted except the theme. By the same token the demo's account flows are front-end
only: the password form validates locally and records the change time, and signing out resets
the in-memory session — a full reload starts a fresh signed-in session.

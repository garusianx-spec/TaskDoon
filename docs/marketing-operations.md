# Marketing website operations

## Run locally and configure deployment

Use the existing checkout and npm workspaces; no additional backend, identity system, or
external CMS service is required. From the repository root:

```bash
npm ci
npm run infra:up
cp -n apps/api/.env.example apps/api/.env
set -a
. apps/api/.env
set +a
npm run db:migrate -w @taskin/api
npm run dev -w @taskin/api
```

In a separate terminal at the repository root, run `npm run dev`. The public website is at
`/`; `/feed` opens the existing sign-in and workspace application. For a production local
check, run `npm run build`, then `npm run start -w @taskin/web -- -p 3000` instead of the
frontend development server. Preserve an existing `.env` and its values.

The API uses the same database, Redis and S3 configuration as the workspace application.
The web server needs `TASKIN_API_ORIGIN` at runtime for server rendering (default
`http://localhost:4000` locally; `http://api:4000` in the production Compose network).
Browser API rewrites also use that variable at build time. Set `SITE_URL` to the public,
canonical origin in deployment; the published `settings.data.siteUrl` is the fallback.
The final local fallback is `http://localhost:3000`, which must not be used as a production
canonical domain. No new secret or analytics key is required to run the website.

In cloud machines where the supplied egress proxy is inherited by a container's loopback
probe, retain the onboarding override `/workspace/.taskdoon/compose.yml` if present:

```bash
docker compose -f infra/docker-compose.yml -f /workspace/.taskdoon/compose.yml \
  up -d --wait postgres pgbouncer redis-core redis-rt s3 mailpit
docker compose -f infra/docker-compose.yml -f /workspace/.taskdoon/compose.yml \
  run --rm --no-deps s3-init
```

This override only changes the local storage health probe; it does not disable TLS or
change outbound service access. PostgreSQL initialization scripts must be readable by the
container user, as prepared by the onboarding installation instructions.

## CMS architecture and administration

Migration `0021_site_cms` adds `site_documents`, `site_revisions`, `site_submissions`,
`site_redirects`, `site_media` and `site_audit_log`. Drizzle metadata and the catalog schema
snapshot are committed beside the migration. Content kinds are typed in
`packages/contracts/src/site.ts`; pages and sections live in validated JSONB snapshots.
Site data is platform scoped and does not change workspace plans, tenant attachments or
entitlements. RLS protects editorial drafts and submissions. Public reads use the narrow
`app.published_site_documents` database projection, which cannot return the draft column.

The migration seeds 29 Persian documents. It never overwrites an editor's existing content.
Legal policies and unpopulated blog/help publishing entry points remain drafts. No fictional
job openings, customers, reviews, certifications or paid prices are seeded. Initial seed
revisions are preserved. Existing plan IDs `free`, `team` and `enterprise` remain operational
identifiers; editable marketing prices and copy do not activate a paid subscription.

Grant the platform-admin flag through the existing server-side operator CLI, with a
migrator connection loaded in that operator shell:

```bash
npm run platform-admin -w @taskin/api -- grant <existing-mobile-number>
```

Sign in at `/admin/site` with the existing mobile OTP session and complete the password
step-up. A workspace owner/admin is not automatically a platform administrator. The
ordinary workspace interface does not advertise privileged admin controls.

Website administration includes pages, features, pricing, articles, FAQs, help, careers,
reusable content, media, navigation, settings, SEO, activity and separate request inboxes.
Open `/admin/site/pages`, choose a page, and edit its structured fields and sections.
Use drag handles or keyboard-operable up/down buttons to reorder sections. Save the draft,
open the protected preview, and explicitly publish when ready. Saving a draft leaves the
public snapshot unchanged; publication updates server HTML, metadata and sitemap without
an application rebuild because editorial fetches are uncached. Preview forms cannot submit.
Restoring a revision restores a draft; publishing that restored draft is a separate action.
Unpublish or archive removes the document from public reads and sitemap. Changing a published
slug creates a permanent redirect when the new version is published.

Use the media library to upload PNG, JPEG, WebP or GIF images up to 10 MiB, enter descriptive
alt text, and select them in the section editor. The server checks the stored size and file
signature and copies finalized images to an immutable public-media key. Public site assets
are separated from private workspace attachments. An asset used by published content cannot
be archived until those references are removed or unpublished. Uploading SVG, arbitrary HTML
or JavaScript is not supported.

Contact, collaboration, demo and job-application forms store requests in PostgreSQL. An
application needs a real published job ID. Submissions require consent, valid contact details,
server validation, an empty honeypot and rate-limit allowance. Administrators can search the
inboxes, paginate, change status and save internal notes. Confirmation means the request was
stored; no outgoing email delivery is claimed. CMS mutations use the existing bearer session,
password step-up and CSRF cookie/header checks and write the shared correlated audit trail.

The SEO area exposes metadata diagnostics, canonical inspection, actual sitemap preview,
public HTML/JSON-LD inspection and redirect management. These checks describe locally
verifiable content, not rankings or a fabricated SEO score. Optional Search Console verification
metadata is supported. GA4/GTM IDs may be stored for later configuration; no tracking script
runs merely because an ID is saved.

## Product and design evidence

The public website shares the existing `IRANYekanX` fonts, `Logo` component, icon language,
semantic Tailwind colors, radius scale, focus treatment, and reduced-motion rules with the
workspace application. `apps/web/src/styles/tokens.css` remains the source of truth for six
accents and light/dark surfaces. Marketing typography may be larger than workspace labels;
its family, Persian line spacing, contrast, and interaction patterns remain consistent.

The product previews are captures of the real TaskDoon frontend running with
`NEXT_PUBLIC_DATA_SOURCE=demo`. Their people, conversations, and projects come from the
repository's synthetic demo seed, rather than a customer's workspace. The pictures describe
existing product screens, not an alternate dashboard or promised capability. Preserve this
distinction when replacing media; obtain permission before publishing customer information.

To refresh these assets, build and start a separate copy with
`NEXT_PUBLIC_DATA_SOURCE=demo` on a local port, then run from `apps/web`:

```bash
BASE_URL=http://localhost:3101 CHROMIUM_PATH=/usr/bin/chromium \
  node scripts/capture-marketing-previews.mjs
```

Use an installed trusted Chromium executable or omit `CHROMIUM_PATH` when Playwright's
browser is installed. The capture script refuses a source other than `demo`. It writes six
1440 × 960 PNGs under `apps/web/public/marketing/`; render them responsively with stable
dimensions. Keep this demo build separate from a live `.next` output so refreshing screenshots
does not change how the production application obtains workspace data.

Capabilities verified in the existing frontend include:

| Capability | Implementation evidence |
| --- | --- |
| Kanban, list, Gantt, and backlog views | `apps/web/src/app/(app)/tasks/page.tsx`, `components/tasks/` |
| Team conversations, attachments, and voice | `components/chat/ChatView.tsx`, `AttachmentPreviewModal.tsx`, `VoicePlayer.tsx` |
| Tasks created from messages | `components/chat/ChatView.tsx` |
| Notes and interactive checklists | `components/notes/NoteBlockEditor.tsx`, `NoteMarkdown.tsx` |
| Calendar and events | `apps/web/src/app/(app)/calendar/page.tsx`, `components/calendar/` |
| Workspaces and role settings | `components/workspace/`, `app/(app)/settings/roles/` |
| Persian, RTL, Jalali dates, and themes | root layout, `packages/jalali`, `styles/fonts.css`, `styles/tokens.css` |

The sign-in and free-start destination is `/feed`. The existing workspace authentication gate
handles SMS codes, registration, and first-workspace onboarding there. A signed-in person
continues into the workspace. No separate marketing account database is needed.

Read-only requests to Linear, Asana, Monday.com, ClickUp, Notion, Slack, Google Search Central,
and web.dev were attempted on 2026-10-17. The execution environment's proxy rejected all of
them with HTTP 403 before connecting. No claim of inspecting their current visual design or
running Google's external validation tools is made. The original design follows established
SaaS practices: a short benefit-led introduction, real product demonstration, progressive
feature explanations, visible conversion links, readable pricing, and a concise mobile menu.
No external brand assets, customer logos, reviews, or statistics are used as product evidence.

## Editorial and business review

Before launching, the product owner should approve the public copy, contact details, paid-plan
presentation, job openings, and any company biography. Publish only verified information.
`free`, `team`, and `enterprise` are stable backend plan identifiers; marketing prices and
descriptions do not grant operational entitlements. A paid-plan inquiry must lead to the
configured sales/demo form until actual billing exists. Do not describe it as checkout.

Terms and privacy drafts are editorial structures requiring legal and business review. A
saved draft is not an approved policy. Review consent copy and retention requirements before
enabling public collection or tracking. Do not add certification, compliance, uptime,
customer-count, testimonial, or performance claims without supporting evidence.

Use descriptive Persian headings and alt text. Publish useful distinct feature explanations,
and link them from the features index or relevant sections. Keep unfinished articles and
unverified job listings unpublished. A draft or retired URL must not become an indexed thin
page merely to fill navigation.

## Search Console launch procedure

These are operator steps for the real production domain. Local build and browser checks do
not complete domain ownership verification, indexing, or field-performance measurement.

1. Configure the actual public HTTPS origin in the site's canonical settings. Check that
   metadata, structured-data URLs, media URLs, redirects, and sitemap URLs use that origin.
2. Add a Search Console Domain property using an account authorized by the domain owner.
   Install the exact DNS TXT record supplied by Google through the DNS provider and verify
   ownership. Keep the record after verification. A URL-prefix property is an alternative
   when the available ownership method and deployment require it.
3. Open `/robots.txt` and `/sitemap.xml` on the production hostname. Confirm that the sitemap
   contains only published, indexable canonical URLs, returns XML successfully, and includes
   meaningful modification dates. Drafts, previews, `/admin`, and private workspace URLs
   must be absent.
4. Submit `/sitemap.xml` in Search Console. Record the submission date and processing result.
5. Inspect the homepage, one feature, and a published article with URL Inspection. Check
   Google's chosen canonical, crawl accessibility, rendered content, and indexing eligibility.
   Request indexing only for ready, public canonical content.
6. Inspect an unknown URL, a changed slug, and an unpublished draft directly. Verify actual
   HTTP 404/redirect responses and that draft text is unavailable to anonymous requests.
7. Monitor indexing diagnostics and sitemap processing after deployment, then review search
   queries, landing pages, impressions, and clicks as real data accumulates. Investigate
   duplicate canonical, excluded, and unavailable URL reports individually.

`robots.txt` is a crawling instruction, not authorization. Private workspace and administrative
data still require their existing authentication and backend permissions. Avoid blocking a
public URL in robots while expecting a crawler to read its `noindex` directive.

Relevant operator references, to consult when external access is available:

- <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>
- <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>
- <https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data>
- <https://support.google.com/webmasters/answer/9008080>

## Analytics and consent

Search Console verification does not require installing visitor analytics. Google Analytics 4
and Google Tag Manager remain optional integrations requiring business configuration and a
review of applicable privacy and consent requirements. Do not hardcode measurement IDs or
paste unrestricted script/HTML into CMS content.

An analytics integration should validate its measurement identifier, keep secrets server-side,
and enable tracking only after the configured consent requirement is satisfied. Withhold
optional scripts until consent when required, expose a way to withdraw that consent, and
verify rejection as well as acceptance. Describe collection accurately in approved privacy
copy. Never send form messages, names, phone numbers, email addresses, workspace IDs, session
tokens, or draft content as analytics event parameters.

Only claim an integration is connected after observing the production network requests and
the corresponding provider diagnostics with an authorized account. Ad blockers, consent,
regional requirements, and invalid identifiers can all affect delivery. Search Console,
GA4 DebugView, Tag Manager Preview, provider reports, and live consent behavior are external
checks pending real-domain access and approved configuration.

## SEO and performance verification

Local acceptance should inspect initial server HTML as an anonymous visitor: primary text,
one meaningful H1, crawlable links, title/description, one canonical, robots directives, and
accurate JSON-LD. Parse the JSON-LD locally; validate Google-supported search eligibility on
the live domain when the external tools are reachable. Organization and WebSite fields must
contain real information. Article metadata requires an actual published article; do not
invent authors, reviews, awards, or offers. FAQ markup alone does not guarantee rich results
for a SaaS website. Do not emit `hreflang` for translations that do not exist.

After changing a page in the CMS, separately verify that saving a draft leaves public HTML
unchanged, protected preview shows the draft, publication updates anonymous HTML/metadata,
and an independent request or server restart still observes the saved content. Check sitemap
membership and redirect behavior after slug or indexing changes. Include keyboard operation,
form errors, a narrow mobile viewport, dark mode, and a non-default accent in the browser
review. Product previews need responsive dimensions, descriptive alt text, and stable space
before loading.

The Core Web Vitals goals are LCP ≤ 2.5 s, INP ≤ 200 ms, and CLS ≤ 0.1 at the 75th percentile
of real-user visits. A successful build, screenshot, or local Lighthouse run is not evidence
that those field thresholds have been reached. Record measured lab results with their device,
network profile, URL, and date. Review Search Console's Core Web Vitals report or a configured
privacy-appropriate real-user measurement system after sufficient production traffic exists.

Reference: <https://web.dev/articles/vitals>.

## Deployment review record

Record actual execution results rather than treating this checklist as a claim of completion:

| Check | Evidence to record |
| --- | --- |
| Migration and public seed | Migration identifier, run date, target environment |
| Type check, lint, tests, build | Exact commands and exit status |
| CMS publication | Draft/published revision and observed public response |
| Public forms | Submission identifier and authorized inbox read |
| Authorization | Anonymous and non-platform-admin write refusals |
| Crawlability | HTTP status, canonical, robots, and sitemap checks |
| Mobile and accessibility | Viewports, keyboard flow, errors, and overflow review |
| Search Console | Pending until real property verification and sitemap processing |
| Analytics and consent | Pending until approved configuration and live verification |
| Field performance | Pending until sufficient real-user measurements |
| Legal content | Pending until legal/business approval |


## Executed browser validation — 2026-10-17

The final production web build and live API were tested with:

```bash
API_LOG=/path/to/console-sms-api.log CHROMIUM_PATH=/usr/bin/chromium \
  BASE_URL=http://localhost:3000 npm run test:e2e:site
```

The API's local environment was loaded into the test process for the repository's platform-admin
CLI. The runner needs `DATABASE_MIGRATOR_URL` for its temporary operator grant/revoke, or the
existing `GRANT_PLATFORM_ADMIN` and `REVOKE_PLATFORM_ADMIN` command overrides. These are
operator credentials and must not be embedded in repository files or test output. The SMS
provider must be the local console driver; production SMS delivery was not tested.

The command exited **0: 86 checks passed, 0 failed, 0 browser console problems**. The session
log is `/tmp/taskdoon-site-e2e-final.log`. It verified:

- Anonymous server-rendered homepage content, metadata, canonical, parseable JSON-LD,
  sitemap and robots behavior, and a real HTTP 404 for unknown or unpublished pages.
- No workspace authentication/data initialization on the marketing homepage; the existing OTP
  registration and platform-admin password gate still work.
- Mobile navigation, Persian FAQ search and disclosure, product-preview keyboard controls,
  responsive core pages, and a dark mobile homepage using the existing teal accent.
- Native form validation, server validation, a real browser contact submission, independently
  persisted inbox data, private notes/status updates, and anonymous/non-admin access refusals.
- Draft isolation, protected no-store preview, title/SEO publication without rebuilding, actual
  editor title/section-order changes, save/reload, preview, and confirmed publication.
- Published-slug isolation from renamed drafts, permanent redirects, revision identity/history,
  restore-before-publish behavior, unpublication, and corresponding sitemap changes.
- Admin sitemap preview using the actual published slug and XML, and the local SEO tool
  parsing actual public HTML and JSON-LD.

The runner restored and independently compared the homepage's original published content and
any preexisting draft, archived temporary content/submissions, removed temporary redirects, and
revoked its temporary operator's platform-admin flag. The new account remains ordinary test data.
Draft legal, blog, and help index pages intentionally returned 404 pending approved publication.

The following **single-run local lab observations** came from Chromium PerformanceObserver
before screenshot scrolling. Both used the production homepage at `http://localhost:3000/`,
a device scale factor of 1, no CPU/network throttling, and disabled browser cache so resized
viewport loads did not reuse a different desktop image candidate. They are not field Core Web
Vitals results or production guarantees.

| Viewport | LCP | CLS | Navigation TTFB |
| --- | ---: | ---: | ---: |
| Desktop, 1440 × 1000 | 336 ms | 0.0614 | 55 ms |
| Mobile viewport, 390 × 844 | 112 ms | 0 | 32 ms |

INP and the 75th-percentile real-user thresholds remain pending. Search Console, analytics,
live-domain verification, consent operations, and Google's external structured-data tools were
not connected or verified by this test.

Full-page artifacts were captured after naturally scrolling and decoding the lazy product
images; every image had a valid decoded size. These generated files are intentionally ignored
by Git and are recreated by the live test:

- `apps/web/e2e/out/site-home-desktop.png`
- `apps/web/e2e/out/site-home-mobile.png`
- `apps/web/e2e/out/site-home-mobile-dark.png`
- `apps/web/e2e/out/site-editor.png`

## Final repository validation — 2026-10-17

The following checks ran against this implementation in the cloud development machine:

| Command/check | Observed result |
| --- | --- |
| `npm run build` | Passed, shared packages, API and Next.js production build |
| `npm run typecheck` | Passed across workspaces |
| `npm run lint` | Passed across workspaces |
| `npm test` | 199 unit tests passed |
| `npm run test:int -w @taskin/api -- --maxWorkers=3` | 308 tests passed in 25 files, including 16 new CMS integration tests |
| `npm run test:e2e:site` | 86 passed, zero failures, zero console problems |
| `npm run test:e2e:live` | Existing workspace regression: 114 passed, zero failures, zero console problems |
| `npm run check:contrast` | Six palettes × two modes × 26 token pairs passed WCAG AA contrast checks |
| `npm run db:check -w @taskin/api` | Passed |
| `npm run db:generate -w @taskin/api` | No schema changes; no unexpected migration generated |
| Fresh database migration/catalog snapshot | Migration 0021 applied and catalog snapshot generated from a fresh database |
| `docker compose -f docker-compose.prod.yml config --no-interpolate --quiet` | Passed configuration parsing; production images/deployment were not executed by this check |
| API restart persistence | Published homepage JSON was byte-equivalent after JSON serialization before/after restart; homepage returned HTTP 200 |
| `git diff --check` | Passed |

The checks establish local development and production-build behavior. They do not establish
live deployment, real-domain Search Console ownership, production email delivery, billing,
legal approval or field Core Web Vitals. Existing workspace routes and authentication were
exercised by the unchanged live flow. Scale/load suites and production container image builds
were not part of this final run.

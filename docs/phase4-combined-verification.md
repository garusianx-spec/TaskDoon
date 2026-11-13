# Phase 4 combined integration — local review

## Inputs and isolation

- Worktree: `C:\Users\garus\Documents\Codex\2026-10-07\taskdoon-phase4-integration`.
- Branch: `chore/phase4-combined-integration`.
- Phase 4 starting branch: `feat/chats-archive-phase4`, commit
  `44117fc1175a9b3db4051a28b67a27d6a3e0519b`.
- Pinned Phase 1: `236d884b9e33882116412e6fec438d01591fd5f8`.
- Pinned Phase 3: `f4bf926387fcc4e86d43b495fa5118ed29f9d4a2`.
- Phase 2 `9bba16287a2f208d9e04e4d3bd8e865baad44bc3` is an ancestor of the pinned Phase 3.
- Application merge: `fbe9b73df9bb7d42386e4eee6a4eec8bf57d48cc`, with the two pinned inputs as its parents.
- Later Phase 3 commit `29b83df17e3977c50884234f28ffe59677ce36f5` is **not** an ancestor of this integration.

The original Phase 3 working tree was not modified. Phase 4 is already an ancestor of pinned
Phase 1, so it was retained through a fast-forward, followed by a local merge of pinned Phase 3.
No push, merge into `main`, deployment, production write, provider-setting change, or live SMS
send is part of this work. The final local review SHA is supplied in the handoff and can be
obtained with `git rev-parse HEAD` in this worktree.

## Merge resolutions and verification changes

Four invitation UI files needed conflict resolution:

- `OverlayHost.tsx`: preserve Phase 3 permission gating and Phase 1 asynchronous confirmation,
  active-workspace department IDs, pending invitation refresh, and SMS retry.
- `DirectoryScreen.tsx`: retain mobile navigation, hide unauthorized invitation actions, and
  retain persistent SMS status/eligible retry and workspace departments.
- `InviteMemberModal.tsx` and `PendingInvitationRow.tsx`: combine optional, permission-gated revoke
  controls with the confirmed form submission and SMS delivery feedback.

The generation-scoped session implementation is unchanged from pinned Phase 1. The shared SMS
provider implementation and invitation creation service are also unchanged from that input.

Integration-only follow-ups:

- Exercise `/invitations/{id}/retry-sms` in the audit-trail test, preserving its requirement that
  every mutating OpenAPI route produces correlated audit records.
- Adapt the existing live-session browser test to Phase 3's More/Account navigation and task
  heading. Allow screenshots to go to an ignored local directory instead of overwriting Phase 1
  screenshots.
- Stop the E2E runner's own Next process correctly on Windows; retain process-group cleanup on
  Unix. No production runtime code changes are involved.
- Add separate mocked adapter and actual-creation contract audits for the requested SMS fields.

## Environment and safety boundary

Node 22.23.5, npm 10.9.10, Next.js 16.4.6. Dependencies were installed with:

```powershell
npm.cmd ci --offline --no-audit --foreground-scripts
```

This worktree has its own dependency installation. Test writes use dedicated disposable services:
PostgreSQL `127.0.0.1:55449`, Redis `127.0.0.1:56399`, and SeaweedFS S3 `127.0.0.1:58349`, bucket
`phase4-test-only`. Test databases and Redis namespaces are isolated by the existing harness.
Neither the existing local services nor production databases were used for write tests.

Browser tests use local Next servers only: port 3144 for production demo suites and port 3139 for
the opt-in real-local-API session suite. Both servers are stopped after their runs. SMS.ir send
and delivery HTTP responses are mocked. Other local auth/invitation flows use the existing
in-memory console transport; no real SMS.ir send was requested or performed.

## Commands and results

Run from this worktree with Node 22 on `PATH`:

| Gate                                        | Command / result                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| All workspace typechecks                    | `npm.cmd run typecheck` — passed, including contracts, API/tests and web                                 |
| Contracts build                             | `npm.cmd run build --workspace @taskin/contracts` — passed                                               |
| API build                                   | `npm.cmd run build --workspace @taskin/api` — passed                                                     |
| Web API-mode production build               | `npm.cmd run build --workspace @taskin/web` — passed                                                     |
| Web demo production build                   | `$env:NEXT_PUBLIC_DATA_SOURCE='demo'; npm.cmd run build --workspace @taskin/web` — passed                |
| All unit/component suites                   | `npm.cmd test` — 469 passed: API 280, web 170, Jalali 12, text 7                                         |
| Session generation/restoration/realtime     | Command below — 18 passed, including both old-session race regressions                                   |
| All API integration suites                  | Command below — 389 passed, 5 opt-in browser cases skipped and run separately                            |
| Opt-in browser cases against real local API | Command below — 5 passed                                                                                 |
| All production demo browser suites          | Command below — 587 checks passed / 20 suites, zero failed and zero page-console problems                |
| Chat archive browser suite                  | Included above; all 14 archive checks passed                                                             |
| Lint                                        | `npm.cmd run lint` — 0 errors, 20 existing warnings                                                      |
| Formatting                                  | `npm.cmd run format:check` — passed                                                                      |
| Migration consistency                       | `node node_modules/drizzle-kit/bin.cjs check --dialect=postgresql --out=apps/api/db/migrations` — passed |

Session regressions:

```powershell
npm.cmd test --workspace @taskin/web -- test/phase1-session-generation-verification.test.ts test/session-restore.test.ts test/realtime-session.test.ts
```

Full API integration, including archives, invitations, real storage, tenant isolation, generated
schema/OpenAPI consistency, and the 10,000-message concurrency case:

```powershell
$env:TEST_DATABASE_ADMIN_URL='postgres://postgres:postgres@127.0.0.1:55449/postgres'
$env:TEST_REDIS_URL='redis://127.0.0.1:56399'
$env:TEST_S3_ENDPOINT='http://127.0.0.1:58349'
$env:TEST_S3_BUCKET='phase4-test-only'
$env:PHASE1_BROWSER='0'
npm.cmd run test:int --workspace @taskin/api -- --maxWorkers=2
```

The five skipped cases are explicitly opt-in, and were run separately to avoid browser/build
contention with the database stress suite:

```powershell
$env:PHASE1_BROWSER='1'
$env:CHROMIUM_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PHASE1_SCREENSHOT_DIR="$PWD\.local\phase4-combined\screenshots"
npm.cmd run test:int --workspace @taskin/api -- test/integration/phase1-browser.test.ts --maxWorkers=1
```

Those cases verify `/more` refresh, direct `/tasks`, workspace preservation, no sign-in flash,
temporary failure/retry, actual server-confirmed expiry, revocation/sign-out, department form
validation and persistent invitation SMS feedback at 360/390 px.

Full demo browser run, after the demo build:

```powershell
$env:CHROMIUM_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:E2E_PORT='3144'
npm.cmd run test:e2e --workspace @taskin/web
```

The initial API run exposed the missing retry-route audit coverage; that was added, not exempted.
A contended audit rerun exceeded its existing 30-second budget while a build was running; the
uncontended targeted rerun and final full API run passed without increasing the timeout.
An over-adjusted archive desktop selector was restored to the existing `/tasks` project-tree
navigation. The subsequent full 20-suite run passed all 587 checks.

## Baseline SMS.ir audit before the invitation contract fix

The adapter-only fixture uses a fake template ID `30303` and a **synthetic, non-credential** token.
It verifies `POST https://api.sms.ir/v1/send/verify` with this exact parameter array:

```json
[
  { "name": "NAME", "value": "همکار نمونه" },
  { "name": "WORKSPACE", "value": "فضای آزمایشی" },
  { "name": "LINK", "value": "https://taskdoone.ir/invite/phase4-synthetic-token" }
]
```

The exact text returned by the existing local `renderSms()` for that fixture is:

```text
شما به فضای کاری «فضای آزمایشی» در تسک‌دون دعوت شده‌اید: https://taskdoone.ir/invite/phase4-synthetic-token
```

At the baseline SHA, this renderer ignored `NAME`. SMS.ir itself receives a template ID and parameters,
not this free-text rendering; no claim is made about the content of a real approved gateway
template. Separate SMS.ir login and password-reset OTP configuration/parameter tests pass.

## Baseline release-contract findings

The actual creation-flow audit sets only a **local test** `PUBLIC_WEB_ORIGIN=https://taskdoone.ir`
and verifies the existing outbox contract:

- Template key: `invite`.
- Supplied token keys: `workspace` and `link`; **no invitee name**.
- Actual generated link shape: `https://taskdoone.ir/invite?token=<generated-token>`.
- The generated token is sealed in the queue/database and is not reproduced in this report.

At the baseline SHA, the adapter could forward the synthetic `NAME` and path-form link above, but **the application
did not supply that name or generate `https://taskdoone.ir/invite/<token>`**. The local
renderer also did not personalize the invitee. These were the remaining functional contract blockers
for the requested SMS format, not passing assertions of that format. The audit tests deliberately
record the existing behavior so a green infrastructure/test run cannot be mistaken for fixing
these gaps. No unapproved template parameters, provider routing changes, inferred recipient names,
or incompatible invitation-link rewrites were introduced during integration.

**Real SMS.ir acceptance, handset delivery, and opening an SMS-delivered link were not run, as
requested.** Mocked acceptance/delivery reports and local invitation acceptance do not establish
real handset receipt. This branch is a local review candidate, not a release/deployment sign-off.

## Local review artifacts

- Archive screenshots: `apps/web/e2e/out/phase4_archive_1280.png`,
  `phase4_archive_375.png`, and `phase4_archive_list_375.png`.
- Phase 3 combined mobile navigation screenshots: `apps/web/e2e/out/phase3-*.png`.
- Masked session/invitation screenshots: `.local/phase4-combined/screenshots/`.
- Next-generated `apps/web/AGENTS.md` remains untracked and excluded from review commits.

Review the combined ancestry and local changes with `git log --graph --oneline` and
`git diff feat/chats-archive-phase4..HEAD`. No remote integration branch was pushed.

## Invitation contract follow-up from baseline 0b9bc7a

The two baseline findings above have been addressed in this worktree.

- The invitation form accepts an optional explicit name per SMS recipient. The request DTO trims
  it, limits it to 120 characters and rejects control characters. The existing address-only
  contract remains supported. Missing or whitespace-only names are omitted, and the local
  renderer uses the existing generic text. No name is inferred from a phone number, account
  directory, inviter, or workspace.
- The supplied name reaches the outbox and existing SMS.ir adapter. Named invitations carry exactly
  `NAME`, `WORKSPACE`, and `LINK` at the provider boundary. JSONB does not preserve token key
  order, so the integration assertion checks exact names and values independently of ordering.
- The first SMS attempt's existing JSON stores the explicit name for manual retries. Older rows
  without this optional property continue to work. The invitation view exposes the existing
  delivery summary, without exposing attempt metadata. No migration is needed.
- Newly generated SMS and email links use `/invite/<token>`. Both that route and previously
  issued `/invite?token=<token>` links use the same existing sign-in and acceptance flow.
  The path token takes precedence when both forms are present. Invitation pages return
  `Referrer-Policy: no-referrer`. Sealed outbox links and hashed acceptance tokens are retained.
- Permission gating, SMS provider routing, template IDs, credentials, and acceptance authorization
  use their existing implementations. OpenAPI was regenerated for the optional recipient field.

The named local-renderer fixture now produces:

```text
همکار نمونه عزیز، شما به فضای کاری «فضای آزمایشی» در تسک‌دون دعوت شده‌اید: https://taskdoone.ir/invite/phase4-synthetic-token
```

Verification for this follow-up uses the disposable services documented above and Node 22.23.3.
Initial regression runs reproduced the missing personalization, rejection of the name field,
and failure to capture the path token before the implementation changed.

- All workspace unit/component suites passed, 474 tests in total (API 281, web 174, Jalali 12,
  text 7).
- All workspace typechecks passed.
- All workspace lint passed with zero errors and the same 20 existing web warnings.
- Seven relevant real-database integration files passed, 58 tests. These cover invitation
  creation/acceptance, named and unnamed SMS, malformed names, manual retries, worker replay,
  idempotency, number mismatch, consumed/revoked/expired tokens, observability/OpenAPI, retention,
  and workspace moderation. Provider HTTP responses are synthetic.
- The opt-in real-local-API browser file passed all six cases. The added case creates a
  named invitation through the actual form, opens both canonical and legacy links, reloads
  before sign-in, completes OTP and signup through the UI, and verifies the accepted membership
  in the database. Both invitation responses return `Referrer-Policy: no-referrer`.
  The original five Phase 1 session/invitation browser regressions also pass. An initial test
  fixture requested two OTPs for the same synthetic user inside the resend cooldown; using the
  actual first-time signup journey corrected that fixture without changing OTP policy.
- The API build passes as part of the integration command. The API-mode web production build
  (`npm.cmd run build --workspace @taskin/web`, Next.js 16.4.6/Turbopack) passes, including
  TypeScript, prerendering, and standalone output. Its route table includes both `/invite`
  and the dynamic `/invite/[token]`.
- Formatting checks on all changed and added source/test files pass, as does `git diff --check`.

The seven integration files are `combined-invitation-contract.test.ts`, `invitations.test.ts`,
`invitation-sms.test.ts`, `invitation-sms-worker.test.ts`, `observability.test.ts`,
`retention.test.ts`, and `platform-workspace-moderation.integration.spec.ts`. Run them with
the disposable environment above and `npm.cmd run test:int --workspace @taskin/api -- <files> --maxWorkers=2`.
The browser command above runs `phase1-browser.test.ts` with `PHASE1_BROWSER=1`; screenshots for
this follow-up are isolated under `.local/phase4-sms/screenshots`.

The full baseline integration and demo suites were not repeated for this scoped fix.
Real SMS.ir acceptance and handset delivery remain unverified. All actual invitation sends
in these checks use local console transport or mocked HTTP. Provider settings and production
were not modified.

## Prelaunch critical audit

Invitation fixes are committed as `fc3d87cbf73cf2f704a98f9fd46acdd970a333d8`.
The audit branch `fix/prelaunch-critical-audit` starts at that commit. Ancestry checks confirm
that pinned Phase 1 `236d884`, Phase 3 `f4bf926`, Phase 4 `44117fc`, and the combined
verification baseline `0b9bc7a` are all ancestors.

The deliberately excluded `29b83df` was reviewed through its diff. It contains shared section
headers, navigation-row styling, unread-count descriptions, keyboard focus checks and larger
task-detail mobile controls. Those changes are relevant to the remaining touch-target and
Untitled UI consistency work. It contains no deadline default or personal-task scoping change
and remains outside this audit branch's ancestry.

### Production findings versus the current local implementation

| Production P1 finding                                    | Current integration state       | Evidence / follow-up                                                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A regular task silently receives today's deadline        | Already corrected locally       | `taskDraft()` starts with `dueDate: null`; the ordinary composer preserves null; API create defaults an omitted deadline to null. Existing persistence and date integration cases pass.                     |
| My Tasks includes unassigned/other-member tasks          | Already corrected locally       | The mobile destination is `/tasks/mine`. `ScopedTasks` applies `tasksAssignedTo(..., currentUser.id)` before search/filtering and the count uses the resulting list.                                        |
| Projects hidden behind Filters                           | Already corrected locally       | Independent `/projects` destination, project routes, and permission-gated project trash.                                                                                                                    |
| More hides useful destinations below appearance controls | Already corrected locally       | Five grouped destination rows; appearance and workspace controls have separate screens.                                                                                                                     |
| Mobile touch targets below 44px                          | Partially corrected; remains P1 | Shared header actions are 44px. Calendar month controls use the default 36px icon buttons, the event-dot strip has no minimum target, and task-detail close/star controls remain 32px.                      |
| Project deletion misstates companion chat retention      | Remains P1                      | `ProjectTrash.tsx` still groups the channel into the 40-day trash explanation. The project service permanently archives the companion channel. The confirmation should explain those lifecycles accurately. |

The original two production defects did not reproduce on the integration baseline. This audit
adds regression coverage around the existing corrections instead of changing their runtime logic.
The new date regression covers an omitted deadline, replay of the same creation command, title-only
editing, a fresh API read, and one stored undated task. The personal-scope fixture now includes an
unassigned task as well as another member's task and checks search results within that scope.

Targeted checks use only the disposable services above:

- Web `task-form-persistence.test.ts` and `mobile-navigation.test.ts`: 19 tests passed.
- API `task-form-dates.test.ts`: 5 real-database tests passed.
- The two added real-local-API browser regressions passed (`--testNamePattern=prelaunch:`).
  The six existing browser cases were skipped by that focused selection. The deadline case creates
  through the ordinary UI, verifies the POST response, edits only the title, reloads, reopens the
  task, and confirms that the calendar excludes it. The personal-scope case seeds two projects,
  another member and an unassigned task, then checks the personal list and its exact count after
  project navigation and reload.
- API typechecking passes. Targeted ESLint checks report no errors. Web test files are outside
  the repository's ESLint include patterns and are exercised by Vitest instead.
- Formatting and `git diff --check` pass. Production application code, dependency files and
  migrations are unchanged in this audit. The complete test suite was not repeated.

The focused browser command uses `PHASE1_BROWSER=1`, the disposable environment documented above,
and `npm.cmd run test:int --workspace @taskin/api -- test/integration/phase1-browser.test.ts --maxWorkers=1 --testNamePattern=prelaunch:`.
Its log is kept under `.local/prelaunch-audit/browser.log`.

The pre-existing generated `apps/web/AGENTS.md` stays untracked and outside review commits.

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

## SMS.ir: exact synthetic adapter parameters and local renderer

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

This renderer currently ignores `NAME`. SMS.ir itself receives a template ID and parameters,
not this free-text rendering; no claim is made about the content of a real approved gateway
template. Separate SMS.ir login and password-reset OTP configuration/parameter tests pass.

## Release-contract findings — requested name and link format are not met

The actual creation-flow audit sets only a **local test** `PUBLIC_WEB_ORIGIN=https://taskdoone.ir`
and verifies the existing outbox contract:

- Template key: `invite`.
- Supplied token keys: `workspace` and `link`; **no invitee name**.
- Actual generated link shape: `https://taskdoone.ir/invite?token=<generated-token>`.
- The generated token is sealed in the queue/database and is not reproduced in this report.

Thus the adapter can forward the synthetic `NAME` and path-form link above, but **the application
does not currently supply that name or generate `https://taskdoone.ir/invite/<token>`**. The local
renderer also does not personalize the invitee. These are remaining functional contract blockers
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

# Read-only closeout and shared public-form focus

Base: c5aa286fac6a227593013de1b2e15955dc72a338, fix/prelaunch-critical-audit.
Only the form feedback/focus portion changes product code. No admin, blog, task, chat,
permission, schema, API or deployment code is changed.

## Read-only closeout: unresolved scenarios

Route mappings below were verified in source. They are **not** evidence that a record was
located, a status was inspected, or an authorized session was available.

| Status  | Scenario                                                        | Environment / evidence                                                                                                                    | Exact missing prerequisite                                                                                                                          |
| ------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| BLOCKED | QA-261118 contact submission                                    | Expected normal workflow /admin/site/contacts; SiteInbox kind=contact. Actual record ID, location within results and status not observed. | Attached/supplied authorized admin session with inbox-view permission.                                                                              |
| BLOCKED | QA-261118 demo submission                                       | /admin/site/demo-requests; kind=demo. Actual record ID and status not observed.                                                           | Same authorized normal admin workflow session.                                                                                                      |
| BLOCKED | QA-261118 collaboration submission                              | /admin/site/collaborations; kind=collaboration. Actual record ID and status not observed.                                                 | Same authorized normal admin workflow session.                                                                                                      |
| BLOCKED | Admin blog navigation, status and preview discoverability       | /admin/site/blog and shared SiteDocumentEditor identified in source; runtime UI not inspected. Existing published article was preserved.  | Authorized admin session; separate safe staging fixture for any publication-feedback E2E.                                                           |
| BLOCKED | Reload from Backlog: loading, selected view and timing baseline | No staging. Project views use /projects/[projectId], with backlog as a selected view, not a separate assumed route.                       | Approved staging/development authenticated fixture and reachable API. No fresh timings are reported; historical 2.7–5.6s/0.3s are not reused.       |
| BLOCKED | Synthetic staging Trash/Restore and reload                      | No safe staging project/session. No project deletion, restore, purge or database mutation executed.                                       | Existing designated synthetic staging project, authorized account and explicit permitted workflow. No conclusion about permanent deletion is drawn. |
| BLOCKED | Normal non-admin signed-in experience                           | No designated account or authorized verification session. Post-verification message and resulting page not observed.                      | Assigned non-admin staging account and normal verification access. Generic pre-verification responses are not treated as defects.                   |
| BLOCKED | Two-account message receipt                                     | No designated staging pair. No live message sent.                                                                                         | Two designated staging accounts, permitted normal UI sessions and a safe message fixture.                                                           |

The owner previously confirmed there is no staging environment and production is read-only.
No production form was resubmitted. No record was searched through a private API as a
substitute for the required authorized normal workflow. QA-261118 and all existing QA
records/artifacts remain untouched.

## Verified form defects and root cause

All three routes, /contact, /demo-request and /collaborate, render contact-form CMS sections
through Sections -> the shared LeadForm. It posts the existing SiteSubmissionInput JSON
to /api/v1/public/site/submissions. Source/backend validation and existing Input/Textarea
error/description conventions were inspected before editing.

Local before-state reproduction used the existing published-content GET fixture and
Playwright POST doubles only, at 1440 and 375 CSS px:

- Blank submit focused fullName around y=0, behind the sticky header (81px desktop, 73px narrow).
  Native browser validation scrolled the control without accounting for that header.
- Immediate successful responses normally left the confirmation visible around y=95, but it
  was not focused. The historical hidden-success observation did not reproduce in that default
  state. With a response held pending while the user scrolled down, all three routes did
  reproduce hidden confirmations: for example contact y=-428px desktop / -1257px narrow.
- Source has no explicit focus/scroll on success and no visible result management after the
  form-to-confirmation state change. This is the verified missing behavior; no unmeasured
  performance or browser anchoring explanation is asserted.

Before artifacts are preserved under .local/lead-focus-before-default.json and
lead-focus-before.json. The latter records the pending-response/user-scroll reproduction.

## Focused implementation

- LeadForm now presents Persian per-field errors using existing Input/Textarea props and
  explicit descriptions for the native team selector/consent checkbox.
- Required fields, max lengths, email type, phone pattern, demo company/team requirements,
  consent and the honeypot remain. Native validity flags are reused, with the existing
  trimmed name/message minimums. noValidate avoids competing browser tooltips; submission
  validates the same controls before sending the unchanged payload.
- Invalid control, its label, recoverable error text and success heading are positioned
  below the actual sticky-header height. No animated jump or new dependency is introduced.
- Success focuses the existing heading. The former simultaneous status live region is removed,
  so there is one success-reading strategy. Actual screen-reader speech was not tested.
- Send another remounts the empty form and focuses the first field below the header.
- Validation/failure retain entered fields. An immediate submission guard blocks duplicate
  in-flight submit events, including requestSubmit while pending. Retry sends the same payload.
  This does not assert backend exactly-once behavior after an ambiguous lost response.
- HTTP error wording is retained; transport TypeError receives Persian recovery wording.
  No response-time or follow-up-channel promise was added.

## Current verification

| Status  | Scenario                                                                       | Evidence                                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS    | /contact empty, invalid email, mocked 503/retry, delayed success, send another | Desktop and narrow checks in .local/lead-focus-final.log; no real intake record.                                                                                                                                 |
| PASS    | /demo-request same cases and required demo fields                              | Same script, keyboard-only traversal including native team selector and consent.                                                                                                                                 |
| PASS    | /collaborate same cases and optional company                                   | Same script; existing required-field differences preserved.                                                                                                                                                      |
| PASS    | Focus/result geometry and event handling                                       | 80 browser assertions total: control/label/error below header, focused visible success after pending scroll, retained payload, no invalid POST, no duplicate in-flight POST, empty retry form, honeypot/consent. |
| PASS    | Existing marketing navigation/comparison                                       | 21 checks in .local/lead-marketing-regression.log.                                                                                                                                                               |
| PASS    | Unit checks                                                                    | 11 tests in lead-validation.test.ts, marketing-copy.test.ts and site-images.test.ts. .local/lead-unit-final.log.                                                                                                 |
| PASS    | Typecheck, targeted lint, formatting and diff review                           | .local/lead-typecheck-final.log, lead-lint-final.log; changed-file Prettier and git diff checks.                                                                                                                 |
| BLOCKED | Real screen-reader announcement behavior                                       | Actual assistive-technology session required. DOM focus/semantics only were verified.                                                                                                                            |
| BLOCKED | Real backend intake persistence and ambiguous-response deduplication           | Safe reachable API/database fixture required. No schema, contract or idempotency change attempted.                                                                                                               |

The browser fixture is local-only, and submission responses are fulfilled entirely in
Playwright (201 or intentional 503). Six expected 503 console messages are recorded in
apps/web/e2e/out/lead-focus-console.json; unexpected console messages and uncaught errors
are asserted separately. No global warning/error suppression was added.

## Changes and preservation

Product files:

- apps/web/src/features/marketing/components/LeadForm.tsx
- apps/web/src/features/marketing/lib/lead-validation.ts

Regressions:

- apps/web/test/lead-validation.test.ts
- apps/web/e2e/live/lead-form-focus.mjs (explicit local-only mock test, not default demo suite)

The remaining file is this report. Existing user changes and untracked apps/web/AGENTS.md
are preserved. No records/files were deleted, no Trash purged, no database reset/reseed or
migration executed, no permissions changed, no live messages sent, and no content published.
No new live submission or durable fixture record was created. Local requests use clearly
synthetic names/email and never reach the fixture server's write-rejecting API.
No commit, push, merge, cleanup or deployment is included in this phase.

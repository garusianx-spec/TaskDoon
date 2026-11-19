# Task and note feedback recheck — 2026-11-19

Branch: `fix/prelaunch-critical-audit`. Inspected HEAD:
`c5aa286fac6a227593013de1b2e15955dc72a338`.

No product changes were necessary: the requested guards and feedback already exist.
For example, `a7c5b23` added the changed-task dismissal guard. Existing marketing
changes and the untracked `apps/web/AGENTS.md` were preserved.

## Environment and evidence boundaries

- Windows, repository Node 22.23.3, installed Google Chrome through Playwright.
- Browser target: `http://127.0.0.1:3165`, Next development server, verified
  `data-source="demo"`. Synthetic state was confined to browser memory.
- API failure/retry checks used existing Vitest doubles, not an actual database.
- No staging environment or designated staging session was available. No
  production requests were submitted; no persistent records were created,
  modified, or deleted. QA-261118 and existing artifacts were preserved.
- Passing local fixtures does not establish staging persistence, handset
  behavior, or actual screen-reader announcements.

## Findings

| Scenario                                                          | Result                           | Current evidence                                                                                           |
| ----------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Untouched create form closes on Escape                            | PASS, demo UI                    | `task-draft-guard`                                                                                         |
| Changed create form survives Escape                               | PASS, demo UI                    | Warning appears; user can continue editing                                                                 |
| Changed task survives Escape, backdrop, and close button          | PASS, demo UI                    | Same draft retained; same dismissal guard                                                                  |
| Reverted edit closes without warning                              | PASS, demo UI                    | `task-draft-guard`                                                                                         |
| Explicit discard and inline title validation                      | PASS, demo UI                    | `task-draft-guard`, `task-forms`                                                                           |
| Successful edit closes and displays feedback                      | PASS, demo UI                    | `task-draft-guard`                                                                                         |
| Failed task edit and column save                                  | PASS, API doubles                | Awaited caller receives error rather than success                                                          |
| Completion feedback waits for acknowledgement                     | PASS, API doubles                | Failed response does not show success; retry does                                                          |
| Board move/completion behavior                                    | PASS, demo UI                    | Drag, keyboard move, complete and reopen checks in `kanban`                                                |
| Move success feedback                                             | Inspected, not visually asserted | `LiveStore.place` notifies after API acknowledgement; demo provider dispatch also supplies feedback        |
| Note save action matches reset behavior                           | PASS, demo UI and component test | Label is `ذخیره و ایجاد یادداشت دیگر`; editor resets and retains category, saved content can be reopened   |
| Failed note save retains content and supports retry               | PASS, API doubles                | `profile-notes-persistence`                                                                                |
| Repeated note conversion retains original task                    | PASS, demo UI and API doubles    | No new composer on repeat; existing reference and Persian notice retained; task-create API not called      |
| Unchecked checklist behavior                                      | PASS, UI copy                    | Conversion explains that unchecked items become subtasks and completed items remain in description         |
| Failed and successful note deletion                               | PASS, API doubles                | Failure retains fixture; confirmed response removes in-memory fixture; existing confirmation text verified |
| Real staging save/retry/persistence and visible deletion feedback | BLOCKED                          | Requires an approved staging URL, designated session, and disposable fixture                               |

The UI copy above is existing implementation, not new product wording. No new
root cause was established for a current functional failure. In particular,
unit/state checks are not presented as visual verification of every toast.

## Commands and fresh results

`npm.cmd run test -w @taskin/web -- test/task-form-persistence.test.ts test/profile-notes-persistence.test.ts test/profile-notes-components.test.ts test/confirmed-operations.test.ts`

Result: **38 tests passed across 4 files**. These include existing attachment,
comment preservation, conversion, conflict, failure and retry checks.

With `BASE_URL=http://127.0.0.1:3165` and `CHROMIUM_PATH` pointing at installed Chrome:

`node apps/web/e2e/run.mjs task-draft-guard`

Result: **11 passed, 0 failed, 0 console problems**, exit 0.

`node apps/web/e2e/run.mjs note-conversion-feedback task-forms profile-nav-notes kanban`

| Suite                    | Functional checks passed | Functional checks failed | Console problems | Exit |
| ------------------------ | -----------------------: | -----------------------: | ---------------: | ---: |
| note-conversion-feedback |                        4 |                        0 |                0 |    0 |
| task-forms               |                       25 |                        0 |                0 |    0 |
| profile-nav-notes        |                       31 |                        0 |                1 |    1 |
| kanban                   |                       17 |                        0 |                1 |    1 |

Total browser functional checks: **88 passed, 0 failed** across the five suites.
The complete browser gate is **not green**: the last two suites each report a
Next development CSS preload warning about
`/_next/static/chunks/apps_web_src_components_public_public_0f0ctd83s9j4q.css`.
The harness treats these warnings as failures. Nothing was suppressed; whether
this reproduces in the production build was not investigated in this phase.

No full-suite, new typecheck, or new lint run was performed: product code was
unchanged. No commit, push, merge, deployment, or persistent-data cleanup occurred.

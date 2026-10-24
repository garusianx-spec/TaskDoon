# Task management and forms — Phase 1

Implemented on `feat/task-management-forms-phase1`, based on `origin/main` at `2a1ca2a` (2026-10-23). Changes remain local and uncommitted.

## Behavior

- Inside a filtered project view, task creation locks the project and omits the redundant selector. Global, calendar, message and note entry points retain appropriate project selection.
- Creation includes start and due dates. The selected start date reaches the optimistic task and API, including note/message conversion. A past calendar selection defaults its start to that day; explicit reversed date ranges are rejected. Existing database columns are reused.
- Creation supports selecting and removing multiple files. New uploads complete before ordinary task creation; existing transferred attachment IDs are also sent. Failure retains the form/files and reports the API error. Successful uploads are reused during retry, and an identical submission retains its idempotency key so a lost response does not create another task.
- Details support awaited upload/removal with visible pending/error feedback. A stale attachment refresh cannot overwrite newer task fields or comments.
- The details panel has a directly editable title and a sticky **ذخیره تغییرات** footer. Title, description, dates, priority, assignees, reviewer, estimate, issue fields and placement are staged; Save awaits acknowledgement and closes on success. Cancel/Escape discard unsaved scalar edits. Files, comments, checklist actions and dependencies remain explicit independent operations. If field saving succeeds but a placement update fails, the modal stays open and reports that not all changes were saved.
- The time-tracking/worklog section and action are absent from task details. Estimated time and due date remain. Worklog data and backend functionality are retained.
- Comments, reports and internal discussion use the single **نظرات و گزارش‌ها** section and composer, including existing replies/history.
- A dismissible success toast appears after confirmed creation. Pending and failed creates do not announce success.
- The RTL calendar fills its trigger field, stays within the viewport and modal clipping boundaries, and flips above its trigger where necessary. Keyboard date movement and Escape/focus restoration work inside the modal.

## Reproductions and scope

Before fixing persistence, two regressions failed against original source: the optimistic task replaced its selected start date with today, and the ordinary create request omitted both the start date and attachment IDs. A stale refresh regression reproduced an older attachment response overwriting newer task state. A fetch-boundary lost-response reproduction committed two tasks before stable command keys were supplied.

The calendar's old fixed inner width, panel padding and unbounded alignment produced 35 px of horizontal modal overflow. The new opt-in Popover positioning also prevents controls being clipped behind the footer; other popovers keep their default positioning. Position tests cover RTL/LTR, alignment, narrow containers and vertical flipping.

Two conversion DTOs/contracts gain an optional validated `startDate`, forwarded into the existing creation transaction. OpenAPI was regenerated. Migrations, database snapshot, tenant/ownership checks, scanning, quota enforcement and runtime dependencies are unchanged.

The Agile browser suites now assert the requested absence of time tracking while preserving estimate, issue, dependency and backlog checks. Notification/note tests verify the editable title value instead of searching for a static heading. No checks are skipped to accommodate the new interface.

## Verification

| Check | Result |
|---|---|
| Clean `npm ci` | Passed |
| `npm run -ws typecheck` | Passed |
| `npm run -ws lint` | Passed |
| API unit tests | 204 passed |
| Web unit tests | 66 passed |
| Shared Jalali/text tests | 13 passed |
| Demo production build | Passed |
| Demo Playwright suites | 426 checks passed across 16 suites; zero console problems |

Browser checks use installed Chrome against the production build; screenshots/logs are local verification artifacts under `apps/web/e2e/out/` and `work/phase1-*`. On Windows the test runner uses `BASE_URL=http://localhost:3100` against an explicitly running production server, avoiding its existing POSIX process-group shutdown path.

The full run passed 425 checks and exposed one outdated notification expectation that compared the new title input to an abbreviated fixture title. After correcting it to the fixture's full title, the affected notification/calendar/note suite was rerun: all 38 checks passed, with zero console problems. No production code changed between these runs.

Two new real-database integration cases in `apps/api/test/integration/task-form-dates.test.ts` cover conversion dates and validation/idempotent replay. They have not been executed here: the managed session denies Docker execution. The live API/storage Playwright suites also require that infrastructure and have not been rerun. Unit upload/transport tests stub the network boundary; they are not presented as real S3 verification.

No commits, pushes or production deployments were performed for this phase.

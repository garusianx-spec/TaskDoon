# Project creation — Phase 2

Implemented locally on `feat/project-creation-phase2`. Existing Phase 1 changes in this checkout were preserved. No commits or pushes were made for this phase.

## User-facing behavior

- **دپارتمان‌های پروژه** is a searchable multi-select with removable tags. Defaults have distinct terminal, product, palette, megaphone, wallet and support icons. Custom departments use the workspace's canonical department IDs after submission.
- An inline addition stays in the form until submission. Department creation uses the existing authorized endpoint; users without `members:create` can select existing departments but cannot create new ones. Equivalent Persian/Arabic keyboard variants and spacing reuse an existing option. Limits follow the API: 20 departments and 60 characters per department name.
- **اعضای پروژه** supports name/email/job-title search, avatars and removable member tags. The creator remains selected. Up to 100 selected members are sent to the server, which retains its existing active-workspace-member validation and contributor assignment.
- The color picker uses opaque solid swatches (`#4f46e5`, `#06b6d4`, `#7c3aed`, `#f59e0b`, `#ec4899`, `#64748b`) with explicit inline-flex dimensions. The labels remain available in both themes.
- The optional description textarea is removed. New form submissions omit an empty description; the existing API field remains backward compatible.
- Submission awaits server confirmation. Errors preserve the selections, duplicate clicks are guarded, and identical retries retain their idempotency key. A custom department committed before a failed project response is reused on retry. Pending and canonical department options reconcile without duplicate rows or changing the retry identity.
- Department filters include every assigned department, including custom departments. Department choices are scoped to their workspace. Delayed board/channel responses are ignored after switching workspaces.

## API and database

`CreateProjectBody` and `UpdateProjectBody` accept optional `departmentIds: UUID[]`; `ProjectView` returns the complete list. The existing scalar `departmentId` remains the primary department. Omitted selections preserve the current value; an empty list clears the selection. Contradictory scalar/list inputs are rejected.

The additive `project_departments` junction has tenant-composite foreign keys to projects and departments, a unique project/department pair, lookup indexes, and forced tenant RLS. The project transaction saves these assignments alongside the existing memberships, four board columns, companion channel, audit and outbox writes. Membership/authorization checks are unchanged.

Migrations:

1. `0021_project_departments.sql` creates the junction and indexes.
2. `0022_project_departments_security.sql` adds forced RLS and an invoker trigger that synchronizes legacy primary writes without dropping unrelated assignments.

Migrations 0000–0020 are unchanged. Existing primary assignments are unioned into reads, avoiding a blocking data backfill. Deploy both migrations before the new API. Older application versions continue using the primary field; rolling back application code can leave the additive schema in place. Dropping the junction would discard secondary assignments and should not be used for a routine application rollback.

OpenAPI and the catalog schema snapshot were regenerated. The snapshot came from a fresh PostgreSQL database migrated from zero. Migration SQL and Drizzle metadata were generated through the installed Drizzle Kit's exported generation API. The Windows CLI currently fails in its OS user lookup (`uv_os_get_passwd: ENOMEM`); the exported API reports **zero schema drift**, and the integration schema/journal/OpenAPI consistency checks pass.

## Verification

| Check | Result |
|---|---|
| Workspace lint | Passed |
| Workspace typecheck | Passed |
| API unit tests | 211 passed |
| Web unit/component tests | 84 passed |
| Shared Jalali/text tests | 13 passed |
| Full API integration suite | 303 passed in 27 files |
| Fresh migrations, catalog snapshot, OpenAPI consistency | Passed |
| Drizzle generation API schema drift | 0 statements |
| Demo production build | Passed |
| Production demo Playwright | 461 checks passed across 17 suites; zero console problems |
| Focused live project Playwright | 15 checks passed; zero console problems |

New tests cover DTO validation, primary-field compatibility, multi-selection/member payloads, lost-response retries, department conflicts, authorization failures, cross-workspace responses, actual component markup, icons and color swatches. Real-database tests verify stored assignments, membership/channel synchronization, four generated columns, legacy writes and tenant isolation. The new demo browser suite also checks both themes, 375px layout, keyboard dismissal, custom additions, first-task creation and one companion channel.

The final production demo run passed all 461 checks across all 17 suites in a single run, including 35 project-creation checks. The existing scheduling fixture starts at local midday to avoid midnight rollover; its assertions are unchanged. The final run used a fresh production build and sequential servers. Custom department addition returns keyboard focus to the search field, and Escape closes only the picker.

The live helper in `apps/web/e2e/live/project-creation.mjs` is invoked from the existing flow's second-project step, preserving its free-plan project count. Verification logs and screenshots remain local under `work/phase2-*` and `apps/web/e2e/out/`.

The focused live run used synthetic owner/member accounts, an isolated migrated PostgreSQL database and an isolated Redis prefix against the running local infrastructure. It verified the real department/project POST bodies, membership and department persistence after a reload, a single synchronized companion channel, four board columns and first-task creation. An independent database query confirmed three department assignments and two project members. Test accounts/database/Redis keys were removed at completion; existing application data and shared infrastructure were retained. This was a focused feature run, not a claim that all unrelated live suites were repeated.

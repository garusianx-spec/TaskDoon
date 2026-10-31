# Profile, navigation and notes — Phase 3

Implemented on `feat/profile-nav-notes-phase3`, based on the completed Phase 2 commit. No commit or push was performed for Phase 3.

## Behavior

- **Profile:** `نام نمایشی` is editable with a trimmed 2–80 character boundary, blur/submit validation, keyboard submission, pending feedback and a visible success notification. Failed saves keep the form and its input. Confirmed names and avatar initials update the shared account/directory state immediately, including the home greeting. The account name uses the existing `PATCH /me`; presence and status remain workspace settings. A successful name write is retained if a subsequent presence write fails, so retrying does not repeat it.
- **Desktop navigation:** the existing right-hand rail has a visible `منو` heading that labels its module list. Link order and the phone navigation remain intact.
- **Notes:** the category picker is visibly labelled and usable before writing. `ذخیره یادداشت` waits for persistence, then clears both title and body into a fresh draft, retaining the chosen category and focusing the title. Empty reset drafts never create database rows. Autosave continues working. An empty Save shows inline guidance; a failed Save keeps the current editor.

## Persistence and security

The investigation reproduced two defects with failing tests: whitespace-only profile names passed validation before trimming, and a category changed during the first note POST was overwritten by the response. Name normalization now precedes validation; explicit null and non-string names are rejected. Initial note responses preserve the latest category alongside text, colors and pin state. An explicit null category remains uncategorized rather than silently falling back to Personal.

Note writes are serialized per server note ID and use each confirmed `If-Match` version. Save drains the pending create and debounce before it resolves. An uncertain create retries the same idempotency key and original body, then flushes newer edits. Workspace/account checks prevent delayed responses from updating another scope; workspace changes also clear pending note timers. Version conflicts retain local text and explain how to copy it before refreshing, without claiming the server version was loaded.

Custom notebook filters follow their temporary ID into the server UUID. This prevents a new note from losing its category after the notebook's create response arrives. Deleted notebooks and workspace switches reset the filter safely. Four additional live checks reproduced the old behavior and passed with the reconciliation fix.

No endpoints, permissions, database schema or migrations were added. Profile identity still comes from the authenticated principal, and private note/category ownership and tenant RLS remain enforced by the existing API and database. Server audit writing remains intact.

## Verification

| Check | Result |
|---|---|
| All workspace lint | Passed |
| All workspace typecheck | Passed |
| API unit tests | 214 passed |
| Web unit/component tests | 101 passed |
| Shared Jalali/text tests | 13 passed |
| Full API integration | 307 passed across 28 files, with two workers |
| Demo production build | Passed |
| Full demo Playwright | 492 passed across 18 suites; zero console problems |
| Final affected demo suites after custom-notebook reconciliation | 196 passed across 4 suites; zero console problems |
| Focused live Playwright and direct database assertions | 22 passed; zero console problems |

The new demo suite covers profile validation, immediate name updates, cancellation, desktop hierarchy, all four note categories, Save/reset/focus, reopening content and 375px layout. The live helper is part of the existing two-person flow and checks delayed API responses, real persistence after reload and category changes during note creation. It restores the original profile name so later flow fixtures remain valid.

The database tests verify regular-member self-service, rejection of identity injection, actual stored category/owner/workspace values, idempotent creation, private-note access and foreign-category rejection. Existing assertions were retained.

The initial integration attempt with unrestricted workers timed out; the complete bounded run passed. Unit suites use the root `npm test` command, which skips workspaces that do not define a test script.

The focused live run used synthetic accounts, an isolated migrated database and an isolated Redis prefix against the local infrastructure. It confirmed pending feedback by holding API responses, then verified profile and note persistence after reload. Independent SQL checks confirmed the private note owner, final Work category, body and restored account name. The fixture removed its database and Redis keys and closed its API/web servers; shared infrastructure was retained. This is a focused feature run, not a claim that every unrelated live suite was repeated.

Local verification logs are under `.local/phase3-*`; browser screenshots are under `apps/web/e2e/out/phase3_*`. No migration or generated API artifact changed in this phase.

The full 18-suite demo run preceded the final custom-notebook reconciliation. After that change, lint, typecheck, all 328 unit tests and the production build passed again; the four affected browser suites passed all 196 checks. The expanded focused live run passed all 22 checks on the final feature code. Verification servers were stopped at completion.

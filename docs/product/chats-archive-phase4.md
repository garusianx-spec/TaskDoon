# Chats and archive management — Phase 4

Implemented on `feat/chats-archive-phase4`. No commit or push was performed.

## Findings and behavior

- Companion-channel creation previously used an unconditional insert and had no database uniqueness constraint. Migration `0023_project_channel_uniqueness` adds a partial unique index on `(workspace_id, project_id)` for every non-null project association, including archived conversations. The resolver uses the same conflict target and returns the existing ID without repeating membership inserts or creation events. Client reconciliation also replaces a stale server companion by project identity; unrelated conversations with the same title remain distinct.
- Archived conversations already retained their message rows when the 40-day project trash purge ran. The missing behavior was access: the sidebar query excluded archives, and realtime refresh removed them from client state. The participant-scoped `archived` and `all` list scopes and the archive navigation now expose that retained history.
- Project deletion permanently archives its companion. Project restoration leaves the chat archived; project renames and membership synchronization skip archived companions. The existing 40-day cleanup of project/task trash remains intact and never deletes the conversation. There is no conversation TTL, expiration field, delayed deletion job or archive purge scheduler.
- Archives have no composer, upload/drop flow, schedule controls, message action menus or mutable reactions. The API rejects sends, edits, message deletion, reactions and conversation/member changes. Message mutations lock the conversation before its message row so archiving and explicit channel deletion serialize with those mutations. Read receipts and personal pin/mute preferences remain usable.
- Permanent deletion is an explicit action inside the archive. It requires the workspace message-delete grant and conversation management authorization, active conversation membership, and an exact title confirmation. The confirmation retains the original conversation/workspace IDs so realtime selection changes cannot redirect deletion. The tenant-scoped transaction writes an audit record and a durable update event; connected clients refresh and remove the deleted conversation. Active conversations cannot use this deletion path. Existing RLS policies remain in force.

## Migration and preservation

`0023` first selects the oldest proper project-synced channel as the canonical companion (falling back to the oldest associated conversation). Extra histories are detached from the project and become private, manual-membership, read-only archives. Their rows, memberships, messages and attachment references are preserved; histories are not merged or resequenced. Such historical archives are distinct conversations with no project association, rather than additional project companions.

Migrations `0000`–`0022` are unchanged. The new migration and unique index run in the existing migration transaction, with a five-second lock wait budget and a sixty-second statement budget. The ordinary index build briefly locks conversation writes; deploy through the existing migrator during a suitable maintenance window. A timeout rolls the transaction back for a later retry. Apply the migration before deploying the conflict-aware resolver.

The Drizzle snapshot/journal, database catalog snapshot and OpenAPI document are updated. The usual deployment command remains `npm run db:migrate -w @taskin/api` with the configured migration credentials.

No archive expiry or storage-object deletion is added. The existing file garbage collector protects attachments referenced by messages, including archived messages. Explicit manual conversation deletion removes its dependent history; subsequently unreferenced files follow the existing file-GC policy. Existing plan-based history visibility limits are unchanged; stored history is retained.

## Verification

| Check | Result |
|---|---|
| All workspace typecheck and lint | Passed |
| API units | 214 passed |
| Web unit/component tests | 105 passed |
| Shared Jalali/text units | 13 passed |
| Full API integration | 310 passed / 29 files on final backend code, including the 10,000-message stress test |
| Final API chat/archive/retention/audit checks | 31 passed; expanded real-storage archive test also passed |
| Production demo build | Passed on final UI code |
| Full demo Playwright | 505 passed / 19 suites; zero console problems |
| Affected browser regression checks | 96 passed / 5 suites after conditional action rendering; zero console problems |
| Final archive browser checks | 14 passed after freezing the deletion target; zero console problems |
| Drizzle migration consistency | Passed with explicit dialect/output arguments |

New database cases cover concurrent companion resolution, unchanged creation-event count on retry, raw duplicate rejection (`23505`), non-destructive legacy duplicate repair, archive listing, project purge after 100 days, preserved text/file history, file garbage collection, another member downloading the original stored PDF, read-only mutations, wrong-title rejection, unauthorized deletion and foreign-tenant rejection. Existing tenant/RLS, realtime, files and audit suites are retained.

New web tests cover canonical companion reconciliation, preservation of archived history on project restoration, absence of the composer and absence of mutable message-action markup. The action-markup test was observed failing before the conditional-rendering fix and passing afterward.

The archive browser suite covers a single project chat, preserved discussion, read-only status, named deletion, Cancel focus, Escape cancellation, focus restoration and 375px/1280px layouts without horizontal overflow. Screenshots are under `apps/web/e2e/out/phase4_archive*`; verification logs are under `.local/phase4-*`. The full browser run includes the existing project creation, task forms, board generation, voice recording, chat bridge, notes and mobile suites.

One full database repeat overlapped browser checks/builds and ended at 309/310 with a Socket.IO acknowledgement timeout in the existing 10,000-message stress scenario. The browser server was then stopped and the entire database suite rerun without competing builds or browsers. That isolated run passed all 310 tests in 223 seconds, including the same stress scenario. No timeout or assertion was relaxed.


The full 505-check browser run preceded the final action-markup and stable confirmation-target changes. The five affected suites then passed 96 checks; after the target snapshot change, the final archive suite passed all 14 checks again. The final production build, typecheck and lint include these changes. No claim is made that unrelated live-browser suites were rerun: real persistence, file storage, tenant isolation and RLS were verified through the complete API integration suite.

`npm run db:check -w @taskin/api` could not load its TypeScript configuration in this managed Windows session because the tsx loader's OS-user lookup returned `uv_os_get_passwd`/`ENOMEM`. The same Drizzle check passed using explicit equivalent arguments: `node node_modules/drizzle-kit/bin.cjs check --dialect=postgresql --out=apps/api/db/migrations`. No dependency, permission or migration validation was bypassed.

Verification browser servers were stopped; shared infrastructure was retained. Review the new migration before deploying it with the API code. No files were staged and no commit or push was performed.

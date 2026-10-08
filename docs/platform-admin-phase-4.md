# Platform admin phase 4

Platform broadcasts are independent of workspaces. Their table deliberately has no workspace_id, and the existing tenant RLS classifier must never enroll it. Migrations 0021 and 0022 are additive; earlier migrations and their journal entries remain unchanged. The application may select, insert and update broadcasts, but may not delete or truncate them. The isolated taskin_platform_admin pool stays read-only, with access only to broadcasts and outbox bookkeeping columns added in this phase.

## API

All routes below use the /api/v1 prefix. The existing platform-admin, SMS-confirmation and password step-up guards protect every admin operation. Public broadcasts require authentication.

| Route | Behavior |
|---|---|
| GET /broadcasts/active | Current announcements, nextChangeAt and fresh serverNow; no operator fields |
| GET /admin/broadcasts | Keyset pagination, limit 1–100; status current, archived or all |
| POST /admin/broadcasts | Create with message, severity and optional visibility window |
| PATCH /admin/broadcasts/:broadcastId | Edit schedule, severity, message or activation |
| DELETE /admin/broadcasts/:broadcastId | Idempotent soft archive; disables the announcement |
| GET /admin/metrics | Aggregate counts and live storage usage; Redis cache for 60 seconds |
| GET /admin/health | Independent two-second DB, admin pool, Redis Core/RT and S3 probes; passive SMS status |
| GET /admin/health/outbox | Pending count/oldest age, queue counts and sanitized recent failures |

Broadcast text is trimmed, 1–500 characters. Expiration must follow the start. Archived rows cannot be edited. Broadcast writes, platform audit entries and system.broadcast outbox events commit atomically. Audit metadata records changed fields and schedule without copying announcement text. Archive retries do not create duplicate effects.

The namespaced cache:broadcasts:active stores active, unarchived and unexpired candidates, including future starts, for 30 seconds. Every mutation invalidates and writes through after commit. Generation checks reject stale fills from concurrent requests. Cache failures fall back to SQL; bounded Redis calls cannot hold up a committed write indefinitely. Visibility windows are checked against Clock on every response, so starts and expirations need no scheduler job.

Every authenticated socket joins platform at handshake and receives system:broadcast invalidations independently of tenant subscriptions. The global envelope strips actor and request identifiers; audit records retain the operator context. These global events are recovered by refetch on reconnect and a timer rather than tenant replay streams.

## Web

/admin/overview shows metrics, probe status, SMS breakers and queue health. /admin/broadcasts manages notices with preview, activation, scheduling and archive confirmation. Pagination cursors belong to their first-page response, filter, refresh and admin-session generation; loading disables further pagination. Public banners appear above TopAppBar and for signed-in accounts before they select a workspace.

Info/warning dismissals persist in localStorage; critical dismissals use sessionStorage. Keys are id:updatedAt, so edits reappear. Blocked browser storage still permits dismissal in component state. Socket/reconnect/timer refetches include 0–5 seconds of jitter; the boundary timer uses nextChangeAt minus serverNow and clamps total delay to 5 seconds–1 hour. Logout and unmount cancel timers and ignore stale responses. Persian RTL, existing typography, accessible labels and critical alert semantics are preserved.

## Verification

Run npm run typecheck, npm run lint, npm test, npm run test:broadcasts, and npm run test:int. Regenerate OpenAPI with npm run openapi -w @taskin/api; regenerate the catalog snapshot with npm run db:snapshot -w @taskin/api against an isolated database migrated with all 23 migrations. The byte-compared generated artifacts use LF on Windows and Unix.

The new integration specs exercise authorization, time boundaries, audit/outbox rollback, cache races, database grants, global delivery, cross-workspace aggregation, dependency failures and real queue behavior. The live browser suite is npm run test:e2e:live:broadcasts and uses the same console-SMS log and platform-admin CLI setup as the other live admin suites. It archives its announcement fixtures when finished.

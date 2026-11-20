# Private support tickets

## Routes and ownership

- `/support/tickets`: account-private list, filters, unread replies, creation modal.
- `/support/tickets/:id`: conversation, attachments, reply and explicit close.
- `/admin/tickets` and `/admin/tickets/:id`: the existing platform-admin
  session, phone confirmation and Argon2 password step-up guard the queue,
  assignment, public answers, private notes and status/priority changes.
- All HTTP routes live under `/api/v1`; the generated `apps/api/openapi.json`
  includes their validated request and response schemas. No existing API path
  was removed.

A ticket belongs to its requester, not to every member of its workspace.
Creating a ticket requires an active membership in the selected, non-deleted
workspace. Existing tickets remain available to their requester after leaving
that workspace. `related_workspace_id` is historical context, with a name
snapshot; it is not a workspace-wide access grant. The support portal restores
its own normal account session without waiting for board/workspace data.

Migrations `0032_support_tickets` and `0033_support_security` add three tables,
reference numbers, command uniqueness, foreign keys, indexes and forced RLS.
No previous migration or existing record is changed. The platform-admin pool
receives SELECT only. Messages are append-only for the application role;
DELETE/TRUNCATE are revoked on all three tables. No ticket/file purge is added.
An application rollback can leave these additive tables in place. Review and
run migrations through the existing release procedure; nothing was deployed.

## Conversation behavior

- New requests start OPEN. Agent public answers set ANSWERED; a requester
  follow-up moves an answered/resolved request to IN_PROGRESS. CLOSED requests
  reject public replies until an agent explicitly reopens them.
- Requesters can close only their own ticket. Agent metadata changes require
  the version they read; stale changes return 412 instead of overwriting.
- Internal notes are agent-only, including their attachments. They do not change
  the public status, public update timestamp/version, sequence or unread count.
  User endpoints explicitly filter private notes even when the requester also
  happens to be a platform administrator. RLS independently hides private rows.
- Read cursors acknowledge only the displayed public sequence. A stale read
  acknowledgement cannot clear a newer answer or reorder the queue.
- Ticket creation, replies and upload reservations use UUID commands plus payload
  hashes. A repeated identical command returns the original result; changed
  payloads with the same command are rejected. Completed file IDs are reused
  after a recoverable message failure, avoiding duplicate files on retry.
- The visible page polls every five seconds, refreshes on focus and cancels stale
  requests on route/filter changes. Hidden pages pause polling. This is bounded
  HTTP polling, not WebSocket push; no socket authorization behavior was changed.
- Canned Persian replies are editable suggestions, never sent automatically.
  No SMS, email, external delivery, response-time promise or SLA is introduced.

## Private files and limits

The existing S3-compatible storage service is reused. Support uploads are
separate from workspace attachments so an authorized support agent need not
become a workspace member. Clients submit verified upload IDs, never arbitrary
remote attachment URLs. Files are downloaded through authorized, no-store
endpoints that issue 60-second attachment-only links.

Allowed types: PDF, plain UTF-8 text, JPEG, PNG and WebP. Maximum five files per
message, 10 MiB per file, thirty upload reservations per hour and 1 GiB of retained
reserved bytes per uploader; new requests are limited to twenty per day.
Size and magic bytes are checked before attachment. This is type validation,
not a claim of malware scanning.

Uploads first target a temporary key. Completion locks the reservation and
copies bytes into a private immutable final key, then validates that copy.
Reusing an unexpired upload capability cannot overwrite a published attachment.
The copy/check operations share a ten-second cancellation deadline. Interrupted
completion can retry; invalid or orphaned synthetic objects and their metadata
are retained. Retention/cleanup policy requires a separate authorized change.

## Verification

Verified locally with Node 22 and isolated PostgreSQL/Redis/SeaweedFS fixtures:

| Check                                                            | Result                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace typechecks                                             | PASS                                                                                                                                                                            |
| Workspace lint                                                   | PASS, no errors; 20 existing web warnings remain                                                                                                                                |
| Workspace unit tests                                             | PASS: API 321, web 214, Jalali 12, text 7                                                                                                                                       |
| Support real-database integration                                | PASS: 12 tests, including RLS, private notes/files, ownership, stale versions, idempotent retries and immutable storage copies                                                  |
| Browser workflow against the real isolated API                   | PASS: requester and agent, real upload, lost successful response/retry without duplicate ticket/file, private notes, canned answers, assignment, close and authenticated reload |
| Final production web build                                       | PASS                                                                                                                                                                            |
| Migration metadata check, schema snapshot and OpenAPI generation | PASS                                                                                                                                                                            |

Browser screenshots were captured for the list, new-ticket modal, user thread,
admin queue and admin thread at 375 and 1280 CSS pixels. The 400-pixel user thread
was also captured in light and dark modes. The real browser exercised Escape on
untouched/changed creation drafts, inline validation focus, keyboard activation
of the localized file picker, RTL alignment and absence of horizontal overflow.
These desktop browser measurements do not claim real-phone or screen-reader
verification. Screenshots remain ignored under `apps/web/e2e/out/support-*`.

The local SeaweedFS configuration permits `http://localhost:3000`; the final
browser run uses that origin, without changing infrastructure CORS or suppressing
errors. A trial on another origin failed at storage's origin gate; it was not an
application upload validation failure. No production account or data was used.

## Repeat safely

The default integration setup drops/recreates a shared template; it was **not**
used. The support-specific setup requires `SUPPORT_ISOLATED_TEST=1`, loopback
PostgreSQL/Redis/S3 endpoints and already-provisioned development roles. It creates
uniquely named templates and fixture databases and preserves rows, Redis prefixes
and files at teardown. It does not alter role passwords or clean existing data.
Only newly created synthetic accounts are provisioned as agents in tests.

```powershell
$env:SUPPORT_ISOLATED_TEST = '1'
npm.cmd run test:support:int -w @taskin/api
# In another terminal, start the production web build on localhost:3000.
npm.cmd run start -w @taskin/web -- --hostname 127.0.0.1 --port 3000
# Then run the dedicated real browser suite:
npm.cmd run test:support:browser -w @taskin/api
```

The browser file intentionally does not use the default `*.spec.ts` glob: the API-only CI job has no running Next.js server. It runs through its dedicated browser configuration.

The browser suite uses Playwright Chromium, with `CHROMIUM_PATH` when supplied
(and the existing local Chrome installation on this Windows workstation).
It proxies only local API requests into the fresh fixture application; it does
not mock successful support writes. A single deliberately lost successful
response tests safe retry. Delivery providers are console SMS and in-memory mail.

Successful database fixtures include `taskin_support_qa_4b4fc1ee13` (integration)
and additional browser fixtures under `taskin_support_qa_*`.
The ignored `.local/support-fixtures.json` contains the earlier inventory; the
Docker engine became unavailable before the post-run inventory refresh, so it
is not claimed to list the final browser database. Earlier trial fixtures and templates also remain. No QA-261118 records, existing
workspace data or prior coupon fixtures were reset, removed or reused. Cleanup,
production migration, publishing and deployment remain separate actions.

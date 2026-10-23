# TaskDoon Phase 4 baseline — 2026-10-08

Baseline verified on feature/platform-admin-phase-4 at 7f9c9848e47e6709b2db1dee663d4cde07c8c783.

| Check | Result |
|---|---|
| Typecheck | Passed |
| Lint | Passed |
| API unit tests | 186 passed |
| Jalali / text unit tests | 6 / 7 passed (199 unit tests total) |
| Integration | All 292 existing tests verified |

The full serial integration run passed 290/292. The two failures were exact generated-file comparisons: Windows checkout CRLF differed from generator LF. Both artifact files matched HEAD after newline normalization. Writing their existing contents as LF and rerunning schema.test.ts passed all four schema checks. No test assertions were modified.

Default concurrent execution encountered observability timeouts on this host; serial execution passed those tests without changing their timeouts. The serial full run took 678.39 seconds. PostgreSQL, PgBouncer, Redis Core/RT, S3 and Mailpit were running. Test overrides used 127.0.0.1:5432, Redis 16379 and S3 8333. Only isolated test databases were created/migrated.

Migrations 0000–0020 were fingerprinted before execution. Pre-existing Compose Redis port changes, lockfile optional-package removals and TaskDoon-backup.git were preserved. No dependency installation or push occurred. Local runtime: Node 26.7.0, npm 11.19.0; CI uses Node22.

Logs: full integration run at phase-4-baseline/integration-serial.log; affected schema rerun at phase-4-baseline/integration-schema-rerun.log. Earlier typecheck, lint and unit logs remain in that directory.

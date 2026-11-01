# Platform administrative roles — Phase 2

The platform panel now includes **مدیریت دسترسی‌ها و مدیران** at `/admin/roles`.
It lists administrative accounts, their phone, recovery email, role, creation date
and administrative status, and provides assignment, role change, suspension and
revocation. Workspace membership and roles are independent of these platform roles.

Only an authenticated `SUPER_ADMIN` with an OTP-confirmed session and a fresh
password step-up can use any `/api/v1/admin/users/roles` endpoint. `ADMIN` and
`OPERATOR` retain access to the existing operational platform panel; neither can
manage administrative roles. Public APIs cannot assign `SUPER_ADMIN`.

The initial owner is the explicitly flagged account for `09901819085`. A phone
number alone never grants access or creates an owner. Migration
`0027_admin_role_management` preserves previous platform grants as `ADMIN` and
recognizes the already flagged owner as `SUPER_ADMIN`. A previously unprovisioned
owner still needs the existing trusted operator CLI/bootstrap procedure.

## Lifecycle

- `POST /admin/users/roles`: normalized Iranian phone, full name, recovery email,
  and `ADMIN` or `OPERATOR`. An existing regular user retains the same ID and all
  memberships/data. A new account is pre-provisioned with an unverified phone.
  Both enter `PENDING_SETUP`; old sessions and auth proofs are invalidated.
- After successful phone OTP, the API returns `admin_setup_required` and an opaque,
  restricted ten-minute token. It never issues an authenticated session here.
  `/auth/admin/setup/request` sends proof only to the assigned recovery address.
  `/auth/admin/setup/complete` requires that email proof, the OTP-bound token and
  a strong password, consumes the proofs atomically, verifies both destinations,
  and activates the role. A fresh Phase 1 OTP/password login is then required.
- `PATCH /admin/users/roles/:id`: change `ADMIN`/`OPERATOR`, or suspend/resume.
  Changes invalidate sessions immediately. Suspension cannot erase an outstanding
  setup requirement; resuming such an account returns it to `PENDING_SETUP`.
- `DELETE /admin/users/roles/:id`: revoke the administrative grant, invalidate
  sessions/proofs, and preserve the regular account and its data. No user record
  or workspace is deleted.

Role mutations lock and revalidate the actor's current authority in their write
transaction, serialize competing assignments and record both audit trails.
Auth tokens carry no trusted role claim; guards resolve current database state.
Session issuance locks the same user row, so a racing phone/password sign-in
cannot leave a usable refresh session after administrative elevation.
Setup and email proof secrets are stored only as hashes, with purpose, account,
security version, email and parent-proof binding.

## Owner protection and compatibility

Role endpoints cannot change the primary owner or demote their own caller.
Legacy suspension, forced-reset, reset-token and session-revocation endpoints also
protect the primary owner, including redemption of older administrative reset
links. A database trigger blocks application-role writes that
would delete, demote, suspend or force reset of the flagged owner. Trusted database
operators retain offline recovery access; application administrators do not.

Existing admin sign-in, password recovery, workspace/chat/voice/project behavior
and configuration remain in place. Docker and CI/CD files are unchanged.
Pre-provisioning is the reason `phone_verified_at` can now be null; ordinary signup
continues to set it only after OTP verification.

## Automated verification

The new API integration suite covers authorization, legacy owner-lockout routes,
database protection, invalid assignments, competing requests, existing-user
promotion, setup proof expiry/replay/concurrent consumption, activation, role
changes, suspension/resumption, audit events and session invalidation. The
exhaustive mutation/audit test exercises every new mutation with request and trace
correlation, preserving its complete route coverage assertion.

Run `npm run -ws typecheck`, `npm run -ws lint`, `npm test`, and `npm run test:int`.
The browser regression is `npm run test:e2e:live:admin-roles`, with `API_LOG`, the
local `DATABASE_MIGRATOR_URL`, `CHROMIUM_PATH` and Mailpit available. It refuses an
existing primary-owner account and creates/cleans only its own local fixtures.
Use an isolated development database; never point fixture scripts at production.

The existing live suites and all demo suites remain regression checks. Run groups
with fresh isolated development Redis namespaces when repeating complete browser
runs; keep real OTP resend and rate controls enabled. No production limits or CI
settings are relaxed for tests.

## Local verification result

- Workspace typecheck and lint passed; shared package tests passed.
- API unit tests: 231 passed. Web unit tests: 110 passed.
- API integration tests: 360 passed across 33 files, including schema/OpenAPI and
  exhaustive request/trace-correlated audit checks.
- Live browser tests: 423 passed across all nine suites, including Phase 1 admin
  authentication/recovery and the 22-check administrative role lifecycle.
- Demo browser tests: 507 passed across 19 suites. Every browser suite reported
  zero console problems.
- Both production web builds, migration application, schema consistency, Drizzle
  journal/no-drift checks, contrast and broadcast unit checks passed.
- Desktop/mobile review approved the existing-system extension. No shared design
  tokens, Docker files, Compose files or CI/CD workflows changed.

The project-creation browser helper now reads persisted collections through the
same browser user's authenticated API context after reload. This avoids cached
304/CDP response-body races while retaining all server-persistence assertions.

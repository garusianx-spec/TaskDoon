# Conditional platform admin sign-in — Phase 1

Platform super admins (`users.is_platform_admin`) sign in with two factors on both
`/feed` and `/admin`. Workspace roles alone do not enable this policy. The phone
number is not a role lookup: `POST /auth/otp/request` returns the same challenge
shape for admins, other accounts and unknown numbers.

After a valid SMS code, `POST /auth/otp/verify` returns `password_required`, an
opaque `temporaryToken`, and its ten-minute lifetime for a platform admin. It
creates no session and sets no refresh cookie. The token only authorizes the
password challenge or recovery; it is not an access, signup or refresh token.
`POST /auth/admin/password` exchanges it and the correct password for a session
with `amr: ['otp', 'pwd']`. Redemption is atomic and single-use. Password lockout,
IP rate limits, active-account status and security-version checks still apply.
The admin panel's existing sensitive-action step-up remains separate.

Ordinary accounts retain their existing OTP/signup and optional password flows.
For platform admins, password-only sign-in and SMS-only password recovery are
refused, so neither can bypass the two-factor flow.

## Verified email recovery

While signed in, save an email address in the profile, then use **امنیت و ورود**
to request an email verification code and confirm it. The server sends to the
stored profile address; callers cannot supply another delivery destination.
Changing the address clears verification and invalidates outstanding email
verification and recovery codes, even if the old address is later restored.

After OTP verification, an admin who forgot the password can request recovery.
The response never includes the email address or reveals whether recovery is
configured. Delivery occurs only to the currently verified profile email. The
emailed code is bound to the OTP challenge, account security version and address.
Completing recovery changes the password, invalidates old sessions and outstanding
reset tokens, and requires a fresh OTP/password sign-in. It does not grant a
session by itself. Accounts without a verified email need an operator-assisted
recovery; the UI does not accept an unverified destination as a substitute.

## Migration and verification

Run `npm run db:migrate -w @taskin/api` with the existing migrator configuration.
Migration `0026_conditional_admin_auth` only adds the `auth_challenges` table and
its constraints/index. Opaque challenge and email secrets are stored as SHA-256
hashes, never plaintext. Existing role assignments and users are unchanged.

Provision new operators by setting a password and verifying their profile email
while signed in, then granting the platform-admin flag through the operator CLI.
The existing bootstrap through a still-active signup session also remains
available. A signed-out account without a password or verified recovery address
requires operator-assisted recovery before its next sign-in.

`09901819085` is covered by isolated API fixtures and the live auth regression.
No phone number is hardcoded as an administrator. The live regression creates a
disposable local fixture only when that number has no existing account, grants
its test flag with the operator CLI, and cleans up its fixture afterward.

Existing integration tests cover expiry, replay, concurrent redemption, lockout,
legacy-path rejection, email verification and recovery invalidation. The browser
regression runs with the live stack and Mailpit:

```bash
CHROMIUM_PATH=/usr/bin/chromium API_LOG=/path/to/current-api.log npm run test:e2e:live:admin-auth
```

The ordinary live suites and demo Playwright suites remain part of verification;
demo suites require a build with `NEXT_PUBLIC_DATA_SOURCE=demo`.

Local verification passed: workspace typecheck and lint; shared package tests;
228 API and 109 web unit tests; 349 API integration tests across 32 files;
401 live browser checks across all eight suites; and 507 demo checks across
19 suites. Both production web builds passed. All browser suites reported zero
console problems. Migration application, schema/OpenAPI consistency, Drizzle
journal checks and a no-drift generation check also passed.

CI gives the conditional admin suite a separate fresh stack so its additional
sign-ins do not exhaust the original suites' per-client hourly OTP allowance.
The workflow YAML was checked locally; GitHub Actions execution is separate.

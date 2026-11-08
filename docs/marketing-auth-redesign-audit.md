# Marketing and authentication redesign: initial audit

Status at initial audit, 2026-11-07. The source blockers described below were resolved by importing
the verified Git bundle. The running public homepage was subsequently captured read-only.
See the [implementation report](marketing-auth-redesign.md) for current verification.

## Source verification

- The execution checkout started at `7a2195e` on `main`, with a clean working tree.
- The dedicated local branch is `feature/taskdoon-marketing-auth-redesign`.
- The connected GitHub app reports current `main` as
  `1275687a8678f213530e5ad2eefe9efde2caec41`.
- The previous homepage branch is
  `6b9ff0b23a75641a66a0005081e8b6a4d78e26a6`.
- Current GitHub `main` does not contain the marketing CMS implementation. The homepage
  branch contains the public routes, CMS contracts, server module, editor, and media.
- The homepage branch's `0021_site_cms.sql` collides in numbering with main's
  `0021_project_departments.sql`. Main now has migrations through
  `0027_admin_role_management.sql`. Integration needs a reviewed migration strategy;
  copying the old journal or blindly merging the old application would be unsafe.
- Current main has newer conditional platform-admin authentication and storage behavior.
  These must survive any marketing integration.

Native Git fetch fails because the managed Windows environment cannot run its credential
helper. The updated OneDrive repository supplied by the user also returns Permission denied,
including after a managed read grant. Its fetch has therefore not updated this execution
checkout. An authentic Git bundle of the two named refs is the requested next step. No CMS
source has been reconstructed or overwritten.

## Confirmed design direction

The user confirmed Persian-speaking teams and businesses as the primary audience, with
unified tasks, project visibility, ownership, and collaboration as the main value proposition.
Individual productivity is secondary. The implementation is code-first, using the existing
indigo/IRANYekan system, authentic product previews, and a light public presentation.

Impeccable 4.3.1 is installed. Its initial context launcher failed because its default cache
directory was not writable. Existing source context was inspected directly. The pinned engine
0.1.5 was subsequently installed by the official checksum-verifying launcher in a writable
development cache. No security hook approval was bypassed.

Figma access works. The foundations page and semantic color component were inspected, including
`52:3591`, with its actual screenshot and design context. They confirm the existing semantic
colors, Persian type, spacing rhythm, and indigo brand. The live production website could not
be reached through the web tool; no live visual audit is claimed.

## Authentication findings

- Existing session management already keeps access tokens in memory and refresh tokens in
  HttpOnly cookies, with CSRF echo on refresh and logout. Preserve this architecture.
- Existing UI already handles backend-returned OTP length and resend delay, but the current
  local UI does not track the challenge's `expiresInSeconds` for explicit expiry feedback.
- The local OTP confirmation displays the full phone number. Use a masked confirmation while
  keeping edit-number and accessible code-entry controls.
- Password inputs lack visibility controls. Shared controls should preserve autocomplete,
  labels, input focus, and selection while adding accessible show/hide actions.
- Most validation errors share one form-level string. Improve safe error association and
  announcements without exposing whether a number has an account.
- Invitation state is captured before authentication and accepted by the existing live store.
  Do not replace that flow with unconditional workspace creation.
- Token-based `/reset-password` already removes the token from the address bar. Preserve that
  behavior and the backend's session invalidation rules.
- Current GitHub main adds admin setup/password/recovery steps absent from this older local
  checkout. Redesign work must begin from the verified current source and retain those steps.

## Marketing and CMS findings

The previous branch has server-rendered public routes, document metadata/JSON-LD, section
rendering, navigation/settings, public lead forms, pricing, FAQs, content collections, and
admin publication tools. These are functioning architecture to preserve, not replace with
a disconnected static homepage.

- `packages/contracts/src/site-homepage.ts` includes sample testimonials, sample company
  imagery, and unpublished article examples. The redesign must not present them as customer
  proof or published editorial content. Removing them from rendering does not authorize
  overwriting existing published CMS records.
- FAQ loading must resolve published FAQ documents and distinguish an empty collection from
  unavailable data. Articles and pricing require the same content-integrity treatment.
- The homepage branch's `site-public.ts` contains corrupted Persian fallback metadata strings.
  Correct these in the source integration and cover fallback metadata with regression checks.
- Its public fetch helper returns null on non-success HTTP responses but does not itself handle
  network timeouts. Audit outage handling together with public 404, draft isolation, and SEO.
- Public light mode needs scoped semantic tokens, not a mutation of the user's saved theme.
- The running production eNamad fix is already successful. Preserve its required link
  attributes (`referrerPolicy="origin"`, `target="_blank"`, `rel="noopener"`) in the eventual
  source implementation; no production redeployment is authorized.

## Initial baseline checks

These checks apply only to the older local `7a2195e` source, before implementation. They do
not validate current GitHub main or the requested redesign.

- `npm run -ws typecheck`: passed across workspaces.
- `npm run -ws lint`: passed across workspaces.
- Initial `npm test`: failed because Vitest could not read generated SSR modules from the
  sandbox temporary directory. Retrying with `TEMP` and `TMP` scoped to the ignored
  `.local/redesign-test-temp` directory passed, including 214 API and 105 web tests. No test
  assertions or application code were changed to resolve that environment issue.
- Database, full authentication, live CMS, and browser journeys have not been validated for
  this task. There is no production release candidate, deployment, or PR yet.

## Implementation and verification sequence

1. Import authentic fetched Git refs, verify their SHAs, and advance the feature branch to
   current main without changing either source checkout's existing work.
2. Review the previous CMS branch against that base. Preserve CMS semantics and newer main
   behavior; resolve migration dependencies explicitly before any local database execution.
3. Implement the shared public/auth design language, responsive navigation/footer, real
   product demonstrations, and all existing public page templates.
4. Redesign OTP, signup, password/recovery, first workspace, session states, and invited entry
   using the current API and store. Keep admin conditional authentication intact.
5. Add behavioral tests for safe digit/paste handling, returned OTP lengths/deadlines,
   accessible error/visibility controls, theme isolation, CMS publication, and protected routes.
6. Run typecheck, lint, units, integration, production build, full relevant browser journeys,
   accessibility checks, and the Impeccable detector. Fixtures must be labeled separately
   from real local API/database evidence.
7. Capture and inspect actual desktop/mobile pages and important auth states under
   `docs/visual-review-v2/`, with a source-state manifest. Review/fix in bounded batches.
8. Produce a verified implementation report, commit/push the feature branch, and prepare a
   reviewable PR. Never deploy to production without separate explicit approval.

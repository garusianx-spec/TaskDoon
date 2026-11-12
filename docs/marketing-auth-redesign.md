# TaskDoon marketing and authentication redesign

## Implementation

The feature starts from `main` at `1275687a8678f213530e5ad2eefe9efde2caec41`.
The public renderer, CMS, and editorial UI were selectively integrated from the previous
homepage branch at `6b9ff0b23a75641a66a0005081e8b6a4d78e26a6`. See the
[initial audit](marketing-auth-redesign-audit.md) and [approved direction](marketing-auth-direction.md).

- The homepage leads with shared work, clear ownership, and project visibility. A Chromium
  capture of the actual demo workspace follows the main action. The mobile preview uses shared
  controls at readable sizes. The walkthrough lets visitors turn a sample conversation into an
  editable task and move it through a project board.
- Public features, pricing, company, contact, FAQ, blog, help, and demo-request routes share the
  same light indigo surface. Public colors are scoped to marketing and authentication, including
  when the authenticated workspace has saved a dark or alternate-accent preference.
- Sign-in, signup, password recovery, and workspace onboarding reuse the existing session API.
  OTP length, expiry, and resend follow the server challenge. Inputs accept Persian and Latin
  digits. The phone confirmation keeps a masked number in reading order. Password controls have
  explicit labels, and a recovered password remains saved if automatic sign-in needs a retry.
- The CMS retains its editable sections, revisions, publication, redirects, media, inbox, and SEO.
  `0028_site_cms` follows the existing `0000`–`0027` SQL migrations. The public database function
  exposes published snapshots. Seeds insert missing documents and preserve existing drafts,
  published snapshots, and the identity of previously renamed seeded documents.
- The eNamad link retains the origin referrer policy, a new tab, and `rel="noopener"`. Chromium
  verified the outgoing origin and the isolated opener with an intercepted destination request.

## Browser evidence

| View                        | Before                                                                   | Redesign                                                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Homepage desktop            | [Public production](visual-review-v2/before/production-home-desktop.png) | [First view](visual-review-v2/marketing/home-hero-desktop.png) · [Full page](visual-review-v2/marketing/home-desktop.png) · [1280 × 720](visual-review-v2/marketing/home-hero-laptop.png)                                                                                               |
| Homepage mobile             | [Public production](visual-review-v2/before/production-home-mobile.png)  | [First view](visual-review-v2/marketing/home-hero-mobile.png) · [Full page](visual-review-v2/marketing/home-mobile.png)                                                                                                                                                                 |
| Interactive project state   |                                                                          | [Desktop](visual-review-v2/marketing/journey-project-desktop.png) · [Mobile](visual-review-v2/marketing/journey-project-mobile.png)                                                                                                                                                     |
| Sign-in                     |                                                                          | [Desktop](visual-review-v2/authentication/entry-desktop.png) · [Mobile](visual-review-v2/authentication/entry-mobile.png)                                                                                                                                                               |
| Verification and onboarding |                                                                          | [OTP](visual-review-v2/authentication/otp-mobile.png) · [Signup](visual-review-v2/authentication/signup-mobile.png) · [First workspace](visual-review-v2/authentication/first-workspace-mobile.png) · [Password recovery](visual-review-v2/authentication/password-recovery-mobile.png) |

The public before images came from the running production site. Its source revision is unknown.
The after images use the generated standalone Next.js server connected to an isolated PostgreSQL,
Redis and SeaweedFS environment. Product preview art uses the running workspace UI with synthetic
demo data. Images prefixed `fixture-` cover isolated browser states such as expiry, offline and
suspension. The [capture manifest](visual-review-v2/provenance.json) records the evidence sources.

## Verified checks

| Check                                                 | Local result                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Workspace lint and TypeScript                         | Passed                                                                                              |
| Next.js live and demo production builds               | Both passed with standalone output on Node 22.23.3                                                  |
| Workspace unit tests                                  | 366 passed                                                                                          |
| API integration on real services                      | 378 passed across 34 files, including 18 CMS cases                                                  |
| Chromium demo suites                                  | 507 checks passed across all 19 suites                                                              |
| Live marketing and authentication                     | 68 passed with zero unexpected browser failures                                                     |
| Live CMS editing and publication                      | 86 passed with zero browser console problems                                                        |
| Live workspace                                        | 149 passed with zero browser console problems, including invitations, realtime delivery and storage |
| Conditional admin sign-in and verified email recovery | 37 passed with local console SMS and Mailpit                                                        |
| Isolated authentication UI states                     | 27 passed                                                                                           |
| Automated WCAG A/AA                                   | 29 axe scans, zero violations in the tested views                                                   |
| Responsive overflow                                   | Homepage and sign-in verified at 360, 375, 390, 430, 768, 1024, 1280, 1440, and 1920 px             |
| Theme contrast                                        | All 312 semantic contrast checks passed                                                             |
| Migration and generated contracts                     | Drizzle check passed, schema generation found no drift, catalog and OpenAPI assertions passed       |
| Impeccable detector                                   | Zero findings on the changed marketing, authentication, and shared public components                |
| Impeccable independent finish review                  | `ship` verdict for the four reviewed fixes                                                          |

Chromium lab readings on the standalone local homepage with caching disabled and no throttling
were 1,132 ms LCP and 0.0017 CLS at 1440 × 1000, and 432 ms LCP and 0 CLS at 390 × 844.
Field Core Web Vitals and physical-device assistive technology require separate measurements.
OTP delivery used the console provider and the ordinary password flows used disposable users.

The finish review confirmed that the walkthrough keeps unsubmitted edits separate from the
board, OTP expiry replaces stale errors, field feedback points to the input that needs correction,
and the 1280 × 720 homepage shows the first populated task titles above the fold.

Local Windows standalone packaging required serialized creation of generated directories.
The verifier used an ignored local helper and exercised the resulting standard Next.js server.
The local Docker engine control pipe denied access, so the Docker image builds are left to CI.

## Release boundary

The CMS migration and browser runs used a disposable local database on the `main` lineage.
Production data and deployment were outside this work. The separately reported production
lineage may already contain a different CMS migration. Reconcile its schema and migration
ledger before considering a production release. Existing published content can adopt the
new homepage template through the draft and preview flow in
[CMS operations](marketing-operations.md).

# Marketing usability and copy audit

Base: `2867ac5`, branch `fix/prelaunch-critical-audit`.
The current public website was inspected read-only in a fresh Chromium context and through
GET requests to its published-content API. No form was submitted, CMS document edited, or
production deployment performed.

## Authoritative sources and confirmed findings

The [published documents API](https://taskdoone.ir/api/v1/public/site/documents) was reachable.
Its public snapshot was retained only in ignored local storage for reproducible local review.
[Pricing](https://taskdoone.ir/pricing), [demo request](https://taskdoone.ir/demo-request),
[Help](https://taskdoone.ir/help) and [FAQ](https://taskdoone.ir/faq) return 200.
[Privacy](https://taskdoone.ir/privacy) and its public page lookup return 404.

| Item                     | Before                                                                                                                                          | Candidate / decision                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile comparison labels | Live 375px browser: first feature label moved 199px with horizontal scrolling.                                                                  | Sticky logical inline-start row/header labels preserve RTL context. Checked at 320, 375 and 1440px, including keyboard scrolling.                                                           |
| Dash values              | Live matrix contains 24 dash cells. Their meaning is explained only below the table.                                                            | Visible «ذکر نشده» explicitly means absent from published detail, not an excluded entitlement. Existing feature-membership logic is preserved.                                              |
| Capability duplicates    | Current three plans supply 12 distinct exact labels; the renderer already deduplicates exact matrix rows. Some labels are semantically similar. | No speculative synonym merging or entitlement reclassification. Ask the owner for the approved cross-plan capability taxonomy.                                                              |
| Terminology              | Component chrome uses «طرح» while current published pricing uses «پلن».                                                                         | Comparison chrome consistently uses «پلن». Published feature descriptions, prices, limits and CTA URLs are unchanged.                                                                       |
| Free capacity            | Published free card says capacity follows active workspace limits; it supplies no numerical public guarantee.                                   | No invented caps. Existing explanatory publication and limit value retained; owner question below.                                                                                          |
| Demo jump                | Live demo page has no link to its existing demo-form anchor.                                                                                    | Hero gets a direct jump only when a visible demo form exists and no published primary CTA is set. Native fragment navigation focuses the existing form section; Tab enters the first field. |
| Help destination         | Help returns 200, has zero published help articles, and presents an empty collection. Six FAQs and their FAQ page are published.                | Empty Help retains its URL/message and offers the existing published FAQ destination. Fallback appears only while the collection is empty and the FAQ page is available.                    |
| Consent policy           | No published privacy document; live privacy URL returns 404. Existing layout already hides unapproved policy navigation.                        | No dead or unapproved privacy link added to consent. Publication and approval are required before adding that link. Consent and submission behavior are unchanged.                          |
| Company claims           | Published About describes the product; Security describes implemented controls and expressly avoids formal certification claims.                | No company identity, usage, customer, certification, uptime or support claims added or strengthened.                                                                                        |

## Owner decisions required

1. Which of the distinct project/task, conversation/file and role/access labels represent the
   same capability across plans? Supply an approved comparison matrix before merging labels
   or asserting that an unlisted capability is included/excluded.
2. What are the approved public free-tier limits for members, projects, storage and uploads?
   Product defaults and workspace-specific overrides are not a public commercial guarantee.
3. What final paid prices, billing units, entitlements and capacity terms may be published?
   Current publications require discussion/confirmation; quote-based wording is preserved.
4. Approve and publish the privacy policy at the existing URL before linking it beside consent.
   No draft legal text was promoted or represented as approved.
5. Which Help articles should be published? The FAQ fallback is useful navigation, not a claim
   that Help currently contains product guides.

## Validation and files

- Browser audit: **21 checks passed, zero failures and zero console problems** at desktop 1440px and narrow 375/320px; fixed feature labels, keyboard comparison
  access/scroll, visible value meanings, no document overflow, Enter on demo jump then Tab
  into form, existing Help/FAQ navigation, and expected missing privacy response.
- Local rendering uses an immutable copy of the current published public documents behind
  an isolated GET-only fixture server. It rejects all mutations. No lead is submitted.
- Five targeted unit tests pass (new pricing/hash-link regressions plus existing site-image
  cases). They preserve exact feature labels, duplicate-row behavior, limit text and page URLs.
- Web typecheck, targeted component lint, formatting and diff checks pass.
- Published CMS content, plan logic, backend services, pricing values, limits, legal content
  and existing routes are unchanged.

Presentation changes: `PricingPlans.tsx`, `marketing.css`.
Demo navigation: `DocumentPage.tsx`, `Sections.tsx`, `SiteLink.tsx`.
Help fallback: `CollectionPage.tsx`.
Regression files: `test/marketing-copy.test.ts`, `e2e/live/marketing-copy-audit.mjs`.
The latter is a captured-content audit, deliberately separate from the default offline demo
suite. Run it with BASE_URL pointing at the local fixture-backed application and a configured
CHROMIUM_PATH. It checks the recorded unpublished-policy/empty-Help fixture, not arbitrary
future CMS publications.

Ignored evidence: `.local/marketing-live-before.log` (live browser measurements),
`marketing-live-pricing-375.png`, `marketing-published.json`, `marketing-browser-final.log`,
`marketing-unit.log`, `marketing-typecheck-final.log`, `marketing-lint.log`.
The pre-existing untracked `apps/web/AGENTS.md` is preserved.

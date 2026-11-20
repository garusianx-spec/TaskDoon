# Coupon engine and payment integration boundary

Implemented with the existing NestJS, Drizzle, PostgreSQL, contracts and Next.js
stack. No new dependencies, provider credentials, production operations or real
payments. Existing theme/password work remains separate and uncommitted.

## Money and lifecycle

- All amounts are **whole Toman** (`TOMAN`), bounded to 1,000,000,000,000.
  Percentage rates are integers from 1 to 100, rounded down to whole Toman.
  Fixed discounts cannot produce negative totals. Percentage caps are optional;
  minimum order amounts are checked before discounting.
- `plan_prices` is the authoritative price catalog, keyed by plan and monthly/
  yearly period. No prices are seeded or inferred from marketing CMS data.
  A super administrator configures prices through `/admin/coupons`.
- This checkout prices one plan/period. It does not invent seat counts, taxes,
  proration, recurring charges or subscription expiry/fulfillment policies.
- Codes are trimmed uppercase ASCII alphanumeric, 3–40 characters. Codes remain
  unique after deactivation. `DELETE` deactivates; no purge/delete implementation.
- Eligible plans are normalized in `coupon_plans`, with real plan foreign keys;
  the API exposes `allowedPlans` as an array. Empty means all plans.
- Expiry instants are UTC timestamps. The admin UI offers Jalali and Gregorian
  date entry and an explicit Tehran time; the API accepts ISO timestamps.
- Validation is advisory and never consumes capacity. Creating a pending order
  revalidates the server price/coupon and reserves capacity for at most 15 minutes,
  bounded by coupon expiry. The subtotal/discount/total snapshot is immutable.
- `usedCount + unexpired, unconsumed reservations` cannot exceed the limit through
  these service paths: all reservations and paid consumption lock the same coupon
  row. Reservation counts use a global bookkeeping table, not tenant-filtered
  order queries. Expired rows remain stored; no cleanup cron or deletes needed.
- Workspace owner writes serialize on the workspace row. A UUID `commandId` is
  unique per workspace and actor; retries return the same order, and changed
  payloads under the same key return `IDEMPOTENCY_KEY_REUSED`.
- Deactivation blocks new orders; an already issued reservation remains valid
  until its deadline. Paid usage is not automatically released/refunded.

## Endpoints and UI

All paths below have `/api/v1` prefix. Financial admin endpoints require the
existing **SUPER_ADMIN + OTP-confirmed session + password step-up** guards.
Admin reads use the isolated read-only platform-admin pool. Admin mutations and
audits share the normal transactional pool.

| Method/path | Contract |
| --- | --- |
| `POST /admin/coupons` | Validated creation, unique code, plan IDs checked |
| `GET /admin/coupons` | Exact normalized `code`, `status=active/inactive/all`, keyset `cursor`, `limit` 1–100 |
| `DELETE /admin/coupons/:id` | Idempotent deactivation, keeps provenance/history |
| `GET /admin/billing/prices` | Admin plan catalog and configured prices |
| `PUT /admin/billing/prices` | Set server-side Toman price and activation state |
| `POST /coupons/validate` | Authenticated workspace owner; `workspaceId`, `planId`, `period`, optional `code` |
| `GET /workspaces/:workspaceId/checkout/catalog` | Active prices, owner only |
| `POST /workspaces/:workspaceId/checkout/orders` | `planId`, `period`, optional `code`, UUID `commandId`; reserves but never marks paid |
| `GET /workspaces/:workspaceId/checkout/orders/:id` | Owner-scoped order snapshot |

Validation returns either `{valid:true, breakdown:{currency,subtotal,discount,total}}`
or `{valid:false, reason}`. Reasons distinguish invalid/inactive/expired/exhausted,
plan mismatch, minimum amount and unavailable price. Checkout clients never send
an accepted subtotal, discount or payable total.

`/admin/coupons` contains creation, activation-on-create, eligible plans, both
calendars, price configuration, filtering, pagination and a deactivation dialog.
`/checkout` is reachable from owner workspace settings. `CouponWidget.tsx` uses
400 ms debounced server validation, aborts obsolete requests and keys quote state
to the exact selection so an older answer cannot enable a different order.
An in-flight guard prevents duplicate clicks; a failed retry reuses its command
ID. The UI explicitly labels pending orders and the not-yet-connected gateway.

```tsx
<CouponWidget
  key={`${workspaceId}:${planId}:${period}`}
  workspaceId={workspaceId}
  planId={planId}
  period={period}
/>
```

## Future gateway adapter — mandatory before taking payments

There is deliberately **no browser-callable payment-success endpoint**. The
internal `CouponsService.settleVerifiedPayment(unit, workspaceId, orderId, payment)`
is an integration boundary, not a provider verifier. It is not called by the
current checkout UI. No plan entitlements are activated by the current UI.

The future gateway adapter must:

1. Verify the provider response/signature and settled status server-side, bind
   the provider authority/transaction to the server-created order, and validate
   merchant, order identity, amount and currency. Never trust a return URL alone.
2. Convert provider amounts explicitly if the provider uses Rial. Reject an
   amount that cannot be represented exactly in whole Toman; do not silently round.
3. Use a provider-qualified stable reference, e.g. `provider:transaction-id`.
   In the correct workspace `UnitOfWork` transaction, call the settlement method
   with the immutable expected order amount. Persist the provider receipt and
   any entitlement/outbox changes in that same unit; do not perform HTTP calls
   while locks are held.
4. Replays with the same order/reference/amount return the paid order without a
   second increment. A different reference or amount conflicts. References are
   also unique across orders. Payment and order changes roll back together.
5. Align gateway payment deadlines with reservation deadlines. A verified late
   payment raises `PAYMENT_RECONCILIATION_REQUIRED`; record it durably in the
   adapter's recovery path and reconcile/refund. Do not silently mark it fulfilled
   or retry it forever. Zero-payable orders also need an explicit trusted server
   fulfillment path; they are not charged through a dummy gateway.

## Schema/security and files

New migrations: `0030_coupons_checkout`, `0031_coupons_checkout_security`.
Migrations `0000`–`0029` are unchanged. The generator originally repeated the
columns/check already installed by custom migration 0029; those duplicate
invitation statements were removed from **0030 only**. New metadata snapshots
now account for those pre-existing columns, avoiding repeated future diffs.

Only `checkout_orders` has a tenant key and forced tenant RLS. Coupon/catalog/
capacity tables are platform-wide. Application DELETE/TRUNCATE is revoked on
all five new tables. The admin role receives SELECT only on coupon/catalog
tables, not write grants or payment references. Its repair script includes the
same optional grants if the role is provisioned after migration.

Platform coupon/price operations and list reads are audited. Order creation and
paid settlement append workspace audit records in their transaction. Coupon
codes and payment references are not added to audit metadata.

Implementation entry points:

- `packages/contracts/src/coupons.ts`: types and bounded integer arithmetic.
- `apps/api/src/platform/db/schema/coupons.ts`: Drizzle schema/invariants.
- `apps/api/src/modules/coupons/`: DTOs, controllers, transactional service.
- `apps/web/src/features/billing/CouponWidget.tsx`: checkout UI.
- `apps/web/src/app/(admin)/admin/coupons/page.tsx`: admin management.
- `apps/web/src/app/(app)/checkout/page.tsx`: owner checkout integration.
- Module/schema/contract exports, admin/owner navigation, OpenAPI and database
  schema snapshot are updated. Other existing uncommitted work is preserved.

## Verification

- API typecheck and lint passed; Web typecheck and production build passed.
- Final full Web lint exited successfully with 20 pre-existing warnings and no
  errors; the newly added checkout/admin/widget files pass their targeted lint.
- API targeted units: **29 passed** (26 coupon arithmetic/DTO tests and three
  existing platform-role-policy regressions).
- Web targeted units: **19 passed** (six coupon rendering contracts plus existing
  password/theme tests). Rendering tests do not claim browser interaction coverage.
- Real PostgreSQL/Redis/Nest integration: **10 passed**, including cross-tenant
  last-slot concurrency, matching/different-command replay, duplicate verified
  settlement, amount mismatch rollback, expiry, plan eligibility, deactivation,
  owner/admin authorization and direct PostgreSQL RLS isolation.
- `drizzle-kit check` passed. `openapi.json` was regenerated without connecting
  providers. `schema.snapshot.txt` was regenerated from a freshly migrated local
  coupon template; its diff contains only additions for this feature.
- Financial callback handling has no live gateway evidence; no live payment,
  SMS, email delivery, production mutation or deployment was performed.

### Preserved local test fixtures

The usual integration global setup drops a shared template. It was **not run**.
The coupon-specific setup creates a uniquely named fresh local template and the
harness's opt-in `preserveFixtures` closes connections without deleting rows,
Redis keys or databases. Existing callers retain their original behavior.
Development roles must already exist; the setup does not change their passwords.

Successful runs retained:

| Database | Synthetic users | Workspaces | Coupons | Orders |
| --- | ---: | ---: | ---: | ---: |
| `taskin_coupon_qa_1dd02fc9e4` | 2 | 2 | 7 | 7 |
| `taskin_coupon_qa_81ea66d228` | 2 | 2 | 9 | 7 |

Templates `taskin_coupon_template_2160d3def6b5` and
`taskin_coupon_template_8d1ab24366d4` are also retained. The earlier unsuccessful
migration attempts left `taskin_coupon_template_6ce948118508` and
`taskin_coupon_template_cb219661e069`; these were not reset or removed. Counts
and database names are recorded in ignored `.local/coupon-fixtures.json`.
No QA-261118 records or existing application database were used.

To repeat only the safe local coupon suite in PowerShell, after starting the
development services:

```powershell
$env:COUPON_ISOLATED_TEST = '1'
npm.cmd run test:coupons:int -w @taskin/api
```

Every run retains another isolated fixture database. Cleanup requires separate
authorization. Do not point the test or migration commands at production.

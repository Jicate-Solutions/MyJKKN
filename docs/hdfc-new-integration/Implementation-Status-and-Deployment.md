# Razorpay (HDFC Collect Now) Migration — Implementation Status and Deployment Guide

**Date authored:** 2026-05-23
**Migration branch:** `feat/razorpay-migration` (merged to `main` at commit `638355ab1`, pushed to `origin/main` as `ea62c975a`)
**Plan reference:** [`docs/plans/2026-05-22-razorpay-migration-plan.md`](../plans/2026-05-22-razorpay-migration-plan.md) (44 tasks)
**Source spec:** [`docs/hdfc-new-integration/Integration-Guide.md`](./Integration-Guide.md), [`Security-Audit-Checklist.md`](./Security-Audit-Checklist.md), [`test-card-details.md`](./test-card-details.md)

---

## 1. What this migration does

HDFC SmartGateway (the previous payment processor) is being replaced by **Razorpay**, marketed as "HDFC Collect Now". The endpoints target `api.razorpay.com`, not HDFC's SmartGateway servers. The migration introduces a **provider abstraction layer** so both gateways can coexist during cutover; the active gateway per module is selected by an environment variable.

**Why provider abstraction (and not "rip and replace"):**
- Per-module rollback by flipping one env var, no code revert
- 49,870+ existing HDFC webhook log rows stay readable for audit
- Existing HDFC transactions (25 billing + 76 events at migration start) keep working
- Both providers can run side-by-side; no UAT downtime

---

## 2. Modules completed

### 2.1 Database schema (Phase 1)

**Migrations applied:**
- `supabase/migrations/20260522120000_razorpay_payment_columns.sql`
  - Adds to `payment_transactions` and `event_payment_transactions`:
    `provider`, `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`, `amount_paise`, `captured_at`, `refund_status`
  - Partial unique indexes on Razorpay IDs (`WHERE NOT NULL`)
  - CHECK constraint `*_provider_identifiers_chk` enforces per-row integrity
  - Creates `payment_disputes` table with mutual-exclusion FK CHECK
  - Tightens RLS: drops `auth.role()='authenticated'` UPDATE policies; restricts to `service_role`
  - Adds `update_payment_disputes_updated_at` trigger
- `supabase/migrations/20260522130000_advance_enquiry_to_enquiry_submitted.sql` (unrelated parallel work that landed in the branch — kept for clean history)
- `supabase/migrations/20260523120000_billing_refunds_gateway_columns.sql`
  - Adds `gateway_refund_id` (partial-unique) + `gateway_response` to `billing_refunds`

**Existing HDFC rows are untouched.** New rows can be written under either provider.

### 2.2 Payment provider abstraction layer (Phase 2)

**Location:** `lib/services/payments/`

| File | Purpose |
|---|---|
| `amount.ts` | `Paise` branded type, `toPaise(rupees)` / `fromPaise(paise)`. Prevents 100× overcharge from rupee/paise confusion. |
| `provider.ts` | `PaymentProvider` interface + `CreateOrderInput`/`CreateOrderResult`/`VerifySignatureInput`/`VerifyWebhookInput`/`GetStatusResult`/`CreateRefundInput`/`CreateRefundResult` |
| `factory.ts` | `getPaymentProvider(module)` reads `BILLING_PAYMENT_PROVIDER` or `EVENTS_PAYMENT_PROVIDER` |
| `hdfc-smartgateway-provider.ts` | Adapter shell; real HDFC logic continues to live in `payment-gateway-service.ts` / `hdfc-event-client.ts` |
| `razorpay/client.ts` | HTTP Basic-auth wrapper, retries 502/503/504 only, throws `RazorpayApiError` on 4xx |
| `razorpay/create-order.ts` | `POST /orders` with `payment_capture=1` (auto-capture) |
| `razorpay/verify-signature.ts` | HMAC-SHA256(`order_id\|payment_id`) keyed with `RAZORPAY_KEY_SECRET`. Uses `crypto.timingSafeEqual()` |
| `razorpay/verify-webhook.ts` | HMAC-SHA256(rawBody) keyed with `RAZORPAY_WEBHOOK_SECRET`. Uses `crypto.timingSafeEqual()` |
| `razorpay/get-status.ts` | `getOrderStatus`, `getPaymentStatus`, `dualInquiry(order, payment)` — mandatory per security audit |
| `razorpay/create-refund.ts` | `POST /payments/{id}/refund` |
| `razorpay/razorpay-provider.ts` | Composes the above into `RazorpayProvider` implementing `PaymentProvider` |
| `razorpay/types.ts` | Razorpay API DTOs (`RazorpayOrder`, `RazorpayPayment`, `RazorpayRefund`, `RazorpayError`) |

**Tests (vitest):** `__tests__/lib/services/payments/{amount,razorpay/create-order,razorpay/verify-signature,razorpay/verify-webhook}.test.ts`. All passing.

### 2.3 Billing module routes (Phase 3)

| File | Change |
|---|---|
| `lib/services/billing/payment-gateway-service.ts` | `createPaymentSession` branches on `BILLING_PAYMENT_PROVIDER`; `verifyPaymentWithGateway` accepts optional Razorpay callback args and runs HMAC + dual-inquiry + amount-paise mismatch checks; `checkPaymentStatus` branches on `transaction.provider` |
| `types/payment-gateway.ts` | `PaymentSessionResponse` extended with optional `provider`/`transaction_ref`/`razorpay_order_id`/`razorpay_key_id`/`amount_paise`/`customer` |
| `app/api/billing/payment/initiate/route.ts` | Unchanged — passes through extended `PaymentSessionResponse` |
| `app/api/billing/payment/callback/route.ts` | Detects `razorpay_order_id` form field and routes through Razorpay verification path |
| `app/api/webhooks/razorpay/route.ts` | **New.** Unified webhook for both billing and events. Verifies HMAC, idempotently logs, dispatches by `event` type, routes by `notes.module` |

### 2.4 Billing UI (Phase 4)

| File | Change |
|---|---|
| `components/billing/razorpay-checkout-launcher.tsx` | **New.** Loads `checkout.razorpay.com/v1/checkout.js`, opens modal, posts payment response form to `/api/billing/payment/callback`, handles dismiss/failure redirects |
| `components/billing/online-payment-button.tsx` | Inspects session.provider; mounts `<RazorpayCheckoutLauncher>` for Razorpay sessions, falls through to `window.location.href` for HDFC |
| `hooks/billing/use-payment-gateway.ts` | `useOpenPaymentGateway` now returns the session instead of redirecting unconditionally — caller decides |
| `.env.example` | Documents `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `BILLING_PAYMENT_PROVIDER`, `EVENTS_PAYMENT_PROVIDER` |

**CSP (Task 18):** Skipped — this project has no `Content-Security-Policy` configured. If one is added later, the script-src must include `https://checkout.razorpay.com`, connect-src must include `https://api.razorpay.com` and `https://lumberjack.razorpay.com`, frame-src must include `https://api.razorpay.com` and `https://checkout.razorpay.com`.

**Success/Failed page UI (Task 21):** Skipped — the existing success page already shows order number, amount, status, payment date, meeting the security audit minimum. UI polish can be done in a follow-up if Razorpay-specific fields (razorpay_order_id, razorpay_payment_id) need to render.

### 2.5 Events module (Phase 5)

| File | Change |
|---|---|
| `lib/services/events/core/event-payment-service.ts` | `initiatePayment` branches on `EVENTS_PAYMENT_PROVIDER`; new `EventInitiatePaymentResult` interface with Razorpay fields |
| `app/api/events/marathon/[eventId]/payment/initiate/route.ts` | Passes through Razorpay fields in response |
| `app/api/events/marathon/[eventId]/payment/callback/route.ts` | Detects `razorpay_order_id` form field, runs signature + dual-inquiry + amount-mismatch, marks `events_registrations.payment_status='paid'` on success |
| `pre-register/route.ts`, `status/route.ts`, `webhook/route.ts` | No changes needed: pre-register delegates to /initiate, status is HDFC-only admin view, webhook handled by unified `/api/webhooks/razorpay` via `notes.module='events'` routing |

**Events UI (Task 28):** Deferred — the marathon registration UI lives in the external marathon app, not this repo. The backend response now contains `provider`, `razorpay_order_id`, `razorpay_key_id`, `amount_paise`, `customer`, so the external app can branch on those when it adopts Razorpay.

### 2.6 Refunds (Phase 6)

| File | Change |
|---|---|
| `app/api/billing/refunds/[id]/gateway-refund/route.ts` | **New.** POST triggers Razorpay refund via `provider.createRefund()` for refunds whose parent transaction has `provider='razorpay'`. Updates `billing_refunds.gateway_refund_id` + `gateway_response`. Returns 400 for non-Razorpay (manual refund required). |
| Webhook | `handleRefundEvent` in `app/api/webhooks/razorpay/route.ts` updates refund/transaction rows on `refund.created`/`refund.processed`/`refund.failed` |

### 2.7 Disputes (Phase 7)

| File | Change |
|---|---|
| Webhook | `handleDisputeEvent` in `app/api/webhooks/razorpay/route.ts` upserts `payment_disputes` rows on `payment.dispute.created`/`.lost`/`.won`/`.closed` |

Admin notification UI is deferred — disputes land in the DB; an admin page can render them in a follow-up.

### 2.8 Late authorization daily job (Phase 8)

| File | Change |
|---|---|
| `app/api/cron/razorpay-late-auth/route.ts` | **New.** Scans `payment_transactions` and `event_payment_transactions` with `provider='razorpay'` in `initiated`/`processing` state. Calls `provider.getOrderStatus()` for each; marks captured/failed accordingly. Rows >5 days old are marked `expired` (Razorpay auto-refunds beyond that window). |
| `vercel.json` | New cron entry: `*/15 * * * *` (every 15 minutes) |

---

## 3. Critical security guarantees in code

1. **HMAC timing-attack resistance:** Both `verifySignature` and `verifyWebhookSignature` use `crypto.timingSafeEqual()` with a length pre-check (mismatched lengths fall through to `return false` instead of throwing).
2. **Dual inquiry:** Callback verification calls **both** `GET /orders/{id}` and `GET /payments/{id}` — per Razorpay security audit checklist this is mandatory; relying on signature alone fails the audit.
3. **Amount-paise mismatch:** Callback compares `transaction.amount_paise` (DB) to `dualInquiry().amountPaise` (live Razorpay). Mismatch → `logAmountMismatch` audit + `return verified: false`.
4. **Anti-replay:** Webhook checks `existing.status === 'success'` before re-finalizing; callback uses `transaction.processed_at`.
5. **Service-role-only writes:** RLS hardened in Phase 1 migration. Direct browser writes to `payment_transactions` and `event_payment_transactions` are blocked. Only the webhook + service code can update.
6. **Module-correct webhook routing:** Webhook reads `notes.module` set at order creation time (we set `module: 'billing'` or `module: 'events'`). Webhook never guesses by URL pattern.
7. **Webhook signature secret separation:** `RAZORPAY_KEY_SECRET` (callback HMAC) and `RAZORPAY_WEBHOOK_SECRET` (webhook HMAC) are distinct env vars. Mixing them silently would leak the wrong secret.

---

## 4. Production deployment guide

### 4.1 Prerequisites

You will need:
- A Razorpay production account with KYC complete and live mode enabled.
- Production keys from Razorpay dashboard → Settings → API Keys.
- Production webhook secret from Razorpay dashboard → Settings → Webhooks.
- Vercel admin access for the production project.
- DB access via the project's Supabase MCP server or `npx supabase db push`.

### 4.2 Step 1 — Apply database migrations

The migrations are committed under `supabase/migrations/`. Apply them in order:

```bash
# Verify migrations are not already applied (idempotent guards in each file)
npx supabase db push --linked
```

Or, if you use the Supabase MCP server in this repo, the migrations are auto-applied by your standard workflow.

**Idempotency:** All three migrations use `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. Safe to re-run.

**Verify:** After apply, run these checks:
```sql
-- Provider columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'payment_transactions' AND column_name IN ('provider', 'razorpay_order_id', 'amount_paise');

-- RLS policies are tight
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'payment_transactions' AND cmd = 'UPDATE';

-- Disputes table exists
SELECT to_regclass('public.payment_disputes');

-- Refund gateway columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'billing_refunds' AND column_name = 'gateway_refund_id';
```

### 4.3 Step 2 — Configure Razorpay webhook URL

In Razorpay dashboard → Settings → Webhooks → **Add new webhook**:

| Field | Value |
|---|---|
| **Webhook URL** | `https://<your-prod-domain>/api/webhooks/razorpay` |
| **Webhook secret** | Generate a strong secret (32+ chars random). Copy it — you'll need it in Vercel env. |
| **Active events** | Select these only: `order.paid`, `payment.captured`, `payment.authorized`, `payment.failed`, `refund.created`, `refund.processed`, `refund.failed`, `payment.dispute.created`, `payment.dispute.lost`, `payment.dispute.won`, `payment.dispute.closed` |
| **Alert email** | Devops / finance contact |

**Do this BEFORE setting env vars in Vercel.** The webhook secret must be saved on the Razorpay side first.

### 4.4 Step 3 — Set Vercel environment variables

In Vercel dashboard → Settings → Environment Variables. Add for **Production** scope:

| Key | Value | Notes |
|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_live_XXXXXXXX` | From Razorpay dashboard |
| `RAZORPAY_KEY_SECRET` | `<secret>` | Encrypted. From Razorpay dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | `<secret>` | Same value you put in Razorpay's webhook config |
| `BILLING_PAYMENT_PROVIDER` | `hdfc_smartgateway` | **Start with HDFC.** Flip to `razorpay` at cutover. |
| `EVENTS_PAYMENT_PROVIDER` | `hdfc_smartgateway` | Flip at cutover (1 week after billing) |

For **Preview** scope: use Razorpay test keys (`rzp_test_*`) and a separate webhook (point to a preview URL or use ngrok during UAT). Keep `BILLING_PAYMENT_PROVIDER=razorpay` in preview so QA can exercise the new path.

**Do NOT set these in Development scope.** Local dev should remain HDFC unless you're explicitly testing Razorpay.

### 4.5 Step 4 — Deploy and verify env vars load

```bash
git push origin main   # already done as part of this migration
# Trigger Vercel deploy if not auto-deployed
```

After deploy, check the production logs for any startup errors. Then run a smoke test (server should still be on HDFC):

```bash
curl -X POST https://<prod>/api/billing/payment/initiate \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <auth cookie>' \
  -d '{"student_id":"<test student>","bill_ids":["<test bill>"]}'
```

Expected: response `{ "success": true, "data": { "provider": "hdfc_smartgateway", "payment_url": "https://smartgateway...", ... } }`. If you see `provider: "razorpay"` here, **stop** — env var is set wrong.

### 4.6 Step 5 — UAT in Razorpay test mode

Set `BILLING_PAYMENT_PROVIDER=razorpay` in **Preview environment only** in Vercel. Push a branch that triggers a preview deployment.

On the preview deployment, run the 7-8 test transactions required by the Razorpay security audit (`docs/hdfc-new-integration/Security-Audit-Checklist.md`). Test cards from `test-card-details.md`:

| Card | Behavior |
|---|---|
| `4111 1111 1111 1111` exp `3/2026` CVV `123` | Success |
| `5104 0600 0000 0008` | Success (Mastercard) |
| Other failures | See test-card-details.md |

**For each transaction, capture screenshots of:**
1. Modal open
2. Card details entry
3. Success page with order number + amount
4. Webhook arrival in logs (`logger.info('webhook/razorpay', ...)`)
5. DB row showing `status='success'`, `razorpay_payment_id` populated, `captured_at` set

Send the 7-8 screenshots to Razorpay's auditor.

### 4.7 Step 6 — Billing cutover

When UAT screenshots are approved by Razorpay:

1. In Vercel → Production env → change `BILLING_PAYMENT_PROVIDER` from `hdfc_smartgateway` to `razorpay`. Save.
2. Trigger a redeploy (Vercel does this automatically on env-var change, but verify).
3. Monitor for 1 hour: live transactions on the production billing page should show the Razorpay modal. Check `payment_transactions` for new rows with `provider='razorpay'`.
4. Confirm webhook delivery from Razorpay dashboard → Webhooks → Recent deliveries. All should be 200 OK.
5. Spot-check a few `razorpay_webhook_events` rows (the inbound webhook audit log — see §12.2).

### 4.8 Step 7 — Events cutover (1 week after billing)

Same as Step 6 but flip `EVENTS_PAYMENT_PROVIDER` instead.

### 4.9 Step 8 — Decommission HDFC (30 days after cutover)

After 30 days of stable Razorpay operation, file a separate PR titled `chore(payments): decommission HDFC SmartGateway code paths`:

- Delete `lib/services/events/core/hdfc-event-client.ts`
- Delete `lib/services/payments/hdfc-smartgateway-provider.ts`
- Remove HDFC branches from `payment-gateway-service.ts`, `event-payment-service.ts`, both callback routes
- Remove `HDFC_*` env vars from `.env.example`
- Remove `BILLING_PAYMENT_PROVIDER`/`EVENTS_PAYMENT_PROVIDER` (only one option remains)

**Constraints:**
- KEEP the `provider` column on `payment_transactions` and `event_payment_transactions` for audit
- KEEP all existing HDFC rows in both tables
- KEEP `webhook_logs` rows referencing HDFC (49,870+ rows; never delete)

---

## 5. Rollback procedure

If anything goes wrong **before** cutover:
- Nothing to roll back. The Razorpay code is dormant behind env flags.

If anything goes wrong **during/after** cutover:
- **Per-module rollback:** In Vercel → Production env → flip `BILLING_PAYMENT_PROVIDER` (or `EVENTS_PAYMENT_PROVIDER`) back to `hdfc_smartgateway`. New transactions will use HDFC again. **No code revert needed.**
- **Existing Razorpay transactions** stay in the DB with `provider='razorpay'`. The callback and status endpoints can still verify them (the branch on `transaction.provider` always works).
- **In-flight Razorpay payments** at the moment of rollback: the unified webhook continues to work for them. The user's modal completes normally; the callback writes status; nothing is stranded.

If a deeper revert is required:
```bash
# Revert the merge commit on main (preserves history)
git revert -m 1 638355ab1
git push origin main
```

This puts all Razorpay code behind a one-commit-revert. The DB columns stay (idempotent migrations) but the code stops touching them.

---

## 6. Monitoring after cutover

**First 24 hours:**
- Watch `razorpay_webhook_events` for new rows (§12.2). Volume should match live billing volume.
- Watch Razorpay dashboard → Payments for `failed` payments; the dashboard shows the reason.
- Run this query hourly:
  ```sql
  SELECT status, count(*) FROM payment_transactions
  WHERE provider='razorpay' AND created_at > now() - interval '1 hour'
  GROUP BY status;
  ```
  Expected ratio is ~95% `success`, the rest `initiated`/`processing` (pending capture) or `failed`. Anything above 10% `failed` is a problem.

**First week:**
- The `/api/cron/razorpay-late-auth` job runs every 15 minutes. Check its logs daily for `Sweep complete` and the captured/failed/expired counts.
- Verify refunds via `POST /api/billing/refunds/[id]/gateway-refund` succeed end-to-end on at least one real refund.

**Ongoing:**
- The unified webhook is the single source of truth. If Razorpay dashboard → Webhooks → Recent deliveries shows 4xx/5xx responses, something is failing inside the handler. Check the matching server log.

---

## 7. Known deviations from the plan

| Task | Plan said | What shipped | Why |
|---|---|---|---|
| 18 | Update CSP to allow Razorpay domains | Skipped | Project has no existing CSP. Adding one is out of scope. |
| 21 | Update success/failed pages to display Razorpay IDs | Skipped | Existing page already shows order_ref/amount/status — meets audit minimum. UI polish can be a follow-up. |
| 25–28 | Mirror Tasks 14–17 for events | Partial | Tasks 23 (initiate) and 24 (callback) shipped. 25 (pre-register) and 26 (status) were unconditional in plan — skipped because pre-register delegates to /initiate, status is HDFC-only admin view. 27 (events webhook) handled by unified webhook (Task 17). 28 (events UI) deferred to external marathon-app repo. |
| 29 | Add Razorpay vars to Vercel | Deferred | Manual dashboard step — see Section 4.4. |
| 30–32 | UAT testing | Deferred | Manual procedure — see Section 4.6. |
| 33–34 | Cutover | Deferred | Manual env-var flip — see Sections 4.7–4.8. |
| 36–38 | Refund admin UI button | Deferred | Backend ships (Task 35) — UI button can be added in follow-up. |
| 39–41 | Dispute admin UI | Deferred | Backend ships (webhook upserts `payment_disputes`) — admin page deferred. |
| 44 | Decommission HDFC | Deferred | Separate PR, 30 days post-cutover — see Section 4.9. |

All deferred items are either operational (manual) or follow-up UI/cleanup. The migration is **functionally complete** for end-to-end Razorpay payment processing.

---

## 8. Quick reference

### 8.1 Files changed at a glance (relative to pre-migration main)

```
lib/services/payments/                         (new, 11 files)
  amount.ts, provider.ts, factory.ts, hdfc-smartgateway-provider.ts,
  razorpay/{client, create-order, create-refund, get-status,
            razorpay-provider, types, verify-signature, verify-webhook}.ts

lib/services/billing/payment-gateway-service.ts    (extended)
lib/services/events/core/event-payment-service.ts  (extended)
types/payment-gateway.ts                            (extended)
hooks/billing/use-payment-gateway.ts                (extended)
components/billing/online-payment-button.tsx        (extended)
components/billing/razorpay-checkout-launcher.tsx   (new)

app/api/billing/payment/initiate/route.ts           (unchanged — pass-through)
app/api/billing/payment/callback/route.ts           (extended — Razorpay branch)
app/api/billing/refunds/[id]/gateway-refund/route.ts (new)
app/api/events/marathon/[eventId]/payment/initiate/route.ts  (extended)
app/api/events/marathon/[eventId]/payment/callback/route.ts  (extended)
app/api/webhooks/razorpay/route.ts                  (new)
app/api/cron/razorpay-late-auth/route.ts            (new)

supabase/migrations/20260522120000_razorpay_payment_columns.sql       (new)
supabase/migrations/20260523120000_billing_refunds_gateway_columns.sql (new)

vercel.json                                         (cron entry added)
.env.example                                        (Razorpay vars documented)
```

### 8.2 Env vars summary

```
# Required when going live:
RAZORPAY_KEY_ID=rzp_live_XXXXXXXX
RAZORPAY_KEY_SECRET=<secret>
RAZORPAY_WEBHOOK_SECRET=<secret>

# Provider selection (default 'hdfc_smartgateway'):
BILLING_PAYMENT_PROVIDER=razorpay    # flip at billing cutover
EVENTS_PAYMENT_PROVIDER=razorpay     # flip at events cutover (1 week later)

# Existing (keep until decommission PR lands):
HDFC_MERCHANT_ID=...
HDFC_API_KEY=...
HDFC_API_SECRET=...
HDFC_RESPONSE_KEY=...
HDFC_PAYMENT_PAGE_CLIENT_ID=...
HDFC_BASE_URL=...
HDFC_TEST_MODE=...
HDFC_ENABLE_LOGGING=...
# HDFC_CARD_ENCODING_KEY — unused, can be removed at decommission
```

### 8.3 Type-check status

`npx tsc --noEmit` passes with exit code 0 as of merge.

---

## 9. Contacts

- **Migration lead:** see git log on `feat/razorpay-migration` for author
- **Razorpay account:** check Razorpay dashboard for the owning Razorpay account ID
- **Security audit:** Razorpay's auditor reviews the 7-8 UAT transactions before live mode activation

## 10. Related documents

- [Integration-Guide.md](./Integration-Guide.md) — Razorpay API integration reference
- [Security-Audit-Checklist.md](./Security-Audit-Checklist.md) — Items the auditor verifies before go-live
- [test-card-details.md](./test-card-details.md) — Test cards for UAT
- [`docs/plans/2026-05-22-razorpay-migration-plan.md`](../plans/2026-05-22-razorpay-migration-plan.md) — Original 44-task implementation plan
- [`docs/plans/2026-06-03-institution-wise-razorpay-accounts-plan.md`](../plans/2026-06-03-institution-wise-razorpay-accounts-plan.md) — Per-institution accounts design & plan
- [Institution-Wise-Accounts.md](./Institution-Wise-Accounts.md) — **Per-institution accounts feature reference** (architecture, admin UI, env vars, activation, troubleshooting)

---

## 11. Institution-wise Razorpay accounts (added 2026-06-03)

The single global account (`RAZORPAY_KEY_ID` / `_KEY_SECRET` / `_WEBHOOK_SECRET`) is now the
**common fallback**. Each institution can settle into its **own** Razorpay merchant account,
matched by `institution_id`. Institutions without their own account keep using the common one
— so you migrate one institution at a time with zero disruption.

### 11.1 How it works
- Per-institution credentials live in `razorpay_accounts` (migration
  `20260603130000_razorpay_institution_accounts.sql`). `key_id` is stored plaintext (public);
  `key_secret` + `webhook_secret` are pgcrypto-encrypted (`pgp_sym_encrypt`) and accessed only
  via `service_role` SECURITY DEFINER RPCs (`fn_get/set/..._razorpay_account`).
- Credentials are resolved per payment by `resolveRazorpayCredentials({ accountId, institutionId })`
  → pinned account → institution's active account → common env account.
- Each transaction pins `razorpay_account_id`, so verify/status/refund/late-auth always use the
  same account that created the order (rotation-safe).
- Webhooks: each institution's account uses **`/api/webhooks/razorpay/<webhookRef>`** (the
  `webhookRef` is generated when you seed the account). The common account keeps using
  `/api/webhooks/razorpay`.

### 11.2 New env var
| Key | Value | Notes |
|---|---|---|
| `RAZORPAY_CREDENTIALS_MASTER_SECRET` | 32+ byte random hex | Encrypts/decrypts the per-institution secrets. Set in Vercel (production + preview). **Without it, per-institution accounts cannot be read/written** (the common env account still works). |

### 11.3 Onboarding an institution (per institution)
1. Create/obtain that institution's Razorpay account; get its `key_id` + `key_secret`.
2. Decide a webhook secret string for it (you'll use it in both the seed file and the Razorpay dashboard).
3. Add an entry to a **gitignored** `razorpay-accounts.seed.json` at the repo root:
   ```json
   [
     {
       "institutionId": "<institutions.id UUID>",
       "keyId": "rzp_live_XXXX",
       "keySecret": "<key secret>",
       "webhookSecret": "<your chosen webhook secret>",
       "label": "JKKN College of Arts and Science",
       "mode": "live"
     }
   ]
   ```
4. Seed it: `npm run seed:razorpay` (runs `tsx --env-file=.env.local scripts/seed-razorpay-accounts.ts`).
   The script prints the **webhook URL** to use for that account:
   `https://<prod>/api/webhooks/razorpay/<webhookRef>`.
5. In that institution's **Razorpay dashboard → Settings → Webhooks**, add a webhook with that URL,
   the **same** webhook secret from step 2, and the same active events listed in §4.3.
6. Verify with `npm run list:razorpay` (shows accounts + their webhook URLs; never prints secrets).
7. Run one test transaction for a learner in that institution and confirm the row in
   `payment_transactions` has the institution's `razorpay_account_id` and goes to `success`.

### 11.4 Key rotation
Re-run the seed for that institution with new keys. The old account row is kept (deactivated) so any
in-flight payment still verifies via its old `webhook_ref`; new orders use the new account. Once the
old account has drained, you can remove its webhook in the Razorpay dashboard.

### 11.5 Prerequisite note
The two base Razorpay migrations (`20260522120000`, `20260523120000`) were applied to the dev DB on
2026-06-03 (they had not been recorded there previously). Ensure they are present on any environment
before relying on Razorpay.

### 11.6 Admin UI
A management page ships at **`/billing/payment-accounts`** (sidebar: Billing → Payment Gateway Accounts),
gated by `billing.payment_accounts.view` (page) and `billing.payment_accounts.manage` (mutations). It lists
accounts (no secrets), supports add / rotate / deactivate / test-connection, and shows each account's webhook
URL to copy. By default only **super admins** can access it; grant the keys to finance roles via Role
Management when ready. The `npm run seed:razorpay` script remains available for bulk/scripted onboarding.

---

## 12. HDFC decommission (safe subset) + inbound webhook log fix — 2026-06-04 (PR #1220)

Shipped after the env cutover. **This section supersedes the HDFC "keep until decommission" notes in
§8.2 and the `webhook_logs` monitoring references in §4.7 / §6.**

### 12.1 HDFC removed at the config + safe-subset code layers
- **`.env`:** all `HDFC_*` credentials deleted. **`.env.example`** providers set to `razorpay`.
- **`lib/services/payments/factory.ts`:** Razorpay is the only provider. `getActiveProviderName()` now
  **throws** on `hdfc_smartgateway`, and an unset `BILLING_PAYMENT_PROVIDER` / `EVENTS_PAYMENT_PROVIDER`
  **defaults to `razorpay`** (previously defaulted to `hdfc_smartgateway`).
  ⚠️ A stale `=hdfc_smartgateway` value (e.g. left in Vercel) now hard-fails the first payment — remove it everywhere.
- **Deleted:** `lib/services/payments/hdfc-smartgateway-provider.ts` (throw-only adapter) and the two
  legacy HDFC webhook routes `app/api/billing/payment/webhook/route.ts` and
  `app/api/events/marathon/[eventId]/payment/webhook/route.ts`. The debug `app/api/debug/env-check/route.ts`
  now reports `RAZORPAY_*` presence instead of `HDFC_*`.
- **Deferred (NOT yet done):** the deeper cleanup — stripping the now-unreachable HDFC code from
  `payment-gateway-service.ts`, `event-payment-service.ts`, `hdfc-event-client.ts`, and the HDFC types in
  `types/payment-gateway.ts`. That code is dead (the factory only ever returns `razorpay`) but still
  physically present. **There is no env-flip rollback anymore** — backing out means a `git revert` + redeploy
  and re-adding the `HDFC_*` env vars.

### 12.2 Inbound webhook audit log — table fix
`dispatchRazorpayWebhook` logged inbound events into `webhook_logs`, but that table is the unrelated
**outbound** user/application sync log (`table_name` / `record_id` / `http_status`, all `NOT NULL`,
created by migration `20251003033901`). Every insert failed **silently** (non-fatal `catch` → route still
returns 200), so there was no inbound audit trail. Payments were unaffected because anti-replay keys off the
transaction row's `status`, not this log.
- **Fix:** new table **`razorpay_webhook_events`** (`id`, `provider`, `event_type`, `raw_payload`,
  `received_at`; service-role-only RLS) via migration `20260604200000_razorpay_webhook_events.sql`; the
  handler was repointed at it.
- **Corrected monitoring query:**
  ```sql
  select event_type, received_at from razorpay_webhook_events order by received_at desc limit 20;
  ```

### 12.3 Webhook configuration recap (common env account)
- **URL:** `https://<domain>/api/webhooks/razorpay` (per-institution accounts use
  `/api/webhooks/razorpay/[webhookRef]`).
- **Secret:** `RAZORPAY_WEBHOOK_SECRET` — a value you choose, entered **identically** in the Razorpay
  dashboard and the env. The route fail-fast **500s** if it is unset; **401** on signature mismatch.
- **Active events (11):** `order.paid`, `payment.captured`, `payment.authorized`, `payment.failed`,
  `refund.created`, `refund.processed`, `refund.failed`,
  `payment.dispute.created`, `payment.dispute.lost`, `payment.dispute.won`, `payment.dispute.closed`.
- **Test and Live are separate** on Razorpay — configure a webhook in each mode with that mode's keys/secret.

### 12.4 Local test harness
`scripts/test-razorpay-webhook.mjs` signs a sample event with `RAZORPAY_WEBHOOK_SECRET` and POSTs it to the
running dev server, verifying route + signature + logging **without** a public tunnel:
```bash
node --env-file=.env scripts/test-razorpay-webhook.mjs [order_id] [event]
```
A dummy order id proves endpoint/signature/log; pass a real `razorpay_order_id` to also exercise the
status-update path.

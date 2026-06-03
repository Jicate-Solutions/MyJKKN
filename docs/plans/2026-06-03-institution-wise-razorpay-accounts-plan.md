# Institution-wise Razorpay (HDFC Collect Now) Accounts — Design & Implementation Plan

**Date:** 2026-06-03
**Author:** (pairing session)
**Builds on:** `docs/hdfc-new-integration/Implementation-Status-and-Deployment.md` (the single-account Razorpay migration merged at `638355ab1`)
**Status:** Awaiting confirmation

---

## 1. Problem statement

The Razorpay integration is live behind a clean `PaymentProvider` abstraction, but it uses **one global Razorpay account** for every institution. Credentials come from three env vars read at four leaf points:

| Env var | Read at | Used for |
|---|---|---|
| `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` | `razorpay/client.ts` (`getRazorpayAuth`) | API auth → create-order, get-status, refund |
| `RAZORPAY_KEY_ID` | `razorpay/razorpay-provider.ts` | key_id returned to the browser checkout |
| `RAZORPAY_KEY_SECRET` | `razorpay/verify-signature.ts` | callback HMAC (`order_id\|payment_id`) |
| `RAZORPAY_WEBHOOK_SECRET` | `razorpay/verify-webhook.ts` | webhook HMAC (raw body) |

We want each institution to settle into **its own Razorpay merchant account**, matched by the `institution_id` that already exists on every bill, learner, registration and transaction row. Institutions not yet configured must keep working on the current common account (your Arts & Science account) with zero disruption.

### Confirmed decisions
1. **Storage:** new `razorpay_accounts` table; `key_id` plaintext (it is public), `key_secret`/`webhook_secret` encrypted as `bytea` via **pgcrypto `pgp_sym_encrypt`** with a master secret in env, accessed through **SECURITY DEFINER RPCs** and a **server-only vault** — mirrors the existing `CalApiKeyVault` pattern (`lib/services/integrations/cal-api-key-vault.ts`).
2. **Webhook:** **per-institution webhook URL path** `/api/webhooks/razorpay/[webhookRef]`. Each account's Razorpay dashboard is configured with its own URL; the path resolves the account → its webhook secret → verify.
3. **Fallback:** when an institution has no active account, **fall back to the common env account**. Migrate institution-by-institution.
4. **Tooling:** ship a **secure seeding script** in v1; full admin UI is a fast follow-up.

---

## 2. Key facts that make this tractable

- **`institution_id` is already present at every credential-needing flow point** — billing derives it from the bills, events from the registration, and callback/status/refund/late-auth all read it off the transaction row. The only place it is *not* available pre-work is raw webhook verification — which is exactly why decision #2 puts the account identity in the URL path.
- **One order = one institution.** `createPaymentSession` already rejects bills spanning multiple institutions (`MULTIPLE_INSTITUTIONS`). So a payment always maps to exactly one account — no split-settlement ambiguity.
- **`proxy.ts:57` treats all `/api/*` as public** — the new webhook path is auto-allow-listed; no proxy change needed.
- **The browser already receives `razorpay_key_id` from the session response** (`order.clientKeyId`). Once `createOrder` returns the institution's key, the correct key reaches checkout automatically — *no client change* (to be verified against `razorpay-checkout-launcher.tsx`).
- **`CalApiKeyVault` is a working precedent** for pgcrypto + master-secret + SECURITY DEFINER RPCs + `server-only` guard.

---

## 3. Architecture

### 3.1 Data model

**New table `razorpay_accounts`:**

```
id                      uuid pk default gen_random_uuid()
institution_id          uuid not null references institutions(id) on delete restrict
key_id                  text not null                   -- public (rzp_live_/rzp_test_)
key_secret_encrypted    bytea not null                  -- pgp_sym_encrypt(plaintext, master)
webhook_secret_encrypted bytea not null                 -- pgp_sym_encrypt(plaintext, master)
webhook_ref             text not null unique            -- opaque token used in webhook URL path
account_label           text                            -- e.g. "JKKN Arts & Science"
mode                    text not null default 'live' check (mode in ('test','live'))
is_active               boolean not null default true
created_at              timestamptz not null default now()
updated_at              timestamptz not null default now()
created_by              uuid references profiles(id)
updated_by              uuid references profiles(id)
```

- **Unique partial index** `(institution_id) where is_active` → at most one active account per institution.
- `webhook_ref`: ~24-char base62 random, unique; used only in the webhook URL path so internal UUIDs aren't exposed and the URL can be rotated.
- **RLS:** locked to `service_role` (secrets live here). Admin listing later goes through `fn_list_razorpay_accounts()` (no secrets).
- **Register the table in `types/supabase.ts`** (per repo gotcha — otherwise `.from('razorpay_accounts')` fails typecheck).
- Trigger `update_razorpay_accounts_updated_at`.

**Pin the settling account onto each transaction** (handles key rotation + audit):

```
ALTER TABLE payment_transactions       ADD COLUMN IF NOT EXISTS razorpay_account_id uuid references razorpay_accounts(id);
ALTER TABLE event_payment_transactions ADD COLUMN IF NOT EXISTS razorpay_account_id uuid references razorpay_accounts(id);
```

Set at order creation. `NULL` = the common env account. Resolve creds **by the pinned account** at verify/status/refund/late-auth time so an in-flight payment is always queried with the key that created it, even after rotation. Also gives a clean "which account settled this" audit join.

### 3.2 RPCs (SECURITY DEFINER, pgcrypto)

Master secret env: `RAZORPAY_CREDENTIALS_MASTER_SECRET`.

- `fn_set_razorpay_account(p_institution_id, p_key_id, p_key_secret, p_webhook_secret, p_label, p_mode, p_webhook_ref, p_master_secret)` → deactivate prior active for the institution, insert new active row, return `(id, webhook_ref)`.
- `fn_get_razorpay_account(p_institution_id, p_master_secret)` → `(id, key_id, key_secret, webhook_secret, mode, webhook_ref)` for the active account; 0 rows if none.
- `fn_get_razorpay_account_by_id(p_account_id, p_master_secret)` → same shape, by id (for pinned-account resolution incl. deactivated historicals).
- `fn_get_razorpay_account_by_webhook_ref(p_webhook_ref, p_master_secret)` → `(id, institution_id, webhook_secret)` for webhook verification.
- `fn_list_razorpay_accounts()` → `(id, institution_id, key_id, account_label, mode, is_active, created_at)` — **no secrets** — for audit/admin UI.
- `fn_deactivate_razorpay_account(p_institution_id)`.

Commit the real SQL bodies to `supabase/migrations/` and mirror into `supabase/setup/{01_tables,02_functions,03_policies,04_triggers}.sql` (per `MODULE_DEVELOPMENT_WORKFLOW.md`). No `SELECT 1;` placeholders.

### 3.3 Server-only vault + resolver

`lib/services/payments/razorpay/account-vault.ts` (`import 'server-only'`, mirrors `CalApiKeyVault`):

```ts
export interface RazorpayCredentials {
  keyId: string; keySecret: string; webhookSecret: string;
  mode: 'test' | 'live';
  source: 'institution' | 'env';
  accountId?: string; institutionId?: string; webhookRef?: string;
}
class RazorpayAccountVault {
  static getForInstitution(institutionId): Promise<RazorpayCredentials | null>
  static getById(accountId): Promise<RazorpayCredentials | null>
  static getByWebhookRef(webhookRef): Promise<{ accountId; institutionId; webhookSecret } | null>
  static set(args): Promise<{ id; webhookRef }>
  static list(): Promise<AccountSummary[]>          // no secrets
  static deactivate(institutionId): Promise<void>
}
```

`lib/services/payments/razorpay/resolve-credentials.ts` (server-only):

```ts
// Resolution order: pinned account → institution's active account → common env account.
resolveRazorpayCredentials({ accountId?, institutionId? }): Promise<RazorpayCredentials>
// throws only if NONE of the three are configured.
```

Secret rules (mirroring the vault precedent): never log secrets, never return `key_secret`/`webhook_secret` to the browser, file is server-only.

### 3.4 Credential injection into the provider (constructor injection)

The `PaymentProvider` *interface* stays unchanged. The change is internal to the Razorpay implementation: credentials become **constructor-injected** instead of read from env.

- `razorpay/client.ts`: `razorpayRequest(method, path, body, auth: { keyId; keySecret })` — delete `getRazorpayAuth()`; build Basic auth from `auth`.
- `razorpay/create-order.ts`: `createOrder(args, auth)`.
- `razorpay/get-status.ts`: `getOrderStatus(orderId, auth)`, `getPaymentStatus(paymentId, auth)`, `dualInquiry(orderId, paymentId, auth)`.
- `razorpay/create-refund.ts`: `createRefund(input, auth)`.
- `razorpay/verify-signature.ts`: `verifySignature(input, keySecret)`.
- `razorpay/verify-webhook.ts`: `verifyWebhookSignature(input, webhookSecret)`.
- `razorpay/razorpay-provider.ts`: `constructor(private creds: RazorpayCredentials)`; each method forwards `creds`; `createOrder` returns `clientKeyId: this.creds.keyId`.

**Factory becomes async + institution-aware:**

```ts
// factory.ts — getActiveProviderName(module) stays sync (env flag).
export async function getPaymentProvider(
  module: PaymentModule,
  ctx?: { institutionId?: string; accountId?: string },
): Promise<PaymentProvider> {
  const name = getActiveProviderName(module);
  if (name === 'hdfc_smartgateway') return new HdfcSmartGatewayProvider();
  const creds = await resolveRazorpayCredentials(ctx ?? {});
  return new RazorpayProvider(creds);
}
```

Backward-compatible: with no `ctx`, resolution falls through to the env account — identical to today's behavior. The HDFC provider ignores credentials (it reads its own env and is being decommissioned).

### 3.5 Call-site updates (thread the institution / pinned account)

| File | Change |
|---|---|
| `lib/services/billing/payment-gateway-service.ts` → `createPaymentSession` | `await getPaymentProvider('billing', { institutionId })`; persist `razorpay_account_id` from the resolved creds on the new row. |
| …`verifyPaymentWithGateway` | Resolve creds via `{ accountId: txn.razorpay_account_id, institutionId: txn.institution_id }`; pass `keySecret` to `verifySignature` and `{keyId,keySecret}` to `dualInquiry`. |
| …`checkPaymentStatus` | `await getPaymentProvider('billing', { accountId: txn.razorpay_account_id, institutionId: txn.institution_id })`. |
| `lib/services/events/core/event-payment-service.ts` → `initiatePayment` | `await getPaymentProvider('events', { institutionId: registration.institution_id ?? undefined })`; persist `razorpay_account_id` (null when no institution → env account). |
| `app/api/events/marathon/[eventId]/payment/callback/route.ts` | Resolve creds by pinned account / `txn.institution_id` for the Razorpay verify branch. |
| `app/api/billing/refunds/[id]/gateway-refund/route.ts` | `await getPaymentProvider('billing', { accountId: txn.razorpay_account_id, institutionId: txn.institution_id })`. |
| `app/api/cron/razorpay-late-auth/route.ts` | Resolve provider **per row** by `{ accountId, institutionId }` with an in-memory `Map` cache keyed by account/institution. |

### 3.6 Webhooks

Extract the dispatch logic (`handlePaymentCaptured/Authorized/Failed`, `handleRefundEvent`, `handleDisputeEvent`, `moduleFromNotes`) from the current route into a shared module:

- `lib/services/payments/razorpay/webhook-handlers.ts` — pure dispatch, no verification. (Verification by `payment_id`/`order_id` lookups is unchanged; these handlers don't call the Razorpay API.)

Two thin routes import it:

- **`app/api/webhooks/razorpay/route.ts`** (existing, kept): verifies with the **common env webhook secret** → for institutions still on the fallback account.
- **`app/api/webhooks/razorpay/[webhookRef]/route.ts`** (new): `RazorpayAccountVault.getByWebhookRef(webhookRef)` → verify HMAC with that account's secret → shared dispatch. Returns 401 on unknown ref or bad signature.

No `proxy.ts` change (all `/api/*` already public). Idempotency/anti-replay (`status` terminal check) is unchanged.

### 3.7 Seeding script + ops

- `scripts/seed-razorpay-accounts.ts` (run via `npx tsx`): reads a **gitignored** `razorpay-accounts.seed.json` (array of `{ institutionId, keyId, keySecret, webhookSecret, label, mode }`), calls `RazorpayAccountVault.set()` for each, and prints the generated `webhook_ref` + the exact webhook URL (`https://<prod>/api/webhooks/razorpay/<webhookRef>`) to paste into each Razorpay dashboard. Secrets never touch shell history or git.
- Add `razorpay-accounts.seed.json` to `.gitignore`.
- Document the per-institution onboarding steps (create Razorpay account → get keys → add webhook with the printed URL → run seed → test one transaction) appended to the deployment doc.

---

## 4. Phased implementation plan

Each phase ends with: `mcp__ide__getDiagnostics` clean on touched files; the **common-account fallback still works** (regression guard); and where relevant, a browser test with test keys.

### Phase 1 — Storage & vault (DB + server libs)
1. Migration: `razorpay_accounts` table + indexes + RLS + trigger; `razorpay_account_id` columns on both transaction tables; pgcrypto RPCs. Mirror to `supabase/setup/`.
2. Register `razorpay_accounts` in `types/supabase.ts`; regenerate transaction-table types or extend the existing `as any` casts consistently.
3. `account-vault.ts` + `resolve-credentials.ts`.
4. `.env.example`: add `RAZORPAY_CREDENTIALS_MASTER_SECRET`.

### Phase 2 — Provider credential injection (no behavior change)
5. Refactor the six razorpay leaf files to take `auth`/secret params.
6. `RazorpayProvider` constructor injection; `factory.getPaymentProvider` async + `ctx`.
7. Update all call sites (§3.5) to `await` + pass context and persist `razorpay_account_id`.
8. Verify the global account path is byte-for-byte equivalent when no per-institution row exists (fallback).

### Phase 3 — Per-institution webhook
9. Extract `webhook-handlers.ts`; refactor existing route to import it (env-secret verify).
10. Add `[webhookRef]` route (per-account verify) + shared dispatch.

### Phase 4 — Seeding & ops
11. Seed script + `.gitignore` entry + deployment-doc onboarding section.
12. Seed **one** institution end-to-end with Razorpay **test** keys; run the dual-inquiry + amount-mismatch + webhook checks; confirm a second, unconfigured institution still pays via the common account.

### Phase 5 — Admin UI (fast follow, deferred per decision #4)
RBAC-gated billing-settings page: list (`fn_list_razorpay_accounts`), add/edit/rotate (masked secret inputs), activate/deactivate, "test connection", and show the webhook URL to copy. New permission key(s) granted via migration.

---

## 5. Security & correctness guarantees (preserved/added)
- Dual inquiry, amount-in-paise mismatch, HMAC timing-safe compare, anti-replay — **all preserved**, now per-institution.
- Secrets encrypted at rest (pgcrypto), master secret in env only, `server-only` vault, never logged, never sent to browser. `key_id` is the only public value.
- Webhook secret resolved by opaque `webhook_ref`; HMAC still gates every event.
- Pinned `razorpay_account_id` guarantees verify/status/refund use the same account that created the order (rotation-safe).
- `razorpay_accounts` RLS = service-role only.

## 6. Edge cases
- **No institution (events external participant):** `institution_id` null → env fallback. ✔
- **Multi-institution bill:** already blocked upstream. ✔
- **Key rotation:** new `set()` deactivates old + inserts new; historical txns resolve by pinned `razorpay_account_id` (incl. deactivated rows via `fn_get_razorpay_account_by_id`). ✔
- **Late-auth cron across institutions:** per-row resolution with cache. ✔
- **Unknown `webhook_ref`:** 401, logged as invalid webhook. ✔

## 7. Out of scope
- HDFC SmartGateway decommission (separate PR, per existing doc §4.9).
- Multiple Razorpay accounts *sharing* across institutions beyond the env-fallback (institutions without their own account simply use the common one).
- Marathon external-app UI changes.

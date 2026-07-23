# Institution-Wise Razorpay (HDFC Collect Now) Accounts — Feature Reference

**Status:** Implemented & verified (DB round-trip + full typecheck + build gates). **Not yet activated** — see §9 Activation.
**Date:** 2026-06-03
**Builds on:** the single-account Razorpay migration ([Implementation-Status-and-Deployment.md](./Implementation-Status-and-Deployment.md))
**Design/plan:** [`docs/plans/2026-06-03-institution-wise-razorpay-accounts-plan.md`](../plans/2026-06-03-institution-wise-razorpay-accounts-plan.md)

---

## 1. What this feature does

Each institution can settle online payments into **its own Razorpay merchant account**, matched by the
`institution_id` already present on every bill / registration / transaction. Institutions that have **not**
been given their own account automatically use the **common (env) account** — so you migrate one institution
at a time with zero disruption.

It applies to **both** payment modules:
- **Billing** (`payment_transactions`) — learner fee payments.
- **Events** (`event_payment_transactions`) — marathon / event registrations.

---

## 2. Mental model (read this first)

"Institution-based" is **not automatic** — it is *fallback-with-overrides*:

```
A learner pays
  → Is BILLING_PAYMENT_PROVIDER = 'razorpay'?           (the cutover switch)
       NO  → HDFC SmartGateway for everyone. (Razorpay code is dormant.)
       YES → Does this institution have a seeded razorpay_accounts row?
                YES → use THAT institution's account.
                NO  → use the common env account (RAZORPAY_KEY_ID/_SECRET/_WEBHOOK_SECRET).
```

So an institution routes to its own account **only after** (a) the provider is switched to Razorpay and
(b) that institution's credentials have been loaded. See §9 and §10 (troubleshooting).

---

## 3. Architecture

### 3.1 Data model
- **Table `razorpay_accounts`** (migration `20260603130000_razorpay_institution_accounts.sql`):
  `id, institution_id, key_id (plaintext — public), key_secret_encrypted (bytea), webhook_secret_encrypted (bytea),
  webhook_ref (unique), account_label, mode ('test'|'live'), is_active, created_at/updated_at, created_by/updated_by`.
  - Partial unique index → **at most one active account per institution**.
  - `key_secret` / `webhook_secret` are encrypted with **pgcrypto `pgp_sym_encrypt`**; `key_id` is public.
  - RLS: **service-role only**. All access goes through SECURITY DEFINER RPCs.
- **`razorpay_account_id`** column added to `payment_transactions` and `event_payment_transactions`. Each
  transaction **pins** the account that created its order, so verify/status/refund/late-auth always use the
  same keys even after rotation. `NULL` = the common env account.

### 3.2 SECURITY DEFINER RPCs (service-role; pgcrypto)
| RPC | Purpose |
|---|---|
| `fn_set_razorpay_account(...)` | Create/rotate an institution's active account (deactivates the prior one). Returns `id` + `webhook_ref`. |
| `fn_get_razorpay_account(institution, master)` | Active account creds for an institution (decrypted). |
| `fn_get_razorpay_account_by_id(id, master)` | Creds for a specific account (incl. deactivated) — pinned-account resolution. |
| `fn_get_razorpay_account_by_webhook_ref(ref, master)` | Webhook secret by URL-path ref (ignores `is_active`). |
| `fn_list_razorpay_accounts()` | List **without secrets** (admin UI / audit). |
| `fn_deactivate_razorpay_account(institution, actor)` | Deactivate the active account. |

> **pgcrypto gotcha:** on Supabase pgcrypto lives in the `extensions` schema, so every RPC uses
> `SET search_path = public, extensions`. A `public`-only search_path fails with
> `function gen_random_bytes / pgp_sym_* does not exist`.

### 3.3 Server libraries (`lib/services/payments/razorpay/`)
| File | Role |
|---|---|
| `credentials.ts` | Pure types: `RazorpayApiAuth` (`keyId`/`keySecret`), `RazorpayCredentials` (+ `webhookSecret`, `mode`, `source`, `accountId`, `institutionId`, `webhookRef`). |
| `account-vault.ts` | `RazorpayAccountVault` — server-only; wraps the RPCs (get/getById/getByWebhookRef/set/list/deactivate). Master key env `RAZORPAY_CREDENTIALS_MASTER_SECRET`. Mirrors `CalApiKeyVault`. |
| `resolve-credentials.ts` | `resolveRazorpayCredentials({ accountId?, institutionId? })` → **pinned account → institution active → common env**. Throws only if none configured. |
| `razorpay-provider.ts` | `RazorpayProvider` now takes credentials via **constructor injection** (no `process.env` key reads). Adds `dualInquiry()` + `accountId` getter. |
| `client.ts`, `create-order.ts`, `get-status.ts`, `create-refund.ts` | Leaf functions now take an `auth` arg. |
| `verify-signature.ts`, `verify-webhook.ts` | Now take the relevant secret as an arg. |
| `webhook-handlers.ts` | Shared `dispatchRazorpayWebhook(supabase, payload)` (idempotency log + event dispatch) used by both webhook routes. |
| `factory.ts` | `getPaymentProvider(module, ctx?)` is now **async** and resolves per-institution credentials. |

### 3.4 Call sites (credential context threaded through)
`payment-gateway-service` (create/verify/status), `event-payment-service.initiatePayment`, the events
payment callback route, the billing gateway-refund route, and the late-auth cron — all resolve credentials
by `{ accountId: txn.razorpay_account_id, institutionId }`. Order creation persists `razorpay_account_id`.

---

## 4. Webhooks

Razorpay HMAC must be verified **before** we know the institution, so each account has its own webhook URL:

| Endpoint | Used by | Verifies with |
|---|---|---|
| `POST /api/webhooks/razorpay` | Institutions on the **common** account | env `RAZORPAY_WEBHOOK_SECRET` (fail-fast 500 if unset) |
| `POST /api/webhooks/razorpay/[webhookRef]` | Institutions with **their own** account | that account's webhook secret (resolved by `webhookRef`, ignores `is_active`) |

Both share `dispatchRazorpayWebhook`. The `webhookRef` is generated when you seed an account and printed for
you to paste into that institution's Razorpay dashboard. Because lookup ignores `is_active`, a rotated-out
account's in-flight webhooks still verify. (`/api/*` is already public in `proxy.ts` — no change needed.)

---

## 5. Admin UI

**Page:** `/billing/payment-accounts` (sidebar: **Billing → Payment Gateway Accounts**).
**Permissions:** `billing.payment_accounts.view` (page) / `billing.payment_accounts.manage` (mutations).
By default **only super admins** have these; grant to finance roles via **Role Management** when ready.

Capabilities: list accounts (no secrets), **Add / Rotate** (institution picker + masked secret inputs + mode),
**Deactivate** (confirm), **Test connection** (pings Razorpay with the resolved creds and reports
source = institution|env and mode), and **Copy webhook URL** per row.

**API routes** (session-only, `withAuth` + permission-gated; vault uses service-role internally):
`GET/POST /api/billing/payment-accounts`, `POST /api/billing/payment-accounts/deactivate`,
`POST /api/billing/payment-accounts/test`. **Hook:** `hooks/billing/use-razorpay-accounts.ts`.

---

## 6. Seeding (scripted onboarding)

For bulk/scripted setup instead of the UI:
```bash
npm run seed:razorpay     # reads gitignored razorpay-accounts.seed.json, prints each webhook URL
npm run list:razorpay     # lists accounts + webhook URLs (no secrets)
```
`razorpay-accounts.seed.json` (gitignored — holds plaintext secrets) is an array of
`{ institutionId, keyId, keySecret, webhookSecret, label?, mode? }`. See the script header for the shape.

---

## 7. Environment variables

| Key | What | Notes |
|---|---|---|
| `RAZORPAY_CREDENTIALS_MASTER_SECRET` | App-generated encryption key (32-byte hex) | **You generate it** (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), not Razorpay. Encrypts the per-institution secrets. **Same DB ⇒ same secret across envs.** Rotating it orphans existing ciphertext (re-seed required). |
| `BILLING_PAYMENT_PROVIDER` / `EVENTS_PAYMENT_PROVIDER` | `hdfc_smartgateway` (default) or `razorpay` | The cutover switch. Must be `razorpay` for any institution routing to occur. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | The **common** account (Arts & Science) | From the Razorpay dashboard. Used as fallback for un-seeded institutions. |

Per-institution `key_id`/`key_secret`/`webhook_secret` are **not** env vars — they live (encrypted) in
`razorpay_accounts`, loaded via the admin UI or seed script.

---

## 8. Key rotation

Re-seed (or Rotate in the UI) with new keys. The old account row is **kept (deactivated)** so in-flight
payments still verify via its old `webhook_ref`; new orders use the new account. Once the old account has
drained, remove its webhook from the Razorpay dashboard.

---

## 9. Activation checklist (to switch an institution to its own account)

1. Set `RAZORPAY_CREDENTIALS_MASTER_SECRET` (Vercel prod+preview, and `.env`/`.env.local` for local).
2. Set the common `RAZORPAY_KEY_ID/_KEY_SECRET/_WEBHOOK_SECRET` and `BILLING_PAYMENT_PROVIDER=razorpay`.
3. Seed the institution (UI `/billing/payment-accounts` → Add account, or `npm run seed:razorpay`).
4. Paste the printed `…/api/webhooks/razorpay/<webhookRef>` URL into that institution's Razorpay dashboard
   (same webhook secret you entered), with the events listed in the deployment guide §4.3.
5. Run a test payment for a learner in that institution; confirm the `payment_transactions` row has the
   institution's `razorpay_account_id` and reaches `success`.

---

## 10. Troubleshooting

**"Every institution opens the HDFC gateway / the common gateway — not its own account."**
This is the expected default when the feature isn't activated. Check, in order:
1. `BILLING_PAYMENT_PROVIDER` — if unset/`hdfc_smartgateway`, **all** institutions use HDFC and the Razorpay
   code never runs. Set it to `razorpay`.
2. `RAZORPAY_CREDENTIALS_MASTER_SECRET` — if unset, per-institution accounts can't be read; everything falls
   back to the common account. Set it.
3. `razorpay_accounts` rows — `npm run list:razorpay` or
   `select institution_id, is_active from razorpay_accounts`. If the institution has no active row, it uses
   the common account. Seed it.
4. **Bill institution mismatch** — routing keys off the **bill's** `institution_id`, not the student's
   profile. Verify the learner's bills carry the target institution's id.

**Webhook returns 401 / 500.** 500 on the common endpoint = `RAZORPAY_WEBHOOK_SECRET` unset. 401 = signature
mismatch (wrong secret in the dashboard) or unknown `webhookRef`.

**`function gen_random_bytes does not exist`** when seeding = an RPC missing `extensions` in its search_path
(see §3.2).

---

## 11. Verification status (as shipped 2026-06-03)
- DB: encrypt→decrypt round-trip verified live; all 6 RPC signatures confirmed.
- TypeScript: full `tsc` — **0 errors in any touched file** (pre-existing repo errors are build-ignored).
- Build gates: `gen:routes`, `check:sidebar`, `check:reachability`, `check:audit-coverage`, permissions catalog — all pass.
- **Pending:** end-to-end browser test (needs `RAZORPAY_CREDENTIALS_MASTER_SECRET` + a seeded account with Razorpay test keys).

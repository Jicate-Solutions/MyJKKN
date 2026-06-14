# Institution × Fee-Head Razorpay Account Routing — Design & Implementation Plan

**Date:** 2026-06-13
**Builds on:** `docs/plans/2026-06-03-institution-wise-razorpay-accounts-plan.md` and
`docs/hdfc-new-integration/Institution-Wise-Accounts.md` (the institution-wise account
system shipped 2026-06-03 — table, vault, resolver, factory, per-institution webhook,
admin UI, seed script).
**Status:** Approved 2026-06-13 — proceeding with Phase 1.

---

## 1. Why this exists

JKKN's HDFC SmartGateway "live kit" (processed via Razorpay) assigns a **distinct MID per
college**, and for several colleges a **further MID per fee head** — e.g.
`…ARTS AND SCI AUTO-BUS FEE` (transport), `…ENG AND TECH-UNIVERSITY FEE` (university fee),
`…DENTAL…-ESTAB FEE` (establishment). Each MID is a **standalone Razorpay account with its
own `key_id`/`key_secret`** (confirmed by the user).

The goal: a learner's online payment auto-settles into the merchant account for **their
institution and the bill's fee head**, matched off `learners_profiles.institution_id` /
`billing_student_bills.institution_id` and `billing_categories.kind`.

## 2. Current state (verified 2026-06-13)

The **institution-level** routing system is fully built and wired but **inert** because the
`razorpay_accounts` table is empty and `RAZORPAY_CREDENTIALS_MASTER_SECRET` is unset — so
every payment falls back to the common env account.

Already built: `razorpay_accounts` table + encrypted-secret vault + SECURITY DEFINER RPCs;
`resolveRazorpayCredentials` (pinned → institution → env); order creation pins
`payment_transactions.razorpay_account_id`; verify/refund/webhook resolve by the pin;
admin UI `/billing/payment-accounts` + 3 API routes + `use-razorpay-accounts` hook; seed
script.

**The only genuinely new capability is the fee-head dimension** — today the schema's partial
unique index allows **one active account per institution**, with no fee-head concept.

## 3. Design

### 3.1 Data model — add a fee-head slot to each account row

With "standalone keys", **one `razorpay_accounts` row = one MID = one Razorpay account**.
The new column says which routing slot it fills:

- `fee_head text` (nullable). `NULL` = the institution's **general/default** account
  (tuition, application, exam, etc.). A non-NULL value = a `billing_categories.kind`
  (`transport`, `university_fee`, `establishment`, …) routed to its dedicated MID.
- Reconciliation columns for the HDFC dashboard: `mid text`, `tid text`, `dba_name text`
  (all nullable; reference only — routing is by `key_id`, identity for ops is the MID).

Unique index becomes one active account per **(institution, fee_head)**, with `COALESCE`
so two NULL-head rows still conflict (Postgres treats bare NULLs as distinct):

```sql
CREATE UNIQUE INDEX razorpay_accounts_active_inst_feehead_uidx
  ON razorpay_accounts (institution_id, COALESCE(fee_head, '__default__'))
  WHERE is_active;
```

### 3.2 Resolution (best-match in one query)

Given `(institutionId, feeHead)` from a bill, pick the most specific active account:

```
exact (institution_id, fee_head = billHead)
  → fall back to (institution_id, fee_head IS NULL)   -- college default MID
  → fall back to common env account
```

`fn_get_razorpay_account(p_institution_id, p_master_secret, p_fee_head DEFAULT NULL)`:
`WHERE institution_id=p_inst AND is_active AND (fee_head=p_fee_head OR fee_head IS NULL)
ORDER BY (fee_head=p_fee_head) DESC LIMIT 1`. The new param is appended with a default so
existing 2-arg callers keep working (head = NULL → default account).

### 3.3 Only order creation changes; everything downstream is untouched

`createPaymentSession` already pins `razorpay_account_id` on the transaction. Verify,
refund, status, webhooks, and the **events** module all resolve credentials by that pin —
so once order creation selects the right account, every later step is correct with **no
change**. Events pass no fee head → resolve to the institution default. This is the
load-bearing property that keeps the change surgical.

### 3.4 Mixed-head payments — Decision D1 (approved: route-or-default)

A single payment may bundle bills of different heads (tuition + bus + university). Approved
behavior: **if every bill in the order shares one head, route to that head's MID; otherwise
route to the institution's default account.** No order-splitting, no new UX. Mixed bundles
land in the college's general MID and rely on the existing **apportionment overlay**
(internal revenue-head split) for accounts-side attribution. (Alternatives considered and
rejected for v1: hard-block mixed bundles; split into one order per head.)

## 4. Phases

- **Phase 0 — Activate institution-level routing (ops, no code).** Generate + set
  `RAZORPAY_CREDENTIALS_MASTER_SECRET`; per college, create Razorpay keys + webhook, add via
  the admin UI, paste the printed webhook URL back; test one college. Delivers the core ask
  for the general MID per college immediately.
- **Phase 1 — Schema + resolver.** Migration (fee_head/mid/tid/dba_name + new unique index +
  recreate `fn_set`/`fn_get`/`fn_list`), mirror to `supabase/setup/`, register columns in
  `types/supabase.ts`, extend the vault + `ResolveContext` with `feeHead`.
- **Phase 2 — Fee-head-aware order creation.** In `createPaymentSession`: select
  `item_category_id`, join `billing_categories.kind`, derive the order head per D1, pass
  `{ institutionId, feeHead }` to `getPaymentProvider`.
- **Phase 3 — Admin UI + seed.** Fee-head selector + mid/tid/dba_name fields in
  `account-form-dialog`; show fee-head/MID columns in the manager; thread through the API
  routes, hook, and seed script (+ JSON shape).
- **Phase 4 — Taxonomy reconciliation + seeding (data; D2/D3).** Create the `establishment`
  fee head if estab bills must route separately (**D2 — pending user input**); confirm
  bus→`transport`; build and verify the DBA→(institution_id, fee_head) map (ambiguities:
  two "Arts & Science" rows share code CAS; "SRESAKTHIMAYEIL"=JKKN Nursing; "DENTAL-AHS"=
  Allied Health Sciences). Seed all accounts with per-account keys (**D3 — pending full MID
  list + per-account key_id/key_secret/webhook_secret**). E2E test default + one fee-head;
  confirm an unseeded college still falls back to env.

## 5. Guarantees preserved
Dual-inquiry verify, amount-in-paise match, HMAC compare, anti-replay, secret encryption at
rest, service-role-only RLS, rotation-safety via the pinned `razorpay_account_id` — all
unchanged, now keyed on (institution × fee-head).

## 6. Open decisions
- **D1 mixed-head:** approved = route-when-single-head-else-default.
- **D2 establishment head:** ✅ DONE 2026-06-13. Added `establishment` to
  `billing_category_kind` (mig 20260613150000) + created "Establishment Fee" category
  `4b60ed7d-32f4-451e-8c12-8b821f4e01d1` (mig 20260613150100); synced TS types. The Dental
  ESTAB MID is now routable. Remaining: tag estab bills with the category (operator data step).
- **D3 seeding inputs:** complete MID list + per-account `key_id`/`key_secret`/`webhook_secret`.
  Needed for Phase 0 + Phase 4 only.

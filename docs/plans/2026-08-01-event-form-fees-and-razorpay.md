# Per-Form Registration Fees + Razorpay for General Events

Date: 2026-08-01 · Status: **IMPLEMENTED** (all 7 phases; migration applied to prod)

## Follow-up: explicit fee toggle (2026-08-01)

`fee_amount > 0` was the only signal a form charged, which overloaded one number
with two meanings — "free" and "nobody has priced it yet" were indistinguishable,
and turning a fee off meant destroying the amount.

Migration `20260801120000_event_form_fee_enabled_toggle.sql` adds
`fee_enabled boolean NOT NULL DEFAULT false`, backfilled `true` wherever
`fee_amount > 0` (none today — the clause is for correctness whenever it runs).

**A fee applies only when `fee_enabled AND fee_amount > 0`.** That rule lives in
exactly one place: `effectiveFee()` in `types/tournament.ts`. Four callers need
it (builder card, list badge, public page, submit route) and a rule copied four
times is a rule that drifts. It takes a loose shape on purpose so the submit
route can pass a raw PostgREST row — numeric arrives as a string, so the
coercion happens inside the helper rather than being assumed of the caller.

Switching the fee OFF writes only `fee_enabled: false`, leaving the amount and
label intact so switching back on restores the price.

## Delivered

| Phase | Files |
|---|---|
| 1 Schema | `supabase/migrations/20260801100000_event_form_registration_fee.sql` (applied), `supabase/setup/01_tables.sql`, `types/tournament.ts` |
| 2 Fee UI | `components/events/registration/registration-fee-card.tsx` (new), `…/registration-forms-panel.tsx`, `lib/services/events/tournament/event-registration-form-service.ts`, `hooks/events/use-tournament-registration-form.ts`, `app/api/events/[eventId]/payment-account-status/route.ts` (new) |
| 3 Public page | `app/p/event/[id]/register/page.tsx` + `_components/event-register-form.tsx` (new) |
| 4 Submit API | `app/api/events/[eventId]/public-register/route.ts` (new) |
| 5 Callback | `app/api/events/[eventId]/payment/callback/route.ts` (new); `components/events/event-razorpay-hosted-redirect.tsx` gained an optional `callbackPath` |
| 6 Copy-link fix | `…/registration-forms-panel.tsx` — routes by `variant` |

Verified: scoped `tsc` 0 errors on every touched file; `eslint` clean (one PRE-EXISTING
`set-state-in-effect` error in registration-forms-panel's selection effect, untouched);
`check:sidebar` 0 errors; `check:reachability` PASS 55/58; CHECK constraint rejects a
negative fee; the D3 warning query fires on exactly the 2 accountless hosts and none of
the 10 that route correctly. NOT browser-tested end-to-end (no authenticated session).

## Confirmed decisions

| # | Decision | Chosen | Consequence |
|---|---|---|---|
| D1 | Fee model | **One flat fee per form** (`fee_amount`, `fee_label`) | 2 columns. `fee_amount = 0` → free, instant confirm, no Razorpay order created. No tiers, no internal/external split. |
| D2 | Fee head | **Reuse `'tuition'`** | Identical to tournaments. Live for 7 institutions today. Zero ops work. |
| D3 | Host institution with no Razorpay account | **Warn in the UI, still allow** | Payment falls back to the common env account (today's behaviour); the builder shows a banner naming the institution so it is never silent. |

## Goal

1. A registration **fee that is set per form** (an event holds many forms; each monthly
   run can charge a different amount).
2. Online payment of that fee, routed to the **host institution's** Razorpay account —
   the same way tournaments already do it.

## 0. What already exists — reuse, do not rebuild

| Capability | Where | State |
|---|---|---|
| Payment initiation | `EventPaymentService.initiatePayment()` | **Already generic.** Takes `institutionIdOverride` + `feeHead`; nothing tournament-specific. |
| Signature + dual-inquiry settlement | `EventPaymentService.verifyAndSettleRazorpayPayment()` | Generic; resolves the provider from the pinned `razorpay_account_id` (rotation-safe). |
| Host-institution routing | `resolveRazorpayCredentials()`: pinned account → (institution, feeHead) → institution default → env fallback | Live. **9 active accounts.** |
| Webhook handling | `WEBHOOK_MODULES.events` in `webhook-module-registry.ts` | Already declares `event_payment_transactions` + `onCaptured` → marks registration paid. **Works automatically.** |
| Late-auth backstop | `/api/cron/razorpay-late-auth` | Covers `event_payment_transactions` (verified in source). |
| Hosted-checkout launcher | `components/events/event-razorpay-hosted-redirect.tsx` | Events-generic already. |
| Transactions table | `event_payment_transactions` | 80 rows, 43 paid, since 2026-04-08. |
| Public-route allow-list | `proxy.ts` `PUBLIC_PATH_PREFIXES` contains `/p/` | **No proxy change needed.** |

Reference implementation to mirror: `app/api/events/tournament/[eventId]/public-register/route.ts`
(fee → `EventPaymentService.initiatePayment({ institutionIdOverride: ev.institution_id, feeHead: 'tuition' })`).

## 1. Gaps

| # | Gap | Evidence |
|---|---|---|
| G1 | `event_registration_forms` has **no fee columns** | Live schema: `id, event_id, is_enabled, created_at, updated_at, name, slug, description, display_order`. Tournament fees live on `tournament_divisions.config.entry_fee`; general events have no divisions. |
| G2 | No public submission surface for a general event | `/p/tournament/[id]/register` filters `event_type='sports_tournament'`. Known/documented limit. |
| G3 | No submit API for general events | The tournament one is division/eligibility/roster-locked. |
| G4 | No payment callback route for general events | Tournament has `/api/events/tournament/[eventId]/payment/callback`. |
| G5 | **Live bug:** Copy Link always builds a tournament URL | `registration-forms-panel.tsx:71`. Dead link on every non-tournament event today. |
| G6 | Two host institutions have no Razorpay account | "Jicate Solutions" + "JKKN Main Office" host general events; neither has an active `tuition` account → silent env fallback. |

## 2. Phases

### Phase 1 — Schema: per-form fee
Migration `supabase/migrations/20260801100000_event_form_registration_fee.sql`:

```sql
-- D1: one flat fee per form. D2: fee head is fixed at 'tuition' in code
-- (same as tournaments), so NO fee_head column — adding one would invite
-- per-form MID drift with no MIDs to point it at.
ALTER TABLE public.event_registration_forms
  ADD COLUMN IF NOT EXISTS fee_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_label  text;

ALTER TABLE public.event_registration_forms
  ADD CONSTRAINT event_registration_forms_fee_amount_check CHECK (fee_amount >= 0);
```

`DEFAULT 0` makes all 8 existing forms free — no behaviour change on apply.

- Mirror into `supabase/setup/01_tables.sql`; register in `types/supabase.ts`;
  extend `EventRegistrationForm` in `types/tournament.ts`.
- **RLS: unchanged.** Every policy on this table gates on `event_id`, still present.
- **Do NOT touch `save_event_registration_form`.** The fee is form metadata, written via
  `updateForm` (a plain UPDATE), not the sections/fields RPC — this avoids the
  `DROP FUNCTION` discards-grants trap that bit the multi-form migration.

### Phase 2 — Fee in the builder UI
- Widen `EventRegistrationFormService.updateForm()` to accept `fee_amount` / `fee_label`.
- Fee card in the form editor; fee badge on each row in `registration-forms-panel`.
- **D3 warning:** when `fee_amount > 0` and the host institution has no active `tuition`
  account, show a banner naming the institution.

  Verified: `razorpay_accounts` grants privileges to `postgres` and `service_role` **only** —
  `authenticated` and `anon` have none. So the browser cannot read it and something server-side
  is required. Two options were considered:

  - ~~A new `SECURITY DEFINER` RPC~~ — rejected. A DEFINER function callable by `authenticated`
    must self-authorize (a known trap in this repo), and it permanently widens the DB surface
    of the credential vault for what is only a UI hint.
  - **Chosen: a thin authenticated API route** `GET /api/events/[eventId]/payment-account-status`,
    wrapped in `withAuth`, using the service-role client to return **`{ hasAccount: boolean, institutionName: string }`
    and nothing else**. No key material, no MID, no account id crosses the boundary. No migration,
    no new grants, and it disappears cleanly if the warning is ever dropped.

### Phase 3 — Public registration page
New `app/p/event/[id]/register/page.tsx` + `_components/register-form.tsx`.
- Service-role server load of event + form resolved by `?form=<slug>`, using the SAME rules
  as the tournament page: slug → that form; no slug → first OPEN form; closed form →
  "Registration closed" (not an empty form).
- Renders dynamic fields with the existing `DynamicFieldInput`.
- Hybrid identity: logged-in learner auto-links; guest supplies name/phone/email.
- Fee shown before submit; launches `EventRazorpayHostedRedirect` on the returned order.

### Phase 4 — Submit API
New `app/api/events/[eventId]/public-register/route.ts`.
- Guards: event exists; status not draft/cancelled; registration window open; **form belongs
  to this event** (never trust the posted `form_id`); form is open.
- Validates custom fields **by `form_id`**, never `event_id`.
- Capacity check against `events.max_registrations`.
- Inserts `events_registrations` with `form_id`, `payment_amount = form.fee_amount`,
  `payment_status = fee > 0 ? 'pending' : 'not_required'`.
- Fee > 0 → `EventPaymentService.initiatePayment({ institutionIdOverride: event.institution_id,
  feeHead: form.fee_head ?? 'tuition', callbackUrl, returnUrl })`.

### Phase 5 — Payment callback
New `app/api/events/[eventId]/payment/callback/route.ts` — mirrors the tournament callback
(signature + dual inquiry, idempotent, malformed-return_url fallback), with `/p/event/${eventId}` fallbacks.

### Phase 6 — Fix G5
`registration-forms-panel.tsx`: route the copy-link by `event_type` — tournaments keep
`/p/tournament/...`, everything else gets `/p/event/...`.

### Phase 7 — Verification
- Diagnostics + `eslint` on every touched file.
- Live test on a **Dental-hosted** event (Dental has an active `tuition` account):
  register → pay → assert `event_payment_transactions.razorpay_account_id` equals Dental's
  account id, **not** null/env.
- Confirm the webhook or the late-auth cron finalizes if the browser never returns.

## 3. Non-goals
- No change to tournament / marathon payment paths.
- No refunds for general-event registrations.
- No new Razorpay MIDs (ops task, needs HDFC).
- No change to `save_event_registration_form`.

## 4. Risks

| Risk | Mitigation |
|---|---|
| Host institution has no account → money lands in the group env account | Phase 2 warning (decision Q3) |
| Per-MID webhooks configured for only 3 of 8 accounts | Callback settles synchronously; late-auth cron is the backstop and does cover this table |
| Only 4 of 80 existing event txns are account-pinned | Expected — `institutionIdOverride` is recent; new rows will pin |
| A closed form still accepting money | Submit API rejects `is_enabled = false` before creating any order |

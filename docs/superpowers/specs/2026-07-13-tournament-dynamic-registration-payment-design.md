# Tournament Dynamic Registration Form + Razorpay Payment Integration — Design Spec

**Date:** 2026-07-13
**Status:** Approved by product owner (brainstorming session)
**Scope:** `events/tournament` module only. Marathon (sibling event type) is explicitly untouched — its registration/checkout lives in an external app.

## 1. Summary

Today, tournament registration (`/p/tournament/[id]/register`) is a single hardcoded form shared
by every tournament, and — despite a fully-built Razorpay order-creation + webhook-settlement
backend already shared with the marathon module — **online payment never actually completes**:
`initiatePayment()` always returns `payment_url: ''` on the Razorpay path, and every caller only
checks `if (payment_url)`, so no checkout ever launches. This spec:

1. Fixes the broken Razorpay checkout launch (hosted-redirect pattern, mirroring billing).
2. Routes tournament payments through the host institution's **`tuition` fee-head** Razorpay
   account (existing institution-wise vault, currently unused by tournaments — `feeHead` is never
   passed today).
3. Adds a **per-tournament dynamic registration form builder** (sections + typed fields +
   conditional visibility), modeled on Admission's existing form-builder engine, layered on top of
   the existing fixed core fields (division, entry/team name, roster, contact info).
4. Splits registration into two audiences: an **outside/guest-only public form**, and a **new
   in-app registration page for MyJKKN users** that auto-fills from their profile — with an
   explicit choice screen at the public URL routing each audience to the right place.
5. Adds a **per-tournament QR code** encoding the public gate URL.
6. Adds an explicit **host-institution picker** at tournament creation (replacing today's silent
   derivation from the creator's institution switcher) and a missing **division entry-fee editor**
   (currently read in three places, written nowhere).
7. Adds a **Payments tab** on the tournament management page for organizer-facing collection
   status (per-tournament, since a tournament has exactly one host institution).

## 2. Decisions log (from brainstorming)

| # | Decision |
|---|----------|
| 1 | Tournament payments resolve via `getPaymentProvider('events', { institutionId, feeHead: 'tuition', purpose: 'create-order' })` — the institution's **tuition** fee-head Razorpay account specifically, not a new dedicated fee head. |
| 2 | Dynamic form builder is the **full** Admission-style engine (sections, typed fields incl. `select`/`multi_select`/`file`/`date`/etc., required flags, conditional visibility, reorder) — not a lightweight toggle-only version. |
| 3 | Checkout launch uses the **hosted-redirect** pattern (mirrors `components/billing/razorpay-hosted-redirect.tsx`), not a checkout.js modal — consistent with the rest of the app. |
| 4 | Host-institution picker is shown to **everyone** creating a tournament (not just multi-institution/super-admin users) — explicit required field, replacing silent derivation. |
| 5 | Payment stats live as a **new "Payments" tab inside the tournament module** (per-tournament operational view), **not** an extension of the Billing Analytics dashboard. |
| 6 | New tables are scoped at the **event level** (`event_registration_forms/_sections/_fields`, keyed by `event_id`), not tournament-only and not merged into Admission's live tables — reusable by marathon later without another migration, but the admin/public UI is built for tournament only in this scope. |
| 7 | Custom fields apply **per-tournament**, identical across all of that tournament's divisions — not per-division. |
| 8 | The public `/p/tournament/[id]/register` page is **outside/guest users only**. MyJKKN users must **not** register through the guest form — they get an explicit choice screen ("Are you a MyJKKN student/staff?") that routes Yes → login (if needed) → a new in-app registration page; No → today's guest form, unchanged in spirit but now also carrying the tournament's custom fields. |
| 9 | The in-app registration page is a **new route** (`app/(routes)/events/tournament/[id]/register/page.tsx`), not a conditional render inside the public route — keeps the two audiences' code paths and access models separate. |
| 10 | QR code encodes the **public gate URL** (`/p/tournament/[id]/register`), not a direct link to the guest form — one QR works for both audiences since the gate does the routing. Shown as a downloadable PNG on the tournament management page, generated with the `qrcode` package already used by IMS UPI QR. |

## 3. Current-state gaps this design closes

Found during codebase research (see file:line references throughout §5):

- `EventPaymentService.initiatePayment()` (`lib/services/events/core/event-payment-service.ts`)
  always returns `payment_url: ''` on the Razorpay branch — meant to hand `razorpay_order_id` /
  `razorpay_key_id` / `amount_paise` to a hosted-checkout redirect component that was never built
  for events (only billing has one). Every caller (`register-form.tsx`, `add-entry-dialog.tsx`,
  the "Generate payment link" button) checks `if (payment_url)`, which is never truthy — a paid
  entry is created and just sits at `payment_status: 'pending'` forever, while the public form
  still shows a misleading "Your payment is confirmed" message.
- `app/api/events/tournament/[eventId]/payment/callback/route.ts` still calls the decommissioned
  `HDFCEventClient.verifyPaymentStatus()` — dead code path, never ported to Razorpay verification.
- No UI writes `tournament_divisions.config.entry_fee`, even though it's read in three places
  (`add-entry-dialog.tsx:57`, `register-form.tsx`, `public-register/route.ts:133`). Today the only
  way to make a division paid is a direct DB edit.
- Tournament payment calls omit `feeHead`, so they always resolve the institution's *default*
  Razorpay account, never a specifically-chosen fee head.
- Tournament creation derives `institution_id` silently from `useUserInstitutionAccess()`, with no
  explicit picker.
- The registration form (`register-form.tsx`) is 100% hardcoded — no per-tournament field
  configuration exists anywhere.
- The public register page does a best-effort session check purely to pre-fill fields, but does
  not gate MyJKKN users away from the guest form.
- Dead HDFC branch (`event-payment-service.ts` ~lines 186–259) is unreachable given
  `getActiveProviderName` throws on anything but `'razorpay'` — removed as part of this work.

## 4. Data model

### 4.1 New table: `event_registration_forms`

One row per event (tournament, for now).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `event_id` | uuid FK → `events` UNIQUE | one form per event |
| `is_enabled` | boolean | default `true`; auto-created (empty) when a tournament is created |
| `created_at`, `updated_at` | | |

### 4.2 New table: `event_registration_form_sections`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `form_id` | uuid FK → `event_registration_forms` | ON DELETE CASCADE |
| `title` | text | |
| `display_order` | int | |
| `created_at`, `updated_at` | | |

### 4.3 New table: `event_registration_form_fields`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `section_id` | uuid FK → `event_registration_form_sections` | ON DELETE CASCADE |
| `field_key` | text | stable key used in submitted `custom_fields` JSON |
| `field_label` | text | |
| `field_type` | text | `text \| number \| phone \| email \| select \| multi_select \| date \| textarea \| file \| checkbox \| radio` — same union as Admission's `FormFieldType` |
| `is_required` | boolean | |
| `display_order` | int | |
| `placeholder`, `help_text` | text NULL | |
| `min_length`, `max_length`, `min_value`, `max_value`, `pattern` | NULL | validation constraints, mirrors Admission |
| `options` | jsonb NULL | `{value, label}[]` for select/multi_select/radio |
| `condition` | jsonb NULL | conditional visibility, mirrors Admission's `FormFieldCondition` |
| `created_at`, `updated_at` | | |

### 4.4 `events_registrations` — new column

| Column | Type | Notes |
|---|---|---|
| `custom_fields` | jsonb NULL | submitted answers keyed by `field_key`; validated server-side against `event_registration_form_fields.is_required` before insert |

### 4.5 `tournament_divisions` — no schema change, UI-only gap

`config.entry_fee` (numeric, already in the JSONB shape read today) gets a write path for the
first time via the create/edit division forms.

## 5. Architecture & flows

### 5.1 Tournament creation — host institution picker

`app/(routes)/events/tournament/new/page.tsx` gets an explicit required "Host Institution"
`<Select>` as the first field, sourced from `useInstitutionsWithAccess()` (same source used
elsewhere in the app), replacing the current silent
`selectedInstitutionId || profile?.institution_id` derivation. This becomes the tournament's
`institution_id` — the value used for Razorpay account resolution and for RLS/permission scoping,
unchanged from today's semantics.

### 5.2 Division entry-fee editor

Both `new/page.tsx`'s division-creation fields and `edit-tournament-dialog.tsx`'s `DivisionFields`
get a currency (₹) input alongside sport/level/format/category/age-band. Optional — 0/omitted
means a free division, matching today's default behavior for existing rows.

### 5.3 Registration Form builder (admin, tournament management page)

New **"Registration Form" tab** on `app/(routes)/events/tournament/[id]/page.tsx`, gated by the
existing `sports.tournaments.manage` permission (or per-event in-charge access via
`organizer-access.ts`) — no new permission keys.

- Section list: add / remove / reorder.
- Field list per section: add / remove / reorder; edit type, label, required, placeholder,
  help text, options (for select/multi_select/radio), and conditional visibility.
- Live preview pane renders the same field components the public/in-app forms use.
- New `EventRegistrationFormService` (modeled directly on `lib/services/admission/form-builder-service.ts`)
  provides CRUD + `reorderSections` / `reorderFields`, backed by §4.1–4.3.
- A form row is auto-created (empty, `is_enabled: true`) when a tournament is created, so the tab
  always has something to edit.

### 5.4 Public gate, guest form, and in-app registration

Three surfaces:

1. **`/p/tournament/[id]/register`** (the gate, rewritten) — landing choice screen: "Are you a
   MyJKKN student/staff?"
   - **Yes** → if no session, redirect to `/auth/login?redirect=/events/tournament/[id]/register`;
     if already signed in, redirect straight to the in-app page.
   - **No** → render today's guest form in place: existing fixed fields (division, entry/team
     name, external toggle, roster, contact info) **plus** the tournament's custom sections/fields
     from §5.3, rendered underneath.
2. **`app/(routes)/events/tournament/[id]/register/page.tsx`** (new, authenticated) — same fixed +
   custom field form, but pre-filled and locked from the logged-in profile (`profiles.full_name`,
   `learners_profiles.gender/dob`, `institution_id`, `learner_id`) instead of asking the user to
   retype them. Also linked directly from the tournament's in-app details page, so MyJKKN users
   never need to touch the `/p/` URL at all.
3. Both surfaces submit to the **same** server-side route (renamed from `public-register` to
   `entries/register` since it's no longer guest-only), so eligibility checks, division-fee
   lookup, custom-field validation, and payment initiation live in one place, not duplicated
   across two routes. Required custom fields are validated server-side, not just client-side.

### 5.5 QR code

A **"Share" section** on the tournament management page renders a QR (via the `qrcode` package,
already used by `lib/services/ims/payment-service.ts` for UPI QR) encoding the gate URL
`/p/tournament/[id]/register`, downloadable as PNG, with the raw URL shown as text underneath.

### 5.6 Payment checkout completion

The actual fix for "payment gateway doesn't work today":

1. `EventPaymentService.initiatePayment()` passes `feeHead: 'tuition'` for divisions with
   `entry_fee > 0`, reusing the existing `resolveRazorpayCredentials` chain (pinned account →
   institution+`tuition` head → institution default → env fallback) — just adding the parameter
   that's currently omitted.
2. New `EventRazorpayHostedRedirect` component (mirrors `components/billing/razorpay-hosted-redirect.tsx`)
   — auto-submitting hidden form POSTing to Razorpay's hosted checkout endpoint with
   `razorpay_order_id` / `razorpay_key_id` / `amount_paise` / `customer` prefill, which
   `initiatePayment()` already returns today. Both the guest form and the in-app registration page
   render this whenever `razorpay_order_id` is present, replacing the current dead
   `if (payment_url)` checks in `register-form.tsx`, `add-entry-dialog.tsx`, and the organizer's
   "Generate payment link" button.
3. `app/api/events/tournament/[eventId]/payment/callback/route.ts` is rewritten to verify
   Razorpay's HMAC signature + dual inquiry (mirroring `/api/billing/payment/callback`) instead of
   calling the dead `HDFCEventClient.verifyPaymentStatus()`. The existing webhook
   (`dispatchRazorpayWebhook` in `lib/services/payments/razorpay/webhook-handlers.ts`) already
   correctly settles `event_payment_transactions` + `events_registrations.payment_status` on
   `payment.captured` — no changes needed there.
4. The misleading "Your payment is confirmed" message (shown immediately on `setDone(true)`
   regardless of actual payment) is corrected to reflect real, verified status — pending until the
   callback/webhook confirms it.
5. Dead HDFC branch and `HDFCEventClient` import removed from `event-payment-service.ts`.

Refunds on withdrawal continue to use the existing gateway-refund path
(`getPaymentProvider('events', { institutionId })` in the entry `DELETE` route) — unchanged by
this work except that a refund for a tuition-fee-head payment must resolve the same account it was
paid into (already handled by `resolveRazorpayCredentials`'s pinned-`accountId` path when a refund
references the original transaction).

### 5.7 Payments tab

New **"Payments" tab** on the tournament management page: totals collected / pending / refunded
for that tournament, broken down by division, with a per-entry list (registrant, division,
amount, status, method, timestamp) and the existing `markPaid()` / `useMarkEntryPaid` action for
offline collection — surfaced as a dedicated view instead of being buried in the entries table.
Since a tournament has exactly one host institution, this tab is inherently institution-scoped;
no cross-institution rollup is in scope (Billing Analytics extension was explicitly declined).

## 6. Permissions & RLS

- No new permission keys. Registration Form builder tab and Payments tab both reuse
  `sports.tournaments.manage` / per-event in-charge access, matching every other tab on this page.
- The three new `event_registration_form_*` tables get RLS scoped by the event's `institution_id`
  via the existing `role_has_institution_access(...)` + `user_has_permission('sports.tournaments.manage')`
  pattern already used for `tournament_divisions` / `tournament_entries`.
- The in-app registration route (`.../tournament/[id]/register`) requires only an authenticated
  session (any MyJKKN user, no special permission) — consistent with "any student/staff can
  register for a tournament," matching today's implicit behavior for signed-in users on the public
  form.

## 7. Backward compatibility & rollout

- Existing tournaments with no custom fields configured show only the fixed core form (empty
  sections list). For tournaments created **before** this migration (no `event_registration_forms`
  row at all), the row is lazily created on first read (both the builder tab and the public/in-app
  forms treat a missing row as "empty form, no custom fields" and create it on demand) — no bulk
  backfill migration needed.
- Existing divisions default `entry_fee` to 0 (free) until an organizer sets one via the new
  editor — no behavior change for tournaments that stay free.
- Marathon module: **untouched**. Its registration/payment continues to live in the external
  marathon app; the new `event_registration_form_*` tables are shaped to be reusable by marathon
  later, but no marathon UI or route changes are in scope here.

## 8. Explicitly out of scope

- Per-division custom fields (only per-tournament, per decision #7).
- A dedicated/new Razorpay fee-head for events (uses `tuition`, per decision #1).
- Extending the Billing Analytics dashboard with a tournament/events filter (per decision #5).
- Checkout.js modal UX (hosted-redirect only, per decision #3).
- Any change to marathon's registration or payment flow.

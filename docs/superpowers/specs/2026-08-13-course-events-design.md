# Course Events — Design Spec

**Date:** 2026-08-13
**Status:** Approved (design). Implementation plan pending.
**Module:** `courses` — standalone, top-level.

---

## 1. What this is

A standalone module for **paid learning courses** conducted by an institution, sold to
both MyJKKN people (learners, staff) and to **external participants who have no
institution**. A course runs on a multi-session schedule, books real venues through
the existing Resource Management module, sells one or more priced packages
(≈ ₹2.5 lakh), collects the money in installments through Razorpay, and only lets a
participant attend once they have paid in full.

External participants are issued a **MyJKKN ID** and a real login so they can see
their course, their bills, and pay their installments.

### Success criteria

1. An admin can create a course, define packages with installment schedules, schedule
   sessions, and hold a venue for each session.
2. A person with no JKKN affiliation can find the public course page, apply, be
   approved, receive a MyJKKN ID, log in, and pay ₹2.5 lakh across 4 installments.
3. A MyJKKN learner can do the same without their regular fee ledger being touched.
4. Money is never double-credited, and totals always reconcile.
5. An unpaid participant cannot be marked present or receive a certificate.
6. Next year's edition is one clone action away.

---

## 2. Decisions

Each of these was chosen deliberately; the rejected alternative is recorded because
the reason matters more than the choice.

| # | Decision | Rejected alternative & why |
|---|---|---|
| D1 | **Standalone `/courses` module** with its own tables | An `event_type='course'` variant would have inherited venue holds, form builder, recurrence and committees for free. Rejected in favour of clean domain separation. Accepted costs: re-implement the form builder, and lose `fn_event_approved_cascade_reservations`. |
| D2 | **Own `course_bills` / `course_bill_payments` tables** | `billing_student_bills.student_id` is a `NOT NULL` FK to `learners_profiles`. Shadow-learner rows would leak external people into learner lists, admission analytics and cohort rollups. Making billing polymorphic would force a re-audit of every billing RLS policy, RPC and report. |
| D3 | **MyJKKN ID = real login identity**, issued from the **existing `jkkn_identities` register** (format `348295-7`) | A reference-number-only ID cannot show payment history. **Amended 2026-08-13** — the original decision minted a new `profiles.myjkkn_id` sequence; a dormant permanent-identity register already owns this concept. See §8.2. |
| D4 | **Admin-defined installment schedule** per package | Flexible part-payment against one bill gives no intermediate due dates, so no meaningful overdue tracking. |
| D5 | **Multiple packages per course** | A single price on the course row would need a table split + live-data migration the first time an Early Bird tier is wanted. |
| D6 | **Screening gate before billing** | Auto-enrolling on form submit would provision an auth identity, a login and a ₹2.5 lakh bill for every abandoned form. |
| D7 | **Hard gate on full payment** | Attendance and certificate both require `balance = 0`. The payment page stays open in every state. |
| D8 | **All course bills in `course_bills`**, for internal and external alike | Splitting internal learners into `billing_student_bills` means two payment flows, two overdue engines and two receipt formats to keep in sync. `billing_student_bills` is untouched by this module. |
| D9 | **Host institution's existing `tuition` Razorpay account** | A new `course` fee head would block every payment until each institution's new MID is onboarded. |
| D10 | **Withdrawal voids future bills, flags refund, settles offline** | A full refund approval workflow is deferred to v2. |

---

## 3. Data model

Eleven new tables. All carry `institution_id` for `BaseService` scoping and RLS.
All money columns are `numeric(12,2)`.

> **The DDL below is illustrative shorthand, not literal SQL.** `CHECK IN (...)` is
> written for readability and expands to `CHECK (col IN (...))`; `→` denotes a foreign
> key. The migration must write real syntax.

### 3.1 Course & pricing

```sql
course_events (
  id, institution_id NOT NULL, title, slug, code, description,
  mode text CHECK IN ('offline','online','hybrid'),
  status text NOT NULL DEFAULT 'draft'
    CHECK IN ('draft','published','completed','cancelled'),
  start_date date, end_date date,
  application_opens_at timestamptz, application_closes_at timestamptz,
  total_seats int, venue_text text, cover_image_url text,
  year int, edition_number int,
  previous_course_event_id uuid REFERENCES course_events(id),
  created_by, created_at, updated_at,
  UNIQUE (institution_id, slug)
)
```

`published` means the course is live. Whether applications are *accepted* is decided
solely by the `application_opens_at` / `application_closes_at` window — there is no
separate "closed" status, because two independent switches controlling one behaviour is
how intake states drift out of sync.

```sql
course_packages (
  id, course_event_id NOT NULL → course_events ON DELETE CASCADE,
  institution_id NOT NULL,
  name, description,
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  currency text NOT NULL DEFAULT 'INR',
  seat_cap int,                      -- NULL = unlimited
  sale_opens_at timestamptz, sale_closes_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  display_order int,
  UNIQUE (course_event_id, name)
)

course_package_installments (
  id, package_id NOT NULL → course_packages ON DELETE CASCADE,
  installment_no smallint NOT NULL CHECK (installment_no >= 1),
  label text,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  due_date date NOT NULL,
  UNIQUE (package_id, installment_no)
)
```

**Integrity rule I1 — the installments must sum to the package total.**
Enforced by a `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` on both
`course_packages` and `course_package_installments`, so a multi-row edit can transit
an inconsistent state inside a transaction but never commit one. A package whose
parts don't add up to ₹2.5 lakh is the most damaging thing that could silently ship.

Due dates are **absolute**, matching a cohort course where everyone pays by the same
date. Enrollment-relative offsets are explicitly out of scope (§10).

### 3.2 Schedule & venue

```sql
course_sessions (
  id, course_event_id NOT NULL → course_events ON DELETE CASCADE,
  institution_id NOT NULL,
  session_no int, title text,
  session_date date NOT NULL,
  start_time time NOT NULL, end_time time NOT NULL CHECK (end_time > start_time),
  trainer_profile_id uuid → profiles,   -- internal trainer
  trainer_name text,                    -- external trainer, free text
  venue_resource_id uuid → resources,
  venue_text text,
  reservation_id uuid → resource_reservations,
  is_cancelled boolean NOT NULL DEFAULT false
)
```

Each session holds **its own** reservation. A 6-month weekend bootcamp books only the
Saturdays it uses, instead of blocking a hall for six months.

**Change to an existing shared table:**

```sql
ALTER TABLE resource_reservations
  ADD COLUMN course_session_id uuid REFERENCES course_sessions(id) ON DELETE SET NULL;

ALTER TABLE resource_reservations
  DROP CONSTRAINT resource_reservations_event_or_session_check;

ALTER TABLE resource_reservations
  ADD CONSTRAINT resource_reservations_single_owner_check
  CHECK (num_nonnulls(event_id, session_id, course_session_id) <= 1);
```

This is a FK to a **different** table than the existing `event_id`/`session_id` links,
so it does not trip the "second FK to the same table breaks every PostgREST embed"
failure this repo has hit before.

> **INCOMPLETE — amended 2026-08-17 during Phase 2c.** The paragraph above is true
> about the *reservations* side: `event_id`, `session_id` and `course_session_id`
> point at three different tables, so none of them is ambiguous. What it missed is
> the **reverse edge**. `course_sessions.reservation_id` → `resource_reservations`
> AND `resource_reservations.course_session_id` → `course_sessions` means the two
> tables now reference **each other**, so a bare embed between them is ambiguous in
> the other direction. Verified live against PostgREST:
>
> ```
> GET /course_sessions?select=id,reservation:resource_reservations(id,status)
> PGRST201 — two relationships found:
>   resource_reservations_course_session_id_fkey  (one-to-many)
>   course_sessions_reservation_id_fkey           (many-to-one)
> ```
>
> **Every embed between these two tables must name its constraint**, e.g.
> `reservation:resource_reservations!course_sessions_reservation_id_fkey(...)`.
> With the name supplied the same request resolves and fails only at `42501`
> (anon is revoked, as intended) — proving it is the relationship, not the grant,
> that the bare form trips on. Phases 5 and 6 embed these tables too.

### 3.3 Registration forms

Mirrors the Events form builder, **after** its bug fix:

```sql
course_registration_forms (
  id, course_event_id NOT NULL, institution_id NOT NULL,
  name, slug, description, display_order,
  is_enabled boolean NOT NULL DEFAULT false,
  UNIQUE (course_event_id, slug),
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
)

course_registration_form_sections (
  id, form_id NOT NULL → course_registration_forms ON DELETE CASCADE,
  title, description, display_order
)

course_registration_form_fields (
  id,
  form_id   NOT NULL → course_registration_forms ON DELETE CASCADE,
  section_id         → course_registration_form_sections ON DELETE CASCADE,
  field_key, label, field_type, is_required,
  options jsonb, placeholder, help_text, validation jsonb, display_order,
  UNIQUE (form_id, field_key)
)
```

**Fields carry `form_id` directly from day one.** The Events module originally hung
fields off sections only, while three call sites filtered them by `event_id`; the
moment a second form existed it silently rendered every other form's fields. Do not
repeat that.

**No fee lives on a form.** In courses the price is on the *package*, chosen at
application time. Two fee sources feeding one payment was explicitly rejected in the
Events module as a genuine hazard.

Many named forms per course, addressed publicly by `?form=<slug>`.

### 3.4 Participation

```sql
course_applications (
  id, course_event_id NOT NULL, institution_id NOT NULL,
  form_id → course_registration_forms ON DELETE SET NULL,
  package_id → course_packages,
  applicant_type text NOT NULL CHECK IN ('learner','staff','external'),
  profile_id uuid → profiles,
  learner_id uuid → learners_profiles,
  external_participant_id uuid → event_external_participants,
  applicant_name NOT NULL, applicant_email, applicant_phone NOT NULL,
  custom_fields jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK IN ('pending','shortlisted','approved','rejected','withdrawn'),
  decided_by, decided_at, decision_note,

  -- identity anchor must match the declared type
  CHECK (
    (applicant_type = 'learner'  AND learner_id IS NOT NULL) OR
    (applicant_type = 'staff'    AND profile_id IS NOT NULL) OR
    (applicant_type = 'external' AND external_participant_id IS NOT NULL)
  )
)

course_enrollments (
  id, course_event_id NOT NULL, institution_id NOT NULL,
  application_id uuid UNIQUE → course_applications,   -- NULL for admin-created
  package_id NOT NULL → course_packages,
  participant_type text NOT NULL CHECK IN ('learner','staff','external'),
  profile_id uuid NOT NULL → profiles,        -- see note below
  learner_id uuid → learners_profiles,
  external_participant_id uuid → event_external_participants,
  enrollment_number text UNIQUE,
  status text NOT NULL DEFAULT 'active'
    CHECK IN ('active','confirmed','payment_overdue','withdrawn','completed','cancelled'),
  total_payable NOT NULL, total_paid NOT NULL DEFAULT 0, balance NOT NULL,
  refundable_amount NOT NULL DEFAULT 0,
  refund_status text CHECK (refund_status IS NULL
                            OR refund_status IN ('pending_offline','recorded')),
  withdrawn_at, withdrawal_reason, enrolled_at NOT NULL DEFAULT now(),

  CHECK (
    (participant_type = 'learner'  AND learner_id IS NOT NULL) OR
    (participant_type = 'staff'    AND learner_id IS NULL
                                   AND external_participant_id IS NULL) OR
    (participant_type = 'external' AND external_participant_id IS NOT NULL)
  ),
  UNIQUE (course_event_id, profile_id)
)
```

Three notes on the enrollment shape:

- **`profile_id` is `NOT NULL`.** Identity provisioning (§5) runs *before* the
  enrollment insert, in the same transaction — so by the time a row exists, the
  participant always has a profile. This makes `UNIQUE (course_event_id, profile_id)`
  actually enforce "one enrollment per person per course"; with a nullable column,
  Postgres treats every NULL as distinct and the constraint would enforce nothing.
- **A `staff` participant has neither a `learner_id` nor an `external_participant_id`** —
  only a profile. The CHECK is written per `participant_type` rather than as a blanket
  `num_nonnulls(...) >= 1`, which would have rejected every staff enrollment.
- **No denormalised `myjkkn_id` copy.** It is one join to `profiles`, and a cached copy
  is a drift risk for no real gain.

`total_payable` is a **snapshot** of `course_packages.total_amount` taken at enrollment.
Repricing a package later must never silently re-price people already enrolled.

**`event_external_participants` is reused, not duplicated.** It already upserts by
phone and already carries `linked_profile_id`, which is exactly the MyJKKN-ID bridge.
A course-specific person table would mean the same human who ran the marathon and took
the course exists as two unlinked rows. This is a deliberate, named dependency from
`courses` onto an `event_*` table.

### 3.5 Money

```sql
course_bills (
  id, enrollment_id NOT NULL → course_enrollments ON DELETE RESTRICT,
  course_event_id NOT NULL, institution_id NOT NULL,
  bill_number text NOT NULL UNIQUE,
  installment_no smallint NOT NULL, label text,
  total_amount NOT NULL,
  paid_amount NOT NULL DEFAULT 0,
  balance_amount NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK IN ('pending','partially_paid','paid','overdue','voided'),
  voided_at, void_reason,
  UNIQUE (enrollment_id, installment_no)
)

course_bill_payments (
  id, bill_id NOT NULL → course_bills ON DELETE RESTRICT,
  enrollment_id NOT NULL, institution_id NOT NULL,
  receipt_number text UNIQUE,
  amount_paid NOT NULL CHECK (amount_paid > 0),
  payment_mode text NOT NULL CHECK IN ('razorpay','cash','neft','cheque','dd'),
  payment_date date NOT NULL,
  razorpay_order_id, razorpay_payment_id, razorpay_signature,
  razorpay_account_id uuid → razorpay_accounts,
  transaction_ref text UNIQUE,
  gateway_response jsonb,
  status text NOT NULL DEFAULT 'initiated'
    CHECK IN ('initiated','success','failed','refunded'),
  captured_at timestamptz,
  recorded_by uuid → profiles       -- required for offline modes
)

CREATE UNIQUE INDEX course_bill_payments_rzp_payment_uniq
  ON course_bill_payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;
```

A single installment **is** part-payable: many payment rows may allocate against one
bill, which is what `partially_paid` expresses.

---

## 4. Money flow — where numbers get written

**Integrity rule I2 — balances are derived by trigger, never by application code.**

```
INSERT/UPDATE course_bill_payments  (status → 'success')
        │
        ├─ trigger: recompute course_bills.paid_amount, balance_amount, status
        │
        └─ trigger: recompute course_enrollments.total_paid, balance
                    then derive course_enrollments.status:
                        balance = 0                  → confirmed
                        any unpaid bill past due     → payment_overdue
                        otherwise                    → active
```

**Voided bills are excluded from every derived total.** A withdrawal voids the unpaid
future installments (§6); if the recompute still counted them, the enrollment would sit
at a permanent non-zero balance and could never leave `payment_overdue`.

`withdrawn`, `cancelled` and `completed` are **terminal** — the recompute updates the
money columns but does not overwrite a terminal status.

**Why this shape.** Razorpay settles through two paths — the browser callback and the
server webhook — and both fire for the same payment. If application code incremented a
balance, a slow callback racing a webhook would double-credit. Deriving in a trigger,
plus the partial unique index on `razorpay_payment_id`, makes a duplicate settlement a
no-op rather than a ₹62,500 gift.

**Enrollment status is a pure function of balances and due dates.** It is never
hand-set. This repo has repeatedly been bitten by hand-maintained status allow-lists
drifting out of sync with the real lifecycle; a derived status cannot drift.

### 4.1 Payment initiation

1. Participant clicks Pay on bill *N* in `/my-courses`.
2. `POST /api/courses/bills/[billId]/pay`, wrapped in `withAuth`, validates the bill
   belongs to the caller's enrollment and is neither voided nor already paid.
3. Insert `course_bill_payments` with `status='initiated'`.
4. Resolve the gateway via the existing `getPaymentProvider()` with
   `institutionIdOverride = course.institution_id` and `feeHead = 'tuition'`.
5. Hosted checkout → callback route verifies the signature and marks `success`.
6. The **webhook is authoritative**; the callback is best-effort. Both idempotent.

**Known gap, accepted:** 7 institutions have a live `tuition` MID. *Jicate Solutions*
and *JKKN Main Office* do not — a course hosted at either falls back to the common env
account. Warn in the UI rather than block, matching how event fees already behave.

### 4.2 Offline payments

Staff holding `courses.billing.manage` may record cash / NEFT / cheque / DD payments.
A ₹2.5 lakh corporate payment frequently arrives by NEFT; a Razorpay-only module would
be unusable for those.

---

## 5. Identity — minting a MyJKKN ID

Triggered by **application approval**, executed server-side with the service-role
client, **in the same transaction as the enrollment insert** and before it — the
enrollment's `profile_id` is `NOT NULL` (§3.4).

1. Upsert `event_external_participants` by phone.
2. Look for an existing `profiles` row by email or phone — **reuse it**; never mint a
   second identity for the same human.
3. Otherwise create a Supabase auth user, then a `profiles` row with
   **`id = auth.uid()`** (non-negotiable in this codebase), `institution_id = NULL`,
   `is_external_participant = true`.
4. Call the **existing** issuer:
   `fn_issue_jkkn_id('external_participant', NULL, NULL, <profile_id>)` → `348295-7`.
5. Set `event_external_participants.linked_profile_id`.
6. Assign the **Course Participant** role — a real `custom_roles` row whose
   `permissions` JSONB grants exactly one key: `courses.participant.self`.
7. Send JKKN ID + magic login link by email / WhatsApp.

The course module **does not mint identifiers**. It calls `fn_issue_jkkn_id` and stores
nothing but the FK. Duplicate-person detection before issuing uses the existing
`fn_check_duplicate_person(...)`; lookup by ID uses `fn_resolve_person(...)`.

> **Authorisation:** `fn_issue_jkkn_id` is gated on `is_super_admin() OR is_admin() OR
> user_has_permission('users.jkkn_id.issue')`. The course approval path runs
> server-side; grant `users.jkkn_id.issue` to the roles holding
> `courses.applications.decide`, rather than widening the function's own gate.

Login is passwordless OTP. Landing page is `/my-courses`.

### 5.1 Containment — the highest risk in this design

The risk is `institution_id = NULL` on a profile that can log in. This app has a
documented antipattern where `institutionId || ''` coerces a missing institution into a
real-looking parameter, and several places branch on institution scope to decide
visibility. **A NULL-institution profile with a session is a shape this codebase has
never had.** Three independent containments, because one is not enough:

1. **`profiles.is_external_participant boolean NOT NULL DEFAULT false`** — a hard
   discriminator. Never infer external status from a NULL institution.
2. **Portal isolation** — `app/(portal)/my-courses/` has its own layout that never
   mounts the main sidebar, and `proxy.ts` redirects these users away from
   `/(routes)/*`.
3. **RLS** — on every course table, participants may read only rows reachable from an
   enrollment where `profile_id = auth.uid()`.

---

## 6. Enforcement, withdrawal, repeat

**Gate (D7).** `confirmed` — i.e. `balance = 0` — is required to check in, be marked
present, or receive a certificate.

| Enrollment state | Attend | Certificate | Pay page |
|---|---|---|---|
| `confirmed` (balance = 0) | yes | yes | n/a |
| `active` (balance > 0, nothing overdue) | yes | no | open |
| `payment_overdue` | no | no | **open** |
| `completed` | n/a | yes | closed |
| `withdrawn` / `cancelled` | no | no | closed |

A daily cron flips bills past `due_date` with `balance > 0` to `overdue`, flips the
enrollment to `payment_overdue`, and sends reminders.

> **Cron gotcha:** a Vercel cron path does **not** interpolate `${ENV_VAR}`. A
> `?secret=` in the path must be a literal or moved to a header.

**Withdrawal.** Sets `withdrawn`, voids unpaid future bills so they stop accruing
overdue, records `refundable_amount` and `refund_status='pending_offline'`. Finance
settles outside the app and marks it `recorded`.

**Yearly repeat.** `fn_clone_course_event(p_course_event_id, p_title, p_slug, p_year)`
copies the course, its packages, installment templates, forms, sections, fields and an
optional session skeleton shifted by one year — in one transaction — and sets
`previous_course_event_id`.

> The clone starts `draft` with **every form `is_enabled = false`**. Copying must never
> silently open a second live intake on a running course. This mirrors the Events clone
> RPC, which learned the rule the hard way.

> **`DROP FUNCTION` discards the function's ACL.** If any RPC here is ever dropped and
> recreated, EXECUTE reverts to PUBLIC (including `anon`). Re-apply REVOKE/GRANT in the
> same migration.

---

## 7. Access control, routes, layers

### 7.1 Permission keys — `courses.*`

`view`, `create`, `edit`, `delete`, `packages.manage`, `forms.manage`,
`applications.view`, `applications.decide`, `enrollments.manage`, `sessions.manage`,
`billing.view`, `billing.manage`, `attendance.mark`, `certificates.issue`,
`participant.self`.

**Declaring a key in `lib/constants/permissions.ts` does nothing on its own.** The same
migration must grant them into `custom_roles.permissions` JSONB
(`jsonb || jsonb_build_object(...)`), or every page renders empty. Category `key` must
be unique within `PERMISSION_CATEGORIES`.

RLS gates on `user_has_permission('courses.…')` **AND**
`role_has_institution_access(institution_id)`. No role names in SQL. Participant access
is an **additive** policy, not a widened admin policy.

**The delete policy is deliberately tighter than every other policy.** Every other course
policy bypasses on `is_super_admin() OR is_admin()`; `course_events_delete` bypasses on
`is_super_admin()` **only**, so a generic admin cannot cascade-delete a course without
explicitly holding `courses.delete`. This mirrors `events.delete`, whose catalogue entry
records the same reasoning: *"Seeded to NO role — super admins pass via
user_has_permission()'s bypass, everyone else is granted here from Role Management. The
DELETE it unlocks cascades through 43 child tables … so it is deliberately not bundled."*
A course delete cascades packages, installments, sessions, forms, applications,
enrollments and bills. The asymmetry is the safeguard — do not "fix" it for consistency.

### 7.2 Routes

```
/courses                      admin catalog
/courses/new
/courses/[id]                 console: overview | packages | sessions | forms
                                       | applications | enrollments | billing
/my-courses                   participant portal (learners, staff, external)
/course/[slug]                PUBLIC course landing + package tiers
/course/[slug]/apply          PUBLIC application form (?form=<slug>)
/api/courses/*                authenticated, withAuth-wrapped
/api/public/courses/*         service-role: apply, package list, phone lookup
```

**`proxy.ts` must gain `'/course/'` and `'/api/public/courses/'` in
`PUBLIC_PATH_PREFIXES`** — otherwise applicants are 302'd to `/auth/login` before the
route handler ever runs.

> **CORRECTED 2026-08-17 — the public prefix was `'/learn/'` and that was an auth
> hole, not a naming preference.** `app/(routes)/learn/` is the **authenticated**
> Foundation learning module: 16 routes, including `/learn/profile`,
> `/learn/profile/badges`, `/learn/leaderboard`, `/learn/channels`, `/learn/quests`,
> `/learn/assess/[id]/results` and `/learn/certificate/[id]`. `isPublicPath` matches
> with `path.startsWith(prefix)` (`proxy.ts:210-212`), so a single `'/learn/'` entry
> would have made every one of them reachable with no session — a learner's profile,
> badges and assessment results included. This is the mirror image of the incidents
> already recorded in `proxy.ts` against `'/verify/'` and `'/r/'`: those were public
> pages nobody allow-listed; this would have been an allow-list entry that swallowed
> authenticated pages. (`app/(routes)/pde/learn/` also exists but sits under `/pde/`,
> so it was never in range.)
>
> **The replacement is deliberately singular.** `/course/` is the public page;
> `/courses` stays the admin catalog. They differ by ONE character, and the only
> reason the prefix is safe is that `'/courses/123'.startsWith('/course/')` is
> `false` — the `s` lands where the `/` is expected. Say that in the `proxy.ts`
> comment when the entry is added, or a later reader will "tidy" it to `'/course'`
> and silently unauthenticate the entire admin module.

Public submission goes through service-role API routes, not anon RLS. `REVOKE ... FROM
anon` on all course tables (revoke from `anon`, not `PUBLIC`).

Public routes need their own `<Toaster>`; they do not inherit the authenticated shell's.

### 7.3 Layers

Standard house pattern, no deviations:

```
app/(routes)/courses/…        page, 'use client', calls a hook
  └─ hooks/courses/use-*.ts   React Query; keys in lib/query/query-keys.ts
       └─ lib/services/courses/*-service.ts   static class extends BaseService
            └─ Supabase; RLS enforces row access
```

Services: `course-event`, `course-package`, `course-session`, `course-form`,
`course-application`, `course-enrollment`, `course-billing`, `course-payment`,
`course-identity`, `course-clone`.

`types/courses.ts` for domain types; **all eleven tables must be registered in
`types/supabase.ts`** or `.from('course_events')` fails typecheck with a TS2769
cascade.

---

## 8. Changes to existing objects

### 8.1 `resource_reservations`
Add `course_session_id`; replace the two-way mutual-exclusion CHECK with a three-way
`num_nonnulls(...) <= 1`. See §3.2. This is the only place this module reaches into
live shared infrastructure that other modules depend on.

### 8.2 Identity — extend `jkkn_identities` (AMENDED 2026-08-13)

**What changed and why.** The original D3 minted `profiles.myjkkn_id` as
`JKKN-2026-000123` from a new sequence. Review of the migration history found
`20260817040000_jkkn_permanent_identity_schema.sql` + `…050000_jkkn_identity_rpcs.sql`
already ship a complete permanent-identity register — live in schema, deliberately
**dormant** (tables empty; `fn_issue_jkkn_id` gated on a permission no role holds).
Its stated design is *"ONE shared pool… a learner who comes back years later as a
Senior Learner keeps the same number."* Minting a second identifier would be exactly
the fragmentation that register exists to prevent.

The course module therefore **issues from the existing register**. Three changes:

```sql
-- 1. a third person kind
ALTER TABLE public.jkkn_identities DROP CONSTRAINT jkkn_identities_person_kind_chk;
ALTER TABLE public.jkkn_identities ADD  CONSTRAINT jkkn_identities_person_kind_chk
  CHECK (person_kind IN ('learner','team_member','both','external_participant'));

-- 2. a link column for a person who is neither a learner nor staff
ALTER TABLE public.jkkn_identities
  ADD COLUMN profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX ux_jkkn_identities_profile
  ON public.jkkn_identities (profile_id) WHERE profile_id IS NOT NULL;

-- 3. widen the link-shape CHECK — the first three clauses are preserved verbatim
ALTER TABLE public.jkkn_identities DROP CONSTRAINT jkkn_identities_link_shape_chk;
ALTER TABLE public.jkkn_identities ADD  CONSTRAINT jkkn_identities_link_shape_chk CHECK (
     (person_kind = 'learner'              AND team_member_id     IS NULL)
  OR (person_kind = 'team_member'          AND learner_profile_id IS NULL)
  OR (person_kind = 'both')
  OR (person_kind = 'external_participant' AND learner_profile_id IS NULL
                                           AND team_member_id     IS NULL)
);
```

`profile_id` is deliberately left unconstrained for the other three kinds, so an
external participant who **later enrols as a learner keeps the same row and the same
number** — `person_kind` moves to `learner`, `learner_profile_id` is filled, and the
`profile_id` link survives. That is the register's whole purpose.

**Widening the issuer is a DROP, not a CREATE OR REPLACE.**

```sql
DROP FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid);
CREATE OR REPLACE FUNCTION public.fn_issue_jkkn_id(
  p_person_kind text, p_learner_profile_id uuid DEFAULT NULL,
  p_team_member_id uuid DEFAULT NULL, p_profile_id uuid DEFAULT NULL
) ...
REVOKE EXECUTE ON FUNCTION public.fn_issue_jkkn_id(text,uuid,uuid,uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_issue_jkkn_id(text,uuid,uuid,uuid) TO authenticated;
```

Two traps, both real:
1. **Adding a defaulted 4th parameter without dropping the 3-arg version creates an
   overload, not a replacement.** A 3-argument call would then match both and fail with
   `42725 ambiguous function call`. The old signature must be dropped.
2. **`DROP FUNCTION` discards the ACL.** EXECUTE reverts to PUBLIC (including `anon`).
   The REVOKE/GRANT must be re-applied in the same migration.

The issuer's new validation: `external_participant` requires `p_profile_id`, which must
exist in `profiles`; the other kinds must not carry one. The "already holds a number"
lookup extends to match on `profile_id`.

### 8.2a `profiles."NameId"` — superseded, left in place

A sweep on 2026-08-13 found **zero** references:

| Surface | References |
|---|---|
| `pg_proc` function bodies | 0 |
| RLS policies (`polqual` / `polwithcheck`) | 0 |
| Indexes | 0 |
| Views / matviews | 0 |
| Application code | 0 (only `types/saml.ts`, which is the unrelated SAML protocol `NameID`) |
| `types/supabase.ts` | 0 — the column was added to the DB but never regenerated into types |

Data: 1 populated row out of 7,250, holding the throwaway value `student@jkkn.ac.in`.

**This column is now superseded by §8.2 and is NOT touched by this module.** It holds no
data anyone depends on and nothing reads it. Dropping it is the right cleanup, but it is
a decision about a column the user created deliberately, so it is deferred to an
explicit follow-up rather than folded into a course migration.

> **Method note.** The sweep above proved the *column* is unreferenced — and that was
> true. It did not prove the *concept* was unbuilt, which is why the `jkkn_identities`
> register was missed on the first pass. A reference sweep answers "is this column
> used?", never "does this capability already exist?".

### 8.3 `profiles.is_external_participant`
New `boolean NOT NULL DEFAULT false`. See §5.1.

---

## 9. Risks and repo-specific traps

| Risk | Mitigation |
|---|---|
| Package installments don't sum to the total | Deferred constraint trigger (I1) |
| Razorpay callback + webhook double-credit | Derived balances (I2) + partial unique index on `razorpay_payment_id` |
| NULL-institution profile leaks into admin scope | `is_external_participant` discriminator + portal isolation + additive RLS (§5.1) |
| Public pages 302 to login | Register `'/course/'` + `'/api/public/courses/'` in `proxy.ts` (§7.2) |
| A public prefix that swallows authenticated routes | `isPublicPath` is `startsWith`. Never allow-list `'/learn/'` (16 live authenticated routes) and never shorten `'/course/'` to `'/course'` (§7.2) |
| Permission keys declared but not granted → empty pages | Grant into `custom_roles.permissions` in the same migration |
| Supabase errors are plain objects, not `Error` | Use `getErrorMessage()`; never `err instanceof Error` |
| Fire-and-forget mutations hide RLS denials | Always destructure and check `{ error }`; try/catch does not catch them |
| `!inner` joins silently drop rows | Left joins unless exclusion is intended |
| `institutionId \|\| ''` matches zero rows | Use `??` |
| Nullable UUID form fields defaulting to `''` → `22P02` | Normalise `'' → null` before insert |
| PostgREST returns `numeric` as a **string** | `Number()` every amount at the read boundary; `"0.00"` is truthy |
| `DROP FUNCTION` discards grants | Re-apply REVOKE/GRANT in the same migration (§8.2) |
| Defaulted 4th arg on `fn_issue_jkkn_id` creates an overload → `42725` | Drop the 3-arg signature first (§8.2) |
| A second identifier fragmenting person identity | Issue from `jkkn_identities`; the course module mints nothing (§8.2) |
| Vercel cron `?secret=${VAR}` not interpolated | Literal or header |
| Build gates | `check:sidebar`, `check:reachability`, `check:audit-coverage` all fail the build if the module isn't wired into nav and the permissions audit |

**Verification.** There is no test suite in this repo. "Done" means: touched files pass
`mcp__ide__getDiagnostics`, the `check:*` gates pass, and the flow is exercised in a
browser **as a non-super-admin role** — most failures here are silent (empty tables,
dropped rows, 302s), not thrown errors.

---

## 9a. Carry-forward constraints from Phase 1 (READ BEFORE PHASES 2-6)

These are not suggestions. Each is a property Phase 1's schema depends on, discovered
during implementation or review, that a later phase can silently break.

**Phase 2 — `institution_id` must stay NOT NULL on every course table.**
`role_has_institution_access()`'s FIRST branch is
`IF check_institution_id IS NULL THEN RETURN true`. A nullable institution column
anywhere in this module would make those rows readable by **every** authenticated user.
All 11 tables declare it NOT NULL today; adding a "global" course later must not relax
that.

> **A NULL `institution_id` grants NOTHING to a user.** Verified 2026-08-13. Two distinct
> things share that shape and must never be conflated:
>
> - **The ROW's institution** — the branch above. Guarded by NOT NULL on all 11 tables.
> - **The USER's institution** — irrelevant to privilege. `is_super_admin()` reads the
>   explicit boolean `profiles.is_super_admin`, never an absent institution:
>   `SELECT COALESCE((SELECT is_super_admin FROM profiles WHERE id = auth.uid()), false)`.
>
> Live proof the distinction already carries weight: **17 profiles have a NULL
> `institution_id`; exactly 1 is a super admin.** The other 16 receive no bypass. This is
> precisely why an external course participant — who also has `institution_id = NULL` —
> is safe, and why §5.1 uses `is_external_participant` as a hard discriminator rather
> than inferring anything from the absent institution.
>
> **Do not add "institution_id IS NULL" as a privilege test anywhere in this module**, in
> SQL or in React. It would silently promote every external participant to the access
> level of a super admin.

**Phase 2 — the super-admin bypass belongs on admin policies, NOT on participant policies.**
Verified 2026-08-13: every `_select` / `_manage` / `_insert` / `_update` / `_delete`
policy across the 11 tables carries `(SELECT public.is_super_admin())`. The four
`*_participant_select` policies deliberately do NOT, and must not gain one. Multiple
PERMISSIVE policies on one command are OR'd, so a super admin already passes via the
table's main policy — adding the arm would be dead code, and worse, it would blur a
policy whose entire job is "this person is enrolled here" into something a later reader
could mistake for a general read policy and widen.

**Phase 3 — an external applicant cannot read their own pending application.**
The self-clause keys on `profile_id`, which is NULL until approval mints the identity.
Correct for Phase 1 (public apply goes through a service-role route), but the applicant
status page must be designed around it — a token, or a service-role read.

**Phase 4 — generate ALL installment bills at enrollment, in one transaction.**
`fn_course_recompute_balances()` derives the enrollment balance from the bills that
**exist**, not from `total_payable`. Lazy generation would let someone reach
`balance = 0` → `confirmed` after paying only the first installment, and attend a course
they have part-paid. If lazy generation is ever needed, change the rollup to compare
against `total_payable` first.

**Phase 5 — the payment service must NEVER reassign `course_bill_payments.bill_id`.**
The trigger resolves its target via `COALESCE(NEW.bill_id, OLD.bill_id)` and reads
`v_enrollment_id` from the *bill*, so a reassignment recomputes only the new bill and
strands both the old bill AND — if the bills belong to different enrollments — the old
enrollment. Insert and status-update only. If moving a payment between bills becomes a
requirement, the trigger needs a guard first.

**Phase 5 — probe the `SECURITY DEFINER` fix from a real browser session.**
Every probe in Phase 1 ran through MCP, which is a database superuser but **not** an app
super-admin (`is_super_admin()` reads `profiles` via `auth.uid()`, which MCP lacks). So
RLS never engaged and no authorization behaviour was observed. The specific unverified
claim: that `fn_course_recompute_balances` now completes its cross-table UPDATE for an
actor holding `courses.billing.manage` but NOT `courses.enrollments.manage`. Correct by
construction; unproven by observation. The failure mode is silent — paid-in-full
participants stuck off `confirmed`.

**Phase 6 — the overdue cron is required, not optional.**
A bill's status only recomputes when a payment event fires on that bill. A bill crossing
its due date with no payment activity will never flip to `overdue` on its own.
`idx_course_bills_overdue` exists to serve that sweep.

**Known, accepted, and deliberately not fixed in Phase 1:**

- `jkkn_identities.profile_id` is `ON DELETE SET NULL` and absent from
  `link_shape_chk`, so deleting the profile orphans the identity row — it keeps burning
  its number while the "one number for life" lookup keys on `profile_id`, so the same
  person returning is minted a **second** number. Spec-faithful (§8.2 specified SET NULL)
  but the consequence is real; the table is empty, so it is still free to change.
- `courses.participant.self` is declared but referenced by **zero** policies. Participant
  access is purely identity-based (`profile_id = auth.uid()`). Revoking the Course
  Participant role therefore revokes no data access. Phase 5 must not assume otherwise.
- Policy naming is inconsistent three ways across the module
  (`course_registration_forms_*`, `course_reg_sections_*`, `course_package_installments_*`).
  Cosmetic — policy names need only per-table uniqueness.
- Pre-existing and OUT OF SCOPE: `courses`, `course_mappings` and
  `course_competency_mapping` grant ALL — including DELETE and TRUNCATE — to `anon` via
  Supabase's default privileges. Inert today because RLS is enabled and RLS-with-no-
  matching-policy is default-deny. Deserves its own ticket.

---

## 10. Out of scope for v1

- Automated refunds (v1 flags and settles offline — D10)
- Enrollment-relative installment due dates (absolute only — §3.1)
- Parallel batches of one course
- Certificate template designer (issue/withhold logic only)
- Waitlists when a package's `seat_cap` is reached
- Course marketplace / cross-institution discovery

---

## 11. Build order

**This spec is deliberately larger than one implementation plan.** Eleven tables across
seven phases should not be planned as a single unit — each phase gets its own plan,
written and confirmed just before it is built, so that later phases can absorb what
earlier ones actually taught us. Phase 1 is the exception in importance: it fixes the
schema every other phase depends on, so it is planned in the most detail.

| Phase | Delivers |
|---|---|
| 1 | Migrations: 11 tables, RLS, permission keys **+ role grants**, `jkkn_identities` extension + widened issuer, `profiles.is_external_participant`, `resource_reservations` change, `types/supabase.ts` |
| 2 | Admin CRUD: courses, packages + installment templates, sessions + venue hold |
| 3 | Registration form builder + public landing / apply pages + `proxy.ts` |
| 4 | Applications screening → approval → enrollment + MyJKKN ID provisioning + bill generation |
| 5 | Payments: Razorpay, participant portal, offline entry, settlement triggers, webhook |
| 6 | Enforcement: overdue cron, attendance, certificate gate, withdrawal |
| 7 | Yearly clone RPC + analytics |

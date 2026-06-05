# Hostel Fees → Campus Living, Year-Aware Billing — Design

**Date:** 2026-06-05
**Status:** Approved (design); pending implementation plan
**Modules touched:** Admission CRM, Billing, Campus Living, Learners Profiles
**Related specs:** `2026-05-05-admission-fee-structure-automation-design.md`, `2026-06-01-fee-structure-bulk-create-edit-design.md`, `2026-05-29-campus-living-residents-learners-advanced-datatable-design.md`

---

## 1. Problem & Goal

Today, when a learner is enquired and fills the admission/enquiry form, a fee structure is resolved from the **admission** fee-structure module. The business wants:

1. **Admission owns academic fees only.** Hostel (and mess) fees must move out of admission and live solely in the **Campus Living** module, which already has the *Admission Package* and *Fee Config* modules.
2. **Year-aware academic fees.** First year / first semester learners are billed application + university fees (+ that year's tuition); subsequent years are billed tuition only. Exam-type fees recur every year.
3. **Hostel fees keyed by hostel year.** A package is matched by the learner's *fixed* admission year; the fee amount for that package is stored per *rolling* hostel year. A learner accumulates one hostel-year billing cycle per year of stay.
4. **Per-term (per-hostel-year) bill de-duplication.** Once a package/category bill is generated for a learner in a hostel year, the same bill must not be generated again for that hostel year; a warning is shown before generation; ad-hoc "additional" bills remain allowed.
5. **Manual, verified, bulk generation for existing residents.** For continuing (year 2+) residents, the operator views each resident's resolved fee detail for the selected hostel year, then verifies and bulk-generates.

### Success criteria

- A day scholar receives **academic bills only** (no hostel/mess line items anywhere).
- A hosteller receives **academic bills + hostel/mess bills**, all stamped with the active `hostel_year_id`, all visible and generatable from the Campus Living resident view.
- Re-running generation for the same `(student, hostel_year, fee category)` is blocked with a warning; ad-hoc bills bypass it.
- Tuition / application / university amounts are configured in **exactly one place** (admission), never duplicated per accommodation type.
- "Which residents have bills for hostel-year X?" is answerable by an indexed query.

---

## 2. Current-State Findings (grounded in code + live DB)

These findings (verified via CodeGraph + Supabase MCP) reframe the work — much of the config layer already exists; the gap is scoping, year-awareness, generation, and visibility.

### Admission fee resolution
- Fee resolution **already ignores accommodation type.** Match is 7-dimensional: institution / degree / department / programme / quota / community / `admission_year_id` (+ optional gender). `accommodation_type_id` is selected but never filtered, and `types/admission.ts` comments it as *"hostel fees moved to campus-living… ignored by resolution."*
- Resolution has **two parallel implementations that must stay in sync**: the TS `FeeStructureService.findByDimensions` (preview) and the SQL RPC `admission_resolve_fee_items_for_lead` (persist, writes `learners_profiles.fee_items`).
- Tables: `admission_fee_structures` (matrix header), `admission_fee_structure_items` (`fee_structure_id`, `billing_category_id`, `amount`, `is_optional`, `sort_order` — **no period/year column**), `admission_fee_structure_communities` (community junction).
- Fee heads live in the **shared** `billing_categories` table (`kind` enum: `application_fee`, `tuition`, `hostel`, `transport`, `exam`, `library`, `university_fee`, `other`; all rows currently `frequency='one-time'`). Tuition is modelled as six rows: `1 Year Tuition Fee` … `6 Year Tuition Fee`. There is **no year/semester applicability flag**.
- **Leftover bug:** `learners/.../incomplete-fee-banner.tsx` (`getMissingFeeDimensions`, `FEE_DIM_ORDER`) still lists `accommodation_type_id` as a *required* fee dimension, wrongly blocking learners that have no accommodation set.

### Campus Living (already exists)
- `hostel_years` — first-class, rolls yearly (`start_date`, `end_date`, `is_current`, `is_active`). Distinct from `admission_years`.
- `admission_packages` — institution-scoped; keyed by `admission_year_id` + degree/department/programme/quota/gender + `room_category_id → hostel_categories` (required) + `mess_category_id → mess_categories` (optional) + `package_type`. Eligibility side-tables: `admission_package_communities`, `admission_package_program_eligibility`. Package row carries **no fee**.
- `hostel_fees` — polymorphic, keyed by `hostel_year_id` (NOT NULL): category fees (`hostel_category_id` **or** `mess_category_id`) **or** a flat **package fee** (`package_id`, unique per `(package, year)` via `uq_hf_package`). **No `institution_id`** (fees treated as common across institutions — a multi-tenant mismatch vs institution-scoped packages).
- `learner_package_assignment` — `(learner_id → profiles(id), package_id, hostel_year_id, chosen_mess_category_id, assigned_at)`. The only learner↔package↔hostel-year link today; **admin-only writable** (RLS retrofit incomplete).
- Resident listing: `app/(routes)/campus-living/residents/` reads view `v_learner_hostelites` (= `learners_profiles` filtered to `accommodation_types.code='hostel'`, LEFT JOIN active `hostel_allocations`, derives `year_of_study` via a 3-tier fallback: admission-year → batch → enquiry).
- A second occupancy/pro-rata engine exists (`hostel-fee-compute-service.ts`) that interprets `hostel_fees.amount` as a *per-bed* rate — out of scope here, but must not be conflated with the flat fee model.

### Billing
- `billing_student_bills` — one row per fee item: `student_id → learners_profiles`, `institution_id`, `item_category_id → billing_categories`, `bill_description`, `due_date` (hardcoded `now()+30d`), amounts, `status`, `superseded_by_bill_id`. **No `academic_year`, `semester`, `term`, `accommodation`, `admission_year`, `hostel_year`, or `package` column. No unique constraint for dedup.**
- Bills are generated at the **admission → account ("onboarding")** transition (NOT on enquiry): RPC `admission_account_transition_with_bills` → resolves fees → inserts bills **only if the learner has zero bills** (all-or-nothing guard, no per-category/per-term idempotency).
- Bulk generation already exists: `/billing/onboarding` → `useBulkGenerateBills` → `OnboardingService.createBillsFromProfile` (TS mirror of the RPC loop; reads `learner.fee_items`; eligibility `bills.length===0 && lifecycle_status==='account'`). Its "preview" shows already-generated bills, not a dry-run.
- No `terms` / `billing_terms` table. The only term-range-shaped fields are `billing_invoices.billing_period_from/to`.
- Lifecycle gating: `BILLABLE_LIFECYCLE_STATUSES = ['account','reserved','admitted','active']`.

### Learners profiles
- `admission_year_id` (FK `admission_years`, fixed per learner) **exists**. The legacy integer `admission_year` is retired.
- **No `hostel_year` column** on the profile; hostel year lives on `learner_package_assignment.hostel_year_id`.
- **No `package_id` / `fee_structure_id`** on the profile. Fee state = denormalized numeric columns + `fee_items` jsonb + `legacy_fee_mode` / `fees_confirmed` flags.
- Hosteller vs day-scholar = `accommodation_type_id → accommodation_types.code='hostel'` (single source; `user_is_hosteler()` SECURITY DEFINER function).
- `year_of_study` is **derived, not stored** (only in `v_learner_hostelites`).
- **Gotcha:** `learner_package_assignment.learner_id → profiles(id)`, not `learners_profiles(id)` (they are intended to be equal per the identity-reconciliation invariant; confirm before relying on it).

---

## 3. Locked Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | How a learner carries hostel year | **Derive current + tag each bill.** Keep `admission_year_id` on the profile (finds the package). Resolve the active hostel year from `hostel_years.is_current` at generation time. Stamp the resolved `hostel_year_id` onto each generated bill. No stale per-row hostel year. |
| D2 | Year/semester fee applicability | **Per-item applicability flag** on `admission_fee_structure_items`. Reuse the existing 1–6 Year Tuition categories; flag application/university as first-year-only; exam as every-year. |
| D3 | "Term" for dedup | **Hostel-year level.** Dedup key = `(student, hostel_year, fee category)`. Ad-hoc/additional bills allowed. |
| D4 | Where hostel bill generation lives | **Campus Living module** (new resident generation surface). Admission/billing-onboarding keeps day-scholar + academic generation. |
| D5 | Fee routing by accommodation | **Shared academic + hostel add-on.** Admission owns ALL academic fees for everyone (with D2 applicability) and `kind='hostel'` is removed from admission. Campus-living package = hostel + mess only. A hosteller's complete bill = admission academic + campus-living hostel/mess, shown/generated combined in the Campus Living resident view. Tuition configured in exactly one place. |
| D6 | Bill-ledger context | **Add columns to `billing_student_bills`** (not a separate ledger table). Partial unique index enforces dedup. |
| D7 | Day-scholar continuing-year academic billing | **Phase 4** (the same per-year applicability also enables bulk-generating day scholars' year-2+ tuition from `/billing/onboarding`). |
| D8 | Package fee preference | When both a flat package fee and category fees exist for `(package, hostel_year)`, **prefer the flat package fee**, fall back to summed category fees. |
| D9 | Legacy cleanup | **Yes** — migration deletes `kind='hostel'` items from admission structures, **with a dry-run report first**. |

---

## 4. Architecture

```
                     ┌──────────────────────────────────────────┐
   ALL learners ───► │ ADMISSION  (academic fees)               │
                     │  admission_fee_structures + items         │
                     │  matched by admission_year_id (FIXED)     │
                     │  + NEW applies_to / applies_year_of_study  │
                     │  − hostel-kind items removed              │
                     └──────────────────────────────────────────┘
                                       │ resolves → learners_profiles.fee_items
                                       ▼
   HOSTELLERS  ───►  ┌──────────────────────────────────────────┐
   (accommodation_   │ CAMPUS LIVING  (hostel + mess fees)      │
    types.code=      │  admission_packages → hostel_fees        │
    'hostel')        │  matched by hostel_year_id (ROLLS yearly)│
                     │  NEW HostelFeeResolutionService + RPC     │
                     └──────────────────────────────────────────┘
                                       │
                                       ▼
                     ┌──────────────────────────────────────────┐
                     │ billing_student_bills  (combined ledger)  │
                     │  + hostel_year_id, package_id,            │
                     │    fee_source, applies_year_of_study      │
                     │  + partial-unique dedup index             │
                     └──────────────────────────────────────────┘
```

- **Day scholar** → academic bills only.
- **Hosteller** → academic bills (admission) + hostel/mess bills (campus-living), all stamped with the active `hostel_year_id`, generated/visible from the Campus Living resident view.

---

## 5. Data-Model Changes

### 5.1 `admission_fee_structure_items` — per-year applicability (D2)
- Add `applies_to text NOT NULL DEFAULT 'every_year'` — one of `first_year_only | every_year | specific_year`.
- Add `applies_year_of_study int NULL` — used when `applies_to='specific_year'`.
- Backfill: `application_fee`/`university_fee` items → `first_year_only`; `N Year Tuition Fee` items → `specific_year`, `applies_year_of_study=N`; `exam` → `every_year`.
- Add a CHECK: `applies_to='specific_year'` ⇔ `applies_year_of_study IS NOT NULL`.

### 5.2 `billing_student_bills` — billing-cycle context (D1, D3, D6)
- `hostel_year_id uuid NULL` (FK `hostel_years`).
- `package_id uuid NULL` (FK `admission_packages`).
- `fee_source text NOT NULL DEFAULT 'academic'` — one of `academic | hostel_package | hostel_category | ad_hoc`.
- `applies_year_of_study int NULL` (audit).
- **Dedup indexes (two, because the flat package fee may have a null `item_category_id` and Postgres treats NULLs as distinct in a unique index):**
  - Category bills: `CREATE UNIQUE INDEX ... ON billing_student_bills (student_id, hostel_year_id, item_category_id) WHERE hostel_year_id IS NOT NULL AND fee_source IN ('academic','hostel_category') AND status <> 'cancelled';`
  - Flat package bills: `CREATE UNIQUE INDEX ... ON billing_student_bills (student_id, hostel_year_id, package_id) WHERE hostel_year_id IS NOT NULL AND fee_source = 'hostel_package' AND status <> 'cancelled';`
  - Both academic and hostel items generated within a hosteller's hostel-year run carry the `hostel_year_id`, so the whole combined bill is deduped per hostel year.
  - `fee_source='ad_hoc'` is exempt from both → additional bills always allowed.
- Register all new columns in `types/supabase.ts`.

### 5.3 Remove hostel from admission (D5, D9)
- Migration (after dry-run report): delete `admission_fee_structure_items WHERE billing_category_id IN (SELECT id FROM billing_categories WHERE kind='hostel')`. Transport stays (day-scholar applicable); mess is not in the admission catalog.
- Admission fee-structure form: exclude `kind='hostel'` from the category picker.
- **Do NOT** delete the `billing_categories` rows — campus-living still references them.
- Fix `incomplete-fee-banner.tsx`: drop `accommodation_type_id` from `FEE_DIM_ORDER` / required dimensions.

### 5.4 Permissions / RLS (D4)
- Add (or reuse) a Campus Living permission key for hostel-bill generation, e.g. `campus_living.fees.generate` — declare in `lib/constants/permissions.ts` **and** grant to relevant roles via a `jsonb || jsonb_build_object(...)` migration (reserved keys do nothing without a grant).
- Complete the RLS retrofit on `hostel_years` and `learner_package_assignment` (currently hardcode `role IN ('super_admin','admin')`) → gate on permission keys.
- Bill-generation writes go through a SECURITY DEFINER RPC (so RLS sees the correct identity and the dedup index is the source of truth).

---

## 6. Resolution Logic

### 6.1 Academic (admission) — apply D2
Extend **both** resolution paths (RPC `admission_resolve_fee_items_for_lead` and TS `FeeStructureService.findByDimensions` / `FeeResolutionService`) to filter items by the learner's **derived year-of-study**:
- include item when `applies_to='every_year'`, OR (`first_year_only` AND year_of_study=1), OR (`specific_year` AND `applies_year_of_study=year_of_study`).
- Year-of-study source: `v_learner_hostelites.year_of_study` (operator-overridable at generation; handle null → operator must pick).
- **Enquiry-form preview** matches by *dimensions* and does not know a learner's year-of-study; an enquiry is a *new* admission ⇒ the preview assumes **year-of-study = 1** (shows application + university + 1-year tuition + every-year items). Learner-bound resolution (`admission_resolve_fee_items_for_lead`, continuing students, and all generation) uses the derived/overridden year-of-study.

### 6.2 Hostel (campus-living) — new
New `HostelFeeResolutionService` + SECURITY DEFINER RPC `campus_living_resolve_hostel_fee(p_learner_id, p_hostel_year_id)`:
1. Resolve the learner's **package**: match `admission_packages` by the learner's dims (`admission_year_id` + institution/degree/department/programme/quota/gender/community/room_category/mess_category); an explicit `learner_package_assignment` row overrides the match.
2. Resolve the **fee** for `(package, hostel_year_id)` from `hostel_fees`: prefer the flat **package fee** (`package_id` row, per D8); else sum **category fees** (`hostel_category_id` + `mess_category_id` rows).
3. Return resolved line items with `fee_source` (`hostel_package` or `hostel_category`) + `package_id`.

---

## 7. Generation Flow (Campus Living resident view) — D3, D4

New surface under `app/(routes)/campus-living/residents/` ("Generate Hostel-Year Bills"):
1. Operator selects **hostel year** (default `hostel_years.is_current`).
2. Resident table (hostellers from `v_learner_hostelites`) shows per student: derived **year-of-study**, matched **package**, a **dry-run preview** of proposed items (applicable academic + hostel/mess), and **bill status for that hostel year**: `Not generated | Partially generated | Fully generated`.
3. Operator inspects each student's resolved fee detail (expandable row) and selects students.
4. **Generate** → warning dialog: "X students already have N of these bills (will be skipped); Y new bills will be created." (the warning-before-generate requirement.)
5. Confirm → one **shared, idempotent generation RPC** inserts bills, stamping `hostel_year_id / package_id / fee_source / applies_year_of_study`. The dedup index makes re-runs safe.
6. Separate **"Add additional bill"** action → `fee_source='ad_hoc'` (bypasses dedup).

**Anti-divergence:** route the admission→account RPC path and this new bulk path through one shared generation function so the two bill-loop implementations cannot drift (a current gotcha).

### Layer map (page → hook → service → RPC/RLS)
- Page/components: `app/(routes)/campus-living/residents/` (generation tab + warning dialog + expandable fee detail).
- Hook: `hooks/campus-living/use-hostel-bill-generation.ts` (React Query; invalidate billing + resident keys in `lib/query/query-keys.ts`).
- Service: `lib/services/campus-living/hostel-fee-resolution-service.ts`, `…/hostel-bill-generation-service.ts`.
- RPC: `campus_living_resolve_hostel_fee`, `campus_living_generate_hostel_year_bills` (SECURITY DEFINER).

---

## 8. Edge Cases & Gotchas (to respect)
- `learner_package_assignment.learner_id → profiles(id)` (not `learners_profiles`); confirm id-equality before joining.
- Derived `year_of_study` can be null → operator override required; never silently bill the wrong year.
- Shared `billing_categories` — removing hostel items from admission must not delete categories.
- `hostel_fees` has no `institution_id` while `admission_packages` does — scope generation by the package's institution.
- Repo gotchas: `getErrorMessage()` for Supabase errors; destructure `{ error }` on every mutation; normalize `'' → null` for nullable FKs; avoid `!inner`; `institutionId ?? ''` not `||`; pass `accessibleIds` (don't branch on `isSuperAdmin`); register new columns/tables in `types/supabase.ts`; authenticated routes need no `proxy.ts` change.
- Both resolution paths (RPC + TS) must receive the D2 applicability change together, or preview and saved fees diverge.

---

## 9. Phasing (each independently shippable)
1. **Schema + admission scoping** — applicability flag + backfill; remove `kind='hostel'` items (dry-run → migration); fix `incomplete-fee-banner.tsx`; add bill-ledger columns + dedup index; update `types/supabase.ts`.
2. **Hostel fee resolution** — package matching + `campus_living_resolve_hostel_fee` + `HostelFeeResolutionService`; apply D2 to academic resolution (both paths).
3. **Generation UI** — Campus Living resident generation tab: dry-run preview, year-of-study/package columns, warning dialog, verify-then-bulk-generate via shared RPC; ad-hoc bill action.
4. **Visibility + polish** — per-hostel-year bill-status column; permission key + RLS retrofit; optional day-scholar continuing-year academic bulk generation in `/billing/onboarding`.

---

## 10. Out of Scope
- The occupancy/pro-rata `hostel-fee-compute-service` engine (separate pricing path).
- Mess period billing (`mess_student_billing` / `mess_billing_periods`) beyond a flat mess category fee in a package.
- Payment/receipt/invoice changes (`billing_receipts`, `billing_invoices`) — bills only.
- Refunds, discounts, waivers.

---

## 11. Verification (no automated suite in this repo)
- Touched files pass `mcp__ide__getDiagnostics`.
- `npm run check:menus` / `check:audit-coverage` pass if permission keys or routes change.
- Browser exercise for a **non-super-admin** role: (a) day scholar gets academic-only bills; (b) hosteller gets academic + hostel/mess, stamped with the current hostel year; (c) re-running a hostel year is blocked per category with a warning; (d) ad-hoc bill succeeds; (e) year-2 hosteller's run proposes year-2 tuition (not application/university); (f) resident view shows correct per-hostel-year status.
- Confirm data renders (not just "no error") — many bugs here are silent (empty tables, dropped rows, 302s).

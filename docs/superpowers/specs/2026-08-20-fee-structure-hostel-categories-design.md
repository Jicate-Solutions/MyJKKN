# Hostel Room & Mess Categories on the Admission Fee Structure

- **Date:** 2026-08-20
- **Status:** Approved — ready for implementation
- **Scope:** Admission → Settings → Fees Structure (declaration layer only)

---

## 1. Problem

Room and mess categories for a hostel learner are currently **reverse-engineered
from the total fee amount**, not declared anywhere.

```
admission_fee_structures   ->  fee ITEMS + amounts     (no category anywhere)

learners_profiles.hostel_category_id / mess_category_id come from a
SEPARATE pipeline:

  billing_student_bills INSERT/UPDATE
    -> trg_bill_apply_hostel_fee_categories        (statement trigger)
      -> fn_apply_hostel_fee_categories(learner)
        (1) fn_hostel_learner_room/mess_categories(learner)
              -> fn_learner_admission_year_academic_fee(learner)   -- the AMOUNT
              -> fn_hostel_effective_room/mess_categories(...)
                  -> hostel_program_eligibility  (fee_min..fee_max BANDS)
        (2) no band matched + has a bill  ->  hardcoded 'Classic Room' / 'Classic'
```

This is a lossy round-trip: two differently-tiered packages priced identically
become indistinguishable, and any package priced outside every band silently
becomes Classic.

### Measured impact (2026-08-20, production)

| Metric | Value |
|---|---|
| Hostel fee structures (`accommodation_type_id` = hostel) | 111 |
| Rules in `hostel_program_eligibility` covering them | 12, across 6 institutions |
| Hostel learners (account/reserved/admitted/active) | 820 |
| -> stamped **Classic Room** | 555 (68%) |
| -> stamped **Classic** mess | 505 (62%) |

Four of the six institutions have a single catch-all band
(`0 -> 150000/200000/250000` => Classic Room / Classic) and no tiering at all.
Only Pharmacy and Dental have real tiers.

A dry-run of the band lookup against all 111 hostel structures shows **24
structures with year-1 totals from Rs 1.51 L to Rs 12.21 L match no band at all** —
the highest-value packages in the group are precisely the ones defaulting to
Classic.

## 2. Goal

Make the fee structure the **declared** source of the hostel room and mess
category, since the fee structure already is the package definition and already
carries `accommodation_type_id`.

This spec covers the **declaration layer only**. Wiring the declaration into the
learner-facing resolver is deliberately deferred to a separate, separately
approved change (see section 7).

## 3. Decisions taken

| # | Decision | Choice |
|---|---|---|
| 1 | Relationship to `hostel_program_eligibility` bands | Fee structure is intended to win; band remains as fallback. **Not wired this round.** |
| 2 | Gender partitioning of categories | Store **one FK**; remap by `name` to the learner's gender at read time |
| 3 | Required? | **Required to ACTIVATE** a hostel structure (trigger-enforced) |
| 4 | Enquiry form behaviour | **Display only — writes nothing** |
| 5 | Backfill of the 111 existing hostel structures | **Classic Room / Classic on all 111**; admin corrects by hand |
| 6 | Existing learner records | **Do not touch.** No `learners_profiles` writes, no campus-living changes. |

### On decision 2 — the gender convention

`hostel_categories` and `mess_categories` are gender-partitioned: "Classic Room"
exists twice (`type='boys'` and `type='girls'`), same for mess. Fee structures
normally leave `gender` NULL because they cover both.

So the stored row's `type` is **not semantically meaningful** — it is a canonical
handle. Every read remaps `name` to the learner's gender variant, which is exactly
the pattern `fn_apply_hostel_fee_categories` already uses at step (1):

```sql
JOIN hostel_categories gv ON gv.name = bc.name
                         AND gv.type = v_gender_type
                         AND gv.is_active
```

The admin picker therefore lists **distinct names of active categories that exist
for both genders**. Today that is 6 room options (Classic Room, Deluxe Room,
Deluxe Plus Room, Premium Room, Premium Plus Room, Premium Room + AC) and 2 mess
options (Classic, Premium) — nothing is lost by de-duplicating.

## 4. Design

### 4.1 Schema

```sql
ALTER TABLE admission_fee_structures
  ADD COLUMN hostel_category_id uuid REFERENCES hostel_categories(id) ON DELETE RESTRICT,
  ADD COLUMN mess_category_id   uuid REFERENCES mess_categories(id)   ON DELETE RESTRICT;
```

Nullable at the column level. `ON DELETE RESTRICT` is deliberate: once ~111
structures reference "Classic Room", deleting that category must fail loudly
rather than silently NULL out a hundred packages.

Enforcement is conditional and therefore lives in a trigger, not a CHECK —
"is this hostel?" requires reading `accommodation_types.code`, which a CHECK
constraint cannot reach.

### 4.2 Guard trigger

`trg_fee_structure_hostel_categories_guard` — BEFORE INSERT OR UPDATE:

- accommodation is **not** hostel and either category is non-NULL -> **RAISE**
  (catches mis-configuration rather than silently ignoring it)
- accommodation **is** hostel, `status = 'active'`, and either category is NULL ->
  **RAISE**

Draft and archived hostel structures may leave the categories unset; only
activation requires them.

### 4.3 Backfill

All 236 structures are already `status='active'`, so the backfill must run in the
same migration **before** the trigger is created.

Per decision 5, **all 111 hostel structures are set to `Classic Room` / `Classic`**
(canonical row = lowest `(type, sort_order)` for that name). The admin then
corrects them package by package in the UI.

This is safe because nothing reads the new columns yet — see section 4.5.

### 4.4 Enquiry form — display only

`FeeStructureReadonlyPanel` (`_components/form-sections/_fee/`) already fetches
and holds the matched structure, and `finance-details.tsx` already lifts it via
`onMatchChange`. The categories are therefore rendered **inside that panel**, with
zero new plumbing:

> **Hostel Categories** — Room: Classic Room / Mess: Classic

The same tier is shown on the fee-structure **detail page** as its own
"Hostel Categories" section (hostel structures only). It is deliberately NOT a
column on the list table: only 111 of 236 structures can ever carry a tier, so
the column was structurally blank for more than half the rows.

Category names are dereferenced client-side from `hostel_categories` /
`mess_categories` (both have `SELECT` RLS `qual = true`, so no permission work is
needed), mirroring how the panel already dereferences `billing_category_id`.

`accommodation-preferences.tsx` currently shows a now-inaccurate paragraph:

> "Room and mess categories are assigned automatically when the learner is
> allocated a hostel room — they are no longer picked here."

That text is replaced with an accurate note pointing at the fee structure. **No
form field is added and nothing is written.**

### 4.5 Why this migration is inert

No database object reads `admission_fee_structures.hostel_category_id` or
`mess_category_id` after this change. `fn_apply_hostel_fee_categories`, the bill
statement trigger, `hostel_program_eligibility`, and every campus-living function
are untouched. The blanket-Classic backfill therefore modifies **zero learner
records** and cannot change any billed amount.

## 5. Files

### SQL

| File | Change |
|---|---|
| `supabase/migrations/20260820_fee_structure_hostel_categories.sql` | 2 columns, blanket-Classic backfill, guard trigger + function |
| `supabase/setup/01_tables.sql` | mirror columns |
| `supabase/setup/02_functions.sql` | mirror guard function |
| `supabase/setup/04_triggers.sql` | mirror trigger |

### Types

| File | Change |
|---|---|
| `types/supabase.ts` | register both columns on `admission_fee_structures` (Row/Insert/Update) |
| `types/admission.ts` | `AdmissionFeeStructure`, `CreateAdmissionFeeStructureInput`, `UpdateAdmissionFeeStructureInput` |

### Admission — fee structure module

| File | Change |
|---|---|
| `.../fees-structure/_components/fees-structure-form.tsx` | 2 conditional pickers on both the new and edit schemas/forms; `.refine()` requiring them when hostel + active; clear on accommodation switch |
| `.../fees-structure/[id]/page.tsx` | "Hostel Categories" section (Room + Mess DimCards), hostel structures only, amber hint when unset |
| `.../fees-structure/_components/bulk-fee-structure-dialog.tsx` | 2 new import columns |
| `lib/utils/mappings/fee-structure-excel-mappings.ts` | name -> id resolution for the 2 columns |
| `lib/services/admission/fee-structure-service.ts` | select/insert/update the 2 columns; carry through `cloneToAcademicYear` |

### Enquiries — display only

| File | Change |
|---|---|
| `.../enquiries/_components/form-sections/_fee/fee-structure-readonly-panel.tsx` | render the resolved categories |
| `.../enquiries/_components/form-sections/accommodation-preferences.tsx` | replace stale paragraph; no field, no write |

## 6. Verification

There is no test runner in this repo. "Done" means:

1. `mcp__ide__getDiagnostics` clean on every touched file.
2. SQL assertions inside the migration: all 111 hostel structures non-NULL after
   backfill; guard trigger rejects an active hostel structure with a NULL category;
   guard trigger rejects a non-hostel structure with a category set.
3. A before/after count over `learners_profiles` proving **zero** learner rows changed.
4. Browser: create a Day Scholar structure (no pickers appear), create a Hostel
   structure (pickers appear, activation blocked until both are set), open a
   hostel structure's detail page (Hostel Categories section shows) and a
   day-scholar one (section absent), and confirm the enquiry Finance tab shows
   the categories for a matched hostel structure.
5. `npm run check:menus` is not required — no routes or permission keys change.

## 7. Explicitly out of scope

Deferred to a separate, separately approved change:

- Wiring the declared categories into `fn_apply_hostel_fee_categories` (step 0).
- The mess-category allocation-guard asymmetry. `fn_apply_hostel_fee_categories`
  protects an allocated learner's **room** (`CASE WHEN v_allocated THEN v_cur_room`)
  but **not** their mess (`COALESCE(v_mess, v_cur_mess)`). Logged here as a known
  issue; 296 of 303 Premium-mess learners are allocated and would be exposed to it
  the moment the resolver starts reading the new columns.
- Any `learners_profiles` backfill or re-sync.
- Any campus-living / hostel allocation change.
- Retiring `hostel_program_eligibility` (still read by `fn_explain_allocation`
  and `fn_hostel_allocation_audit`).
- Correcting the 24 unmatched high-value structures' tiers — a business decision,
  surfaced for the admin rather than guessed.

## 8. Post-migration checklist for the admin

All 111 hostel structures start at Classic Room / Classic. The following are known
to need correction, from the band dry-run:

| Structure | Band-implied tier | Year-1 total |
|---|---|---|
| PHARMD - MQ - HOSTEL - 2026 | Deluxe Room / Premium | Rs 5.36 L, Rs 3.36 L |
| PHARMD - GQ - HOSTEL - 2026 | Deluxe Room / Premium | Rs 3.36 L |
| BDS - MQ - HOSTEL - 2026 | Deluxe Room / Premium | Rs 5.61 L |
| BDS - GQ - HOSTEL - 2026 | Classic Room / Premium | Rs 4.36 L |
| BDS - GQ (PMS) - HOSTEL - 2026 | Classic Room / Premium | Rs 4.36 L |
| 24 further structures | no band match | Rs 1.51 L - Rs 12.21 L |

These have **no effect until the resolver is wired** (section 7), but correcting
them now means the follow-up change lands cleanly.

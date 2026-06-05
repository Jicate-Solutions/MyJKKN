# Hostel Fees → Campus Living, Year-Aware Billing — Implementation Plan (Backend Foundation: Phases 1 & 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move hostel/mess fees out of the admission module into Campus Living, make academic fees year-of-study aware, and lay the bill-ledger schema + resolution functions that the hostel-bill generation UI (Phase 3) will build on.

**Architecture:** Admission owns academic fees for *every* learner (now filtered by per-item year-of-study applicability); `kind='hostel'` items are removed from admission. Campus Living owns hostel/mess fees via the existing `admission_packages` + `hostel_fees` tables, keyed by the rolling `hostel_year_id`. `billing_student_bills` gains billing-cycle context columns + partial-unique dedup indexes so a hosteller's combined bill is deduped per `(student, hostel_year, category/package)`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (Postgres + RLS + SECURITY DEFINER RPCs), TanStack Query, `lib/services/*` static service classes extending `BaseService`.

**Source spec:** `docs/superpowers/specs/2026-06-05-hostel-fees-campus-living-billing-design.md`

---

## Repo-specific working rules (read before starting)

- **No test suite exists.** Do NOT write/run `pytest`/`jest`. Verify each task with: (a) SQL assertions via `mcp__supabase__execute_sql`, (b) `mcp__ide__getDiagnostics` on each touched `.ts/.tsx` file, (c) `npm run check:menus` when permission keys/routes change, (d) browser exercise as a non-super-admin. Pure helper functions may get a colocated `*.test.ts` following the existing `__tests__/campus-living/hostel-fee-compute.test.ts` convention.
- **Migrations:** apply via `mcp__supabase__apply_migration` AND commit the real SQL body to `supabase/migrations/YYYYMMDD_name.sql` (never a `SELECT 1;` placeholder). Mirror functions into `supabase/setup/02_functions.sql`. Use timestamped names like `20260605101000_*`.
- **Types:** after any schema change, regenerate `types/supabase.ts` via `mcp__supabase__generate_typescript_types` and paste the result (a table not in the generated `Database` union breaks `.from()` typecheck).
- **Gotchas to honor:** `getErrorMessage()` for Supabase errors; destructure `{ error }` on every mutation; normalize `'' → null` for nullable FKs; never `!inner` unless excluding rows is intended; `x ?? ''` not `x || ''`; both resolution paths (RPC + TS) must change together.
- **Commit after every task** with a scoped message ending in the `Co-Authored-By` trailer used on this branch.

---

## File Structure (Phases 1 & 2)

**Create:**
- `supabase/migrations/20260605101000_fee_item_year_applicability.sql` — applicability columns + backfill on `admission_fee_structure_items`.
- `supabase/migrations/20260605102000_bill_ledger_cycle_context.sql` — `billing_student_bills` columns + dedup indexes.
- `supabase/migrations/20260605103000_remove_hostel_items_from_admission.sql` — delete `kind='hostel'` items (after dry-run).
- `supabase/migrations/20260605104000_fn_learner_year_of_study.sql` — `fn_learner_year_of_study(uuid)` helper.
- `supabase/migrations/20260605105000_academic_resolution_year_aware.sql` — update `admission_resolve_fee_items_for_lead`.
- `supabase/migrations/20260605106000_campus_living_resolve_hostel_fee.sql` — new hostel-fee resolution RPC.
- `lib/services/campus-living/hostel-fee-resolution-service.ts` — TS wrapper over the hostel resolution RPC.
- `hooks/campus-living/use-hostel-fee-resolution.ts` — React Query hook.
- `lib/services/admission/__tests__/fee-applicability.test.ts` — pure-function test for the applicability filter (colocated, optional runner).

**Modify:**
- `app/(routes)/learners/enquiries/_components/incomplete-fee-banner.tsx` — drop `accommodation_type_id` from required dims.
- `app/(routes)/admission/settings/fees-structure/_components/fees-structure-form.tsx` (admission fee-structure category picker) — exclude `kind='hostel'` categories; expose `applies_to` / `applies_year_of_study` per item.
- `lib/services/admission/fee-structure-service.ts` — `findByDimensions` accepts `yearOfStudy` and filters items by applicability.
- `lib/services/admission/fee-resolution-service.ts` — pass `yearOfStudy` (default 1 for enquiry preview) through `previewMatchByDimensions`.
- `types/admission.ts` — add `applies_to` / `applies_year_of_study` to the fee-item type; document new bill fields.
- `types/supabase.ts` — regenerated.
- `lib/query/query-keys.ts` — add `campusLiving.hostelFeeResolution` keys.
- `supabase/setup/02_functions.sql` — mirror the two new/changed functions.

---

# PHASE 1 — Schema + Admission Scoping

### Task 1: Add per-year applicability to admission fee items

**Files:**
- Create: `supabase/migrations/20260605101000_fee_item_year_applicability.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 20260605101000_fee_item_year_applicability.sql
-- Adds per-year-of-study applicability to admission fee structure items.
ALTER TABLE public.admission_fee_structure_items
  ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'every_year',
  ADD COLUMN IF NOT EXISTS applies_year_of_study int NULL;

ALTER TABLE public.admission_fee_structure_items
  DROP CONSTRAINT IF EXISTS afsi_applies_to_chk,
  ADD CONSTRAINT afsi_applies_to_chk
    CHECK (applies_to IN ('first_year_only','every_year','specific_year'));

ALTER TABLE public.admission_fee_structure_items
  DROP CONSTRAINT IF EXISTS afsi_applies_year_chk,
  ADD CONSTRAINT afsi_applies_year_chk
    CHECK ((applies_to = 'specific_year') = (applies_year_of_study IS NOT NULL));

-- Backfill: application + university fees apply in year 1 only.
UPDATE public.admission_fee_structure_items i
SET applies_to = 'first_year_only', applies_year_of_study = NULL
FROM public.billing_categories c
WHERE i.billing_category_id = c.id
  AND c.kind IN ('application_fee','university_fee');

-- Backfill: "N Year Tuition Fee" rows apply in that specific year of study.
UPDATE public.admission_fee_structure_items i
SET applies_to = 'specific_year',
    applies_year_of_study = (regexp_match(c.category_name, '^\s*(\d+)\s*Year'))[1]::int
FROM public.billing_categories c
WHERE i.billing_category_id = c.id
  AND c.kind = 'tuition'
  AND c.category_name ~ '^\s*\d+\s*Year';

-- Everything else (exam, library, transport, other, un-numbered tuition) stays 'every_year' (the default).
```

- [ ] **Step 2: Apply the migration**

Apply via `mcp__supabase__apply_migration` with name `20260605101000_fee_item_year_applicability` and the body above. Commit the file to `supabase/migrations/`.

- [ ] **Step 3: Verify with SQL assertions**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT c.kind, i.applies_to, count(*) AS n,
       array_agg(DISTINCT i.applies_year_of_study) AS years
FROM admission_fee_structure_items i
JOIN billing_categories c ON c.id = i.billing_category_id
GROUP BY 1,2 ORDER BY 1,2;
```

Expected: `application_fee`/`university_fee` → `first_year_only`; `tuition` (N Year) → `specific_year` with `years` = the matching N; `exam`/`other`/`transport` → `every_year`. No CHECK violations (the migration would have failed otherwise).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260605101000_fee_item_year_applicability.sql
git commit -m "feat(admission): per-year applicability on fee structure items"
```

---

### Task 2: Add billing-cycle context + dedup indexes to bills

**Files:**
- Create: `supabase/migrations/20260605102000_bill_ledger_cycle_context.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 20260605102000_bill_ledger_cycle_context.sql
-- Adds hostel-year / package / source context to bills and per-cycle dedup.
ALTER TABLE public.billing_student_bills
  ADD COLUMN IF NOT EXISTS hostel_year_id uuid NULL REFERENCES public.hostel_years(id),
  ADD COLUMN IF NOT EXISTS package_id uuid NULL REFERENCES public.admission_packages(id),
  ADD COLUMN IF NOT EXISTS fee_source text NOT NULL DEFAULT 'academic',
  ADD COLUMN IF NOT EXISTS applies_year_of_study int NULL;

ALTER TABLE public.billing_student_bills
  DROP CONSTRAINT IF EXISTS bsb_fee_source_chk,
  ADD CONSTRAINT bsb_fee_source_chk
    CHECK (fee_source IN ('academic','hostel_package','hostel_category','ad_hoc'));

-- Dedup A: category-keyed bills (academic + hostel category fees) — one per (student, hostel year, category).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_dedup_category
  ON public.billing_student_bills (student_id, hostel_year_id, item_category_id)
  WHERE hostel_year_id IS NOT NULL
    AND fee_source IN ('academic','hostel_category')
    AND status <> 'cancelled';

-- Dedup B: flat package bills (item_category_id may be NULL) — one per (student, hostel year, package).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_dedup_package
  ON public.billing_student_bills (student_id, hostel_year_id, package_id)
  WHERE hostel_year_id IS NOT NULL
    AND fee_source = 'hostel_package'
    AND status <> 'cancelled';

-- Helpful lookup for "which residents are billed for hostel year X".
CREATE INDEX IF NOT EXISTS ix_bill_hostel_year
  ON public.billing_student_bills (hostel_year_id, student_id)
  WHERE hostel_year_id IS NOT NULL;
```

- [ ] **Step 2: Apply the migration** via `mcp__supabase__apply_migration`; commit the file.

- [ ] **Step 3: Verify columns + indexes exist**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'billing_student_bills'
  AND column_name IN ('hostel_year_id','package_id','fee_source','applies_year_of_study')
ORDER BY 1;

SELECT indexname FROM pg_indexes
WHERE tablename = 'billing_student_bills'
  AND indexname IN ('uq_bill_dedup_category','uq_bill_dedup_package','ix_bill_hostel_year');
```

Expected: 4 columns present (`fee_source` NOT NULL, others nullable); 3 indexes listed.

- [ ] **Step 4: Prove the dedup index blocks duplicates** (rollback-safe test)

```sql
-- Pick any real (student, hostel_year, category). Insert twice; the 2nd must fail.
DO $$
DECLARE v_student uuid; v_hy uuid; v_cat uuid; v_inst uuid;
BEGIN
  SELECT id, institution_id INTO v_student, v_inst FROM learners_profiles LIMIT 1;
  SELECT id INTO v_hy FROM hostel_years LIMIT 1;
  SELECT id INTO v_cat FROM billing_categories LIMIT 1;
  INSERT INTO billing_student_bills (student_id, institution_id, item_category_id, hostel_year_id,
    fee_source, bill_description, due_date, quantity, unit_amount, total_amount, final_amount, balance_amount, status)
  VALUES (v_student, v_inst, v_cat, v_hy, 'academic', 'dedup test', now()+interval '30 day', 1, 1, 1, 1, 1, 'unpaid');
  BEGIN
    INSERT INTO billing_student_bills (student_id, institution_id, item_category_id, hostel_year_id,
      fee_source, bill_description, due_date, quantity, unit_amount, total_amount, final_amount, balance_amount, status)
    VALUES (v_student, v_inst, v_cat, v_hy, 'academic', 'dedup test 2', now()+interval '30 day', 1, 1, 1, 1, 1, 'unpaid');
    RAISE EXCEPTION 'DEDUP FAILED: duplicate was allowed';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'DEDUP OK: duplicate blocked';
  END;
  RAISE EXCEPTION 'rollback test data';  -- abort so nothing persists
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'rollback test data' THEN RAISE; END IF;
END $$;
```

Expected: notice `DEDUP OK: duplicate blocked`, then the deliberate rollback (no rows persist). If you instead see `DEDUP FAILED`, the index predicate is wrong — stop and fix.

- [ ] **Step 5: Regenerate types + commit**

Regenerate `types/supabase.ts` (`mcp__supabase__generate_typescript_types`) and paste the new `billing_student_bills` Row/Insert/Update shapes.

```bash
git add supabase/migrations/20260605102000_bill_ledger_cycle_context.sql types/supabase.ts
git commit -m "feat(billing): hostel-year/package/source context + per-cycle dedup on bills"
```

---

### Task 3: Remove hostel-kind fees from admission (dry-run, then delete)

**Files:**
- Create: `supabase/migrations/20260605103000_remove_hostel_items_from_admission.sql`

- [ ] **Step 1: Dry-run report (no mutation)** — run via `mcp__supabase__execute_sql` and record the output:

```sql
SELECT c.category_name, count(*) AS items_to_delete,
       count(DISTINCT i.fee_structure_id) AS affected_structures
FROM admission_fee_structure_items i
JOIN billing_categories c ON c.id = i.billing_category_id
WHERE c.kind = 'hostel'
GROUP BY 1 ORDER BY 1;
```

Expected: a small set of `Hostel Fee`-type rows. If the count is surprisingly large or includes non-hostel names, STOP and report before deleting.

- [ ] **Step 2: Write the delete migration**

```sql
-- 20260605103000_remove_hostel_items_from_admission.sql
-- Hostel fees are owned by Campus Living. Remove hostel-kind items from admission
-- fee structures. Does NOT delete the billing_categories rows (Campus Living uses them).
DELETE FROM public.admission_fee_structure_items i
USING public.billing_categories c
WHERE i.billing_category_id = c.id
  AND c.kind = 'hostel';
```

- [ ] **Step 3: Apply + verify zero remain**

Apply via `mcp__supabase__apply_migration`; commit. Then:

```sql
SELECT count(*) AS remaining_hostel_items
FROM admission_fee_structure_items i
JOIN billing_categories c ON c.id = i.billing_category_id
WHERE c.kind = 'hostel';
```

Expected: `0`. Also confirm the categories still exist: `SELECT count(*) FROM billing_categories WHERE kind='hostel';` → unchanged (> 0).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260605103000_remove_hostel_items_from_admission.sql
git commit -m "feat(admission): remove hostel-kind fee items (owned by campus living)"
```

---

### Task 4: Exclude hostel categories from the admission fee-structure form + expose applicability

**Files:**
- Modify: `app/(routes)/admission/settings/fees-structure/_components/fees-structure-form.tsx`
- Modify: `types/admission.ts`

- [ ] **Step 1: Open the form and locate the fee-item category picker** (the dropdown that lists `billing_categories` when adding a line item) and the per-item editor state.

- [ ] **Step 2: Filter hostel-kind categories out of the picker.** Where the category options are built (a `.map`/`.filter` over fetched `billing_categories`), add:

```ts
// Hostel/mess fees live in Campus Living, not admission — hide hostel-kind categories.
const selectableCategories = categories.filter((c) => c.kind !== 'hostel');
```

Use `selectableCategories` as the picker's option source.

- [ ] **Step 3: Add applicability controls per line item.** For each fee item row, add an `applies_to` select (`First year only` / `Every year` / `Specific year`) and, when `specific_year`, an `applies_year_of_study` number input. Persist both onto the item payload sent to `FeeStructureService` create/update. Add the fields to the item type in `types/admission.ts`:

```ts
// types/admission.ts — fee structure item shape
applies_to: 'first_year_only' | 'every_year' | 'specific_year';
applies_year_of_study: number | null;
```

Ensure the create/update service payload includes these two fields (normalize `applies_year_of_study` to `null` unless `applies_to === 'specific_year'`).

- [ ] **Step 4: Verify types** with `mcp__ide__getDiagnostics` on both files. Expected: no new errors.

- [ ] **Step 5: Browser check** — open the admission fee-structure form: hostel categories no longer appear in the picker; each item shows the applicability control; saving an item with `Specific year = 2` round-trips (re-open shows the value).

- [ ] **Step 6: Commit**

```bash
git add app/\(routes\)/admission/settings/fees-structure/_components/fees-structure-form.tsx types/admission.ts
git commit -m "feat(admission): hide hostel categories + edit per-year applicability in fee-structure form"
```

---

### Task 5: Fix the stale accommodation requirement in the incomplete-fee banner

**Files:**
- Modify: `app/(routes)/learners/enquiries/_components/incomplete-fee-banner.tsx`

- [ ] **Step 1: Open the file** and find `FEE_DIM_ORDER` (≈ line 13) and `getMissingFeeDimensions` (≈ line 23). `accommodation_type_id` is currently listed as a required fee dimension — but resolution ignores it, so learners without an accommodation are wrongly flagged "fee not configured."

- [ ] **Step 2: Remove `accommodation_type_id`** from `FEE_DIM_ORDER` and from any required-dimension list inside `getMissingFeeDimensions`. Leave the 7 real dimensions (institution, degree, department, programme, quota, community, admission_year).

- [ ] **Step 3: Verify** with `mcp__ide__getDiagnostics`. Expected: no errors; no remaining reference to `accommodation_type_id` in this file (`Grep` it to confirm 0 matches).

- [ ] **Step 4: Browser check** — an enquiry with all 7 academic dimensions set but no accommodation no longer shows the "fee structure not configured" banner and can reach the ready-to-apply state.

- [ ] **Step 5: Commit**

```bash
git add app/\(routes\)/learners/enquiries/_components/incomplete-fee-banner.tsx
git commit -m "fix(admission): drop accommodation_type_id from required fee dimensions"
```

---

# PHASE 2 — Resolution Layer (academic year-awareness + hostel fee resolution)

### Task 6: Create the year-of-study helper function

**Files:**
- Create: `supabase/migrations/20260605104000_fn_learner_year_of_study.sql`
- Modify: `supabase/setup/02_functions.sql` (mirror)

- [ ] **Step 1: Inspect the canonical derivation** — read the `year_of_study` expression in the `v_learner_hostelites` view definition (`SELECT pg_get_viewdef('v_learner_hostelites'::regclass, true);`) so the helper mirrors its 3-tier fallback exactly (admission_year `program_start_year/end_year` → batch `start_date` → `enquiry_date`).

- [ ] **Step 2: Write the function**, mirroring the view's logic (adapt the expression below to match the view verbatim where it differs):

```sql
-- 20260605104000_fn_learner_year_of_study.sql
-- Canonical "current year of study" for ANY learner (not just hostellers),
-- mirroring the 3-tier derivation in v_learner_hostelites.
CREATE OR REPLACE FUNCTION public.fn_learner_year_of_study(p_learner_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(1, COALESCE(
    -- Tier 1: admission year program window
    (SELECT (date_part('year', now())::int - ay.program_start_year) + 1
       FROM learners_profiles lp
       JOIN admission_years ay ON ay.id = lp.admission_year_id
      WHERE lp.id = p_learner_id AND ay.program_start_year IS NOT NULL),
    -- Tier 2: batch start
    (SELECT (date_part('year', now())::int - date_part('year', b.start_date)::int) + 1
       FROM learners_profiles lp
       JOIN batches b ON b.id = lp.batch_id
      WHERE lp.id = p_learner_id AND b.start_date IS NOT NULL),
    -- Tier 3: enquiry date
    (SELECT (date_part('year', now())::int - date_part('year', lp.enquiry_date)::int) + 1
       FROM learners_profiles lp
      WHERE lp.id = p_learner_id AND lp.enquiry_date IS NOT NULL),
    1
  ));
$$;
```

- [ ] **Step 3: Apply + verify** against a few known learners:

```sql
SELECT lp.id, ay.admission_year_name, fn_learner_year_of_study(lp.id) AS yos
FROM learners_profiles lp
LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
ORDER BY lp.created_at DESC LIMIT 10;
```

Expected: a first-year (current admission year) → `1`; a learner admitted ~2 years ago → `2`/`3`; never `< 1`.

- [ ] **Step 4: Mirror into `supabase/setup/02_functions.sql`** and commit.

```bash
git add supabase/migrations/20260605104000_fn_learner_year_of_study.sql supabase/setup/02_functions.sql
git commit -m "feat(db): fn_learner_year_of_study helper (mirrors v_learner_hostelites)"
```

---

### Task 7: Make academic resolution (RPC) year-of-study aware

**Files:**
- Create: `supabase/migrations/20260605105000_academic_resolution_year_aware.sql`
- Modify: `supabase/setup/02_functions.sql`

- [ ] **Step 1: Fetch the current RPC body**

```sql
SELECT pg_get_functiondef('public.admission_resolve_fee_items_for_lead(uuid)'::regprocedure);
```

Copy it verbatim into the new migration as the base for a `CREATE OR REPLACE FUNCTION`.

- [ ] **Step 2: Add year-of-study + applicability filter.** In the copied body:
  1. Near the top, after the learner row is loaded, add: `v_year int := public.fn_learner_year_of_study(p_learner_id);`
  2. In the `WHERE`/join that selects `admission_fee_structure_items` (alias e.g. `i`/`afsi`), append:

```sql
AND (
      i.applies_to = 'every_year'
   OR (i.applies_to = 'first_year_only'  AND v_year = 1)
   OR (i.applies_to = 'specific_year'    AND i.applies_year_of_study = v_year)
)
```

Keep everything else (adjustments, gender preference, JSONB aggregation, write-back to `learners_profiles.fee_items`) identical. Wrap the whole `CREATE OR REPLACE` in the migration file.

- [ ] **Step 3: Apply + verify selection by year.** Pick a first-year and a continuing learner and call the resolver, then inspect `fee_items`:

```sql
SELECT public.admission_resolve_fee_items_for_lead('<first-year-learner-id>');
SELECT jsonb_agg(elem->>'category_name')
FROM learners_profiles lp, jsonb_array_elements(lp.fee_items) elem
WHERE lp.id = '<first-year-learner-id>';
-- Expected: includes Application/University + "1 Year Tuition" + every-year items.

SELECT public.admission_resolve_fee_items_for_lead('<year-2-learner-id>');
-- Expected fee_items: "2 Year Tuition" + every-year items; NO Application/University, NO "1 Year Tuition".
```

If a year-2 learner still shows application/university, recheck the backfill (Task 1) and the WHERE filter.

- [ ] **Step 4: Mirror into `02_functions.sql`; commit.**

```bash
git add supabase/migrations/20260605105000_academic_resolution_year_aware.sql supabase/setup/02_functions.sql
git commit -m "feat(admission): year-of-study aware academic fee resolution"
```

---

### Task 8: Make the TS preview path year-aware (so preview matches saved fees)

**Files:**
- Modify: `lib/services/admission/fee-structure-service.ts` (`findByDimensions`, ≈ line 318)
- Modify: `lib/services/admission/fee-resolution-service.ts` (`previewMatchByDimensions`, ≈ line 86)
- Create: `lib/services/admission/__tests__/fee-applicability.test.ts`

- [ ] **Step 1: Extract a pure applicability predicate** at the top of `fee-structure-service.ts` (exported, so it's testable and reused by Phase 3):

```ts
export type FeeItemApplicability = {
  applies_to: 'first_year_only' | 'every_year' | 'specific_year';
  applies_year_of_study: number | null;
};

/** Whether a fee item applies to a learner currently in `yearOfStudy`. */
export function feeItemAppliesToYear(item: FeeItemApplicability, yearOfStudy: number): boolean {
  if (item.applies_to === 'every_year') return true;
  if (item.applies_to === 'first_year_only') return yearOfStudy === 1;
  return item.applies_year_of_study === yearOfStudy; // 'specific_year'
}
```

- [ ] **Step 2: Filter items in `findByDimensions`.** Add an optional `yearOfStudy: number = 1` parameter (enquiry preview = new admission = year 1). After the items are fetched, filter:

```ts
const applicableItems = items.filter((it) =>
  feeItemAppliesToYear(
    { applies_to: it.applies_to, applies_year_of_study: it.applies_year_of_study },
    yearOfStudy,
  ),
);
```

Use `applicableItems` everywhere the method previously used the raw items (totals, returned shape). Ensure the `.select(...)` for items now includes `applies_to, applies_year_of_study`.

- [ ] **Step 3: Thread `yearOfStudy` through `previewMatchByDimensions`** in `fee-resolution-service.ts` — add the same optional param (default 1) and pass it to `findByDimensions`. The enquiry form keeps calling it with no arg (year 1); future callers can pass a real year.

- [ ] **Step 4: Write the pure-function test** (colocated; runnable if the repo's TS test tooling is invoked):

```ts
// lib/services/admission/__tests__/fee-applicability.test.ts
import { feeItemAppliesToYear } from '../fee-structure-service';

describe('feeItemAppliesToYear', () => {
  it('every_year always applies', () => {
    expect(feeItemAppliesToYear({ applies_to: 'every_year', applies_year_of_study: null }, 3)).toBe(true);
  });
  it('first_year_only applies only in year 1', () => {
    expect(feeItemAppliesToYear({ applies_to: 'first_year_only', applies_year_of_study: null }, 1)).toBe(true);
    expect(feeItemAppliesToYear({ applies_to: 'first_year_only', applies_year_of_study: null }, 2)).toBe(false);
  });
  it('specific_year matches the exact year', () => {
    expect(feeItemAppliesToYear({ applies_to: 'specific_year', applies_year_of_study: 2 }, 2)).toBe(true);
    expect(feeItemAppliesToYear({ applies_to: 'specific_year', applies_year_of_study: 2 }, 1)).toBe(false);
  });
});
```

- [ ] **Step 5: Verify** with `mcp__ide__getDiagnostics` on all three files (no new errors). Browser: on a fresh enquiry, the read-only fee panel shows year-1 items (application + university + 1-year tuition), matching what the RPC saves on submit.

- [ ] **Step 6: Commit**

```bash
git add lib/services/admission/fee-structure-service.ts lib/services/admission/fee-resolution-service.ts lib/services/admission/__tests__/fee-applicability.test.ts
git commit -m "feat(admission): year-aware fee preview (parity with RPC resolution)"
```

---

### Task 9: Hostel fee resolution RPC (package match + fee lookup)

**Files:**
- Create: `supabase/migrations/20260605106000_campus_living_resolve_hostel_fee.sql`
- Modify: `supabase/setup/02_functions.sql`

- [ ] **Step 1: Confirm the package-matching dimensions.** A learner's package is matched by fixed `admission_year_id` + cohort dims, with nullable package dims acting as wildcards. Inspect a few rows to confirm which dims are populated:

```sql
SELECT institution_id, admission_year_id, degree_id, department_id, programme_id, quota_id, gender,
       room_category_id, mess_category_id, package_type, is_active
FROM admission_packages WHERE is_active LIMIT 20;
```

- [ ] **Step 2: Write the resolution RPC**

```sql
-- 20260605106000_campus_living_resolve_hostel_fee.sql
-- Resolve a hosteller's hostel/mess fee for a given hostel year.
-- Returns jsonb array of line items: [{fee_source, package_id, category_id, category_name, amount}].
CREATE OR REPLACE FUNCTION public.campus_living_resolve_hostel_fee(
  p_learner_id uuid,
  p_hostel_year_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lp           learners_profiles%ROWTYPE;
  v_package_id uuid;
  v_flat       numeric;
  v_items      jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO lp FROM learners_profiles WHERE id = p_learner_id;
  IF NOT FOUND THEN RETURN v_items; END IF;

  -- 1) Explicit assignment overrides matching.
  SELECT lpa.package_id INTO v_package_id
  FROM learner_package_assignment lpa
  WHERE lpa.learner_id = p_learner_id AND lpa.hostel_year_id = p_hostel_year_id
  LIMIT 1;

  -- 2) Else match an active package by the learner's fixed dims (NULL package dim = wildcard).
  IF v_package_id IS NULL THEN
    SELECT p.id INTO v_package_id
    FROM admission_packages p
    WHERE p.is_active
      AND p.institution_id   = lp.institution_id
      AND (p.admission_year_id IS NULL OR p.admission_year_id = lp.admission_year_id)
      AND (p.degree_id        IS NULL OR p.degree_id        = lp.degree_id)
      AND (p.department_id     IS NULL OR p.department_id     = lp.department_id)
      AND (p.programme_id      IS NULL OR p.programme_id      = lp.program_id)
      AND (p.quota_id          IS NULL OR p.quota_id          = lp.quota_id)
      AND (p.gender            IS NULL OR upper(p.gender)      = upper(lp.gender))
      AND (p.room_category_id  IS NULL OR p.room_category_id  = lp.hostel_category_id)
      AND (p.mess_category_id  IS NULL OR p.mess_category_id  = lp.mess_category_id)
    ORDER BY
      (p.admission_year_id IS NOT NULL)::int + (p.programme_id IS NOT NULL)::int
      + (p.quota_id IS NOT NULL)::int + (p.gender IS NOT NULL)::int DESC  -- prefer most specific
    LIMIT 1;
  END IF;

  IF v_package_id IS NULL THEN RETURN v_items; END IF;

  -- 3) Prefer a flat package fee for (package, hostel year).
  SELECT hf.amount INTO v_flat
  FROM hostel_fees hf
  WHERE hf.package_id = v_package_id AND hf.hostel_year_id = p_hostel_year_id AND hf.is_active
  LIMIT 1;

  IF v_flat IS NOT NULL THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'fee_source','hostel_package','package_id',v_package_id,
      'category_id',NULL,'category_name','Hostel Package','amount',v_flat));
  END IF;

  -- 4) Else sum the learner's room + mess category fees for the hostel year.
  SELECT jsonb_agg(jsonb_build_object(
           'fee_source','hostel_category','package_id',v_package_id,
           'category_id',cat_id,'category_name',cat_name,'amount',amount))
  INTO v_items
  FROM (
    SELECT hc.id AS cat_id, hc.name AS cat_name, hf.amount
    FROM hostel_fees hf JOIN hostel_categories hc ON hc.id = hf.hostel_category_id
    WHERE hf.hostel_category_id = lp.hostel_category_id
      AND hf.hostel_year_id = p_hostel_year_id AND hf.is_active
    UNION ALL
    SELECT mc.id, mc.name, hf.amount
    FROM hostel_fees hf JOIN mess_categories mc ON mc.id = hf.mess_category_id
    WHERE hf.mess_category_id = lp.mess_category_id
      AND hf.hostel_year_id = p_hostel_year_id AND hf.is_active
  ) rows;

  RETURN COALESCE(v_items, '[]'::jsonb);
END $$;
```

- [ ] **Step 3: Apply + verify** for a known hosteller + current hostel year:

```sql
SELECT public.campus_living_resolve_hostel_fee(
  (SELECT lp.id FROM learners_profiles lp
   JOIN accommodation_types a ON a.id = lp.accommodation_type_id
   WHERE a.code = 'hostel' LIMIT 1),
  (SELECT id FROM hostel_years WHERE is_current LIMIT 1)
);
```

Expected: a jsonb array — either a single `hostel_package` line (if a flat package fee is configured) or `hostel_category` lines for the learner's room/mess categories. Empty `[]` is valid if no package/fee is configured yet (note it for the demo data).

- [ ] **Step 4: Mirror into `02_functions.sql`; commit.**

```bash
git add supabase/migrations/20260605106000_campus_living_resolve_hostel_fee.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): hostel fee resolution RPC (package match + fee lookup)"
```

---

### Task 10: TS service + hook wrapping hostel resolution

**Files:**
- Create: `lib/services/campus-living/hostel-fee-resolution-service.ts`
- Create: `hooks/campus-living/use-hostel-fee-resolution.ts`
- Modify: `lib/query/query-keys.ts`

- [ ] **Step 1: Write the service** (static class extending `BaseService`, mirroring the pattern in `hostel-fee-service.ts`):

```ts
// lib/services/campus-living/hostel-fee-resolution-service.ts
import { BaseService } from '@/lib/services/base-service';
import { getErrorMessage } from '@/lib/utils';

export type HostelFeeLine = {
  fee_source: 'hostel_package' | 'hostel_category';
  package_id: string | null;
  category_id: string | null;
  category_name: string;
  amount: number;
};

export class HostelFeeResolutionService extends BaseService {
  static async resolve(learnerId: string, hostelYearId: string): Promise<HostelFeeLine[]> {
    const { data, error } = await this.supabase.rpc('campus_living_resolve_hostel_fee', {
      p_learner_id: learnerId,
      p_hostel_year_id: hostelYearId,
    });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as HostelFeeLine[];
  }
}
```

- [ ] **Step 2: Add query keys** in `lib/query/query-keys.ts` under the campus-living namespace:

```ts
hostelFeeResolution: (learnerId: string, hostelYearId: string) =>
  ['campus-living', 'hostel-fee-resolution', learnerId, hostelYearId] as const,
```

- [ ] **Step 3: Write the hook**

```ts
// hooks/campus-living/use-hostel-fee-resolution.ts
import { useQuery } from '@tanstack/react-query';
import { HostelFeeResolutionService } from '@/lib/services/campus-living/hostel-fee-resolution-service';
import { queryKeys } from '@/lib/query/query-keys';

export function useHostelFeeResolution(learnerId?: string, hostelYearId?: string) {
  return useQuery({
    queryKey: queryKeys.campusLiving.hostelFeeResolution(learnerId ?? '', hostelYearId ?? ''),
    queryFn: () => HostelFeeResolutionService.resolve(learnerId!, hostelYearId!),
    enabled: !!learnerId && !!hostelYearId,
  });
}
```

- [ ] **Step 4: Verify** with `mcp__ide__getDiagnostics` on all three files. The RPC name must exist in `types/supabase.ts` `Functions` (regenerate types if `rpc('campus_living_resolve_hostel_fee', …)` errors).

- [ ] **Step 5: Commit**

```bash
git add lib/services/campus-living/hostel-fee-resolution-service.ts hooks/campus-living/use-hostel-fee-resolution.ts lib/query/query-keys.ts
git commit -m "feat(campus-living): hostel fee resolution service + hook"
```

---

## Phase 1 & 2 — Definition of Done

- Day-scholar / hosteller learners both resolve **academic** fees only from admission, filtered by year-of-study (verified in Task 7/8).
- Admission contains **no** hostel-kind items (Task 3) and the form can't add them (Task 4).
- `billing_student_bills` has cycle context + working dedup (Task 2 Step 4 proved it).
- `campus_living_resolve_hostel_fee` returns correct hostel/mess lines for a hosteller (Task 9), reachable from TS (Task 10).
- All touched files pass `mcp__ide__getDiagnostics`; every task committed.

---

# Subsequent plans (to be written against the merged foundation)

These are intentionally **not** expanded here — their concrete code (generation RPC body, UI columns, dialog wiring) must be authored against the real merged Phase-1/2 schema and functions, not speculated. Each becomes its own plan file once the foundation is verified.

### Phase 3 plan — `2026-06-…-hostel-bill-generation-ui.md`
- **`campus_living_generate_hostel_year_bills(p_hostel_year_id, p_learner_ids uuid[], p_dry_run bool)`** SECURITY DEFINER RPC: for each learner, union `fn_learner_year_of_study`-filtered academic items (via `admission_resolve_fee_items_for_lead`) + `campus_living_resolve_hostel_fee`; in dry-run return the proposed/skipped breakdown; otherwise INSERT into `billing_student_bills` stamping `hostel_year_id / package_id / fee_source / applies_year_of_study` (dedup indexes make it idempotent). Route the existing `admission_account_transition_with_bills` and `OnboardingService.createBillsFromProfile` through a shared helper so the two bill-loops can't diverge. **Hosteller routing rule (avoids double-billing the academic portion):** the account-transition / onboarding path generates academic bills for **day scholars only**; for **hostellers**, the academic bills are owned by the Campus Living *combined* generation run (academic items + hostel/mess, all stamped with `hostel_year_id`). At account transition the path checks `accommodation_types.code` and skips academic bill insertion for hostellers (their `fee_items` are still resolved/stored as today).
- Page/tab under `app/(routes)/campus-living/residents/` with hostel-year selector, resident table (year-of-study, matched package, dry-run preview, per-hostel-year status), expandable per-student fee detail, **warning dialog** ("X already billed → skip, Y new"), verify-then-bulk-generate, and an "Add additional bill" (`fee_source='ad_hoc'`) action.
- Hook `hooks/campus-living/use-hostel-bill-generation.ts` (mutation + dry-run query), invalidating billing + resident query keys.

### Phase 4 plan — `2026-06-…-hostel-billing-visibility-permissions.md`
- Per-hostel-year bill-status column/badge on the resident list.
- Permission key `campus_living.fees.generate` in `lib/constants/permissions.ts` **+ role-grant migration** (`jsonb || jsonb_build_object`); run `npm run check:menus`.
- Complete the RLS retrofit on `hostel_years` + `learner_package_assignment` (replace `role IN ('super_admin','admin')` with permission-key gates).
- Optional: surface year-aware bulk academic generation for **day scholars** in `/billing/onboarding`.

---

## Self-Review (performed against the spec)

- **Spec §5.1 applicability** → Task 1 (+8 predicate). **§5.2 bill columns/indexes** → Task 2. **§5.3 remove hostel + banner fix** → Tasks 3,4,5. **§6.1 academic year-aware (both paths)** → Tasks 7 (RPC) + 8 (TS). **§6.2 hostel resolution** → Tasks 9,10. **§7 generation / §5.4 permissions/RLS** → Phase 3/4 plans (scoped, dependency-correct). No spec requirement for Phases 1–2 is unmapped.
- **Placeholder scan:** every code step contains real SQL/TS; the only deferred items are Phases 3–4, explicitly scoped as separate plans (not inline TODOs).
- **Type consistency:** `feeItemAppliesToYear` / `FeeItemApplicability` (Task 8) reused by name; `fee_source` literal set identical across migration (Task 2), RPC (Task 9), service (Task 10); `fn_learner_year_of_study` signature consistent across Tasks 6/7. `HostelFeeLine.fee_source` is the resolution subset (`hostel_package|hostel_category`), a deliberate narrowing of the bill-level enum.

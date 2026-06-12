# Hostel-Bill Generation UI — Implementation Plan (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Campus Living operators a per-hostel-year surface to **preview** each resident's resolved fees (academic + hostel/mess), see **bill status**, get a **warning** for already-billed items, and **verify-then-bulk-generate** the bills — idempotently, with hostel-year-level dedup.

**Architecture:** A SECURITY DEFINER RPC computes (dry-run or commit) the combined bill set per hosteller for a chosen hostel year: year-of-study–filtered academic items (read-only resolution) **unioned** with `campus_living_resolve_hostel_fee`, deduped against existing `(student, hostel_year, category/package)` bills via the Phase-2 partial-unique indexes. Day-scholar academic billing stays at account-transition; **hostellers are billed entirely from this run** (the account-transition path skips them so the academic portion isn't billed twice). The UI lives under `app/(routes)/campus-living/residents/`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase RPC + RLS, TanStack Query, Shadcn UI, react-hook-form.

**Source spec:** `docs/superpowers/specs/2026-06-05-hostel-fees-campus-living-billing-design.md` (§7). Builds on the merged Phase 1–2 foundation (PR #1227).

---

## ⚠️ Pre-flight dependency (read before starting)

This phase composes three DB functions whose schema was in flux during a concurrent **admission-year institution-wide** migration:
- `fn_learner_year_of_study(uuid)` — now reads `admission_years.year` + `programs.program_duration_yrs` (co-edited; one `COALESCE(...,4)` divergence from the view exists).
- `admission_resolve_fee_items_for_lead(uuid)` — carries the year-applicability filter.
- `campus_living_resolve_hostel_fee(uuid, uuid)`.

**Before implementing, confirm the admission-year feature has landed and these three functions are stable** (run Task 0). If `admission_years`/`programs` shapes are still changing, pause — the generation RPC will inherit any drift.

## Repo working rules

- **No test suite.** Verify with: SQL assertions via `mcp__supabase__execute_sql`; `mcp__ide__getDiagnostics` (or scoped `tsc`) per TS file; `npm run check:menus` when permission keys/routes change; browser exercise as a non-super-admin.
- **Migrations:** apply via `mcp__supabase__apply_migration` AND commit the real SQL to `supabase/migrations/`, mirror functions to `supabase/setup/02_functions.sql`. Timestamps `20260606xxxxxx`.
- **Generation writes go through the SECURITY DEFINER RPC** so RLS sees the right identity and the dedup indexes are the source of truth. Never bulk-insert bills from the browser.
- **Gotchas:** `getErrorMessage()`; destructure `{ error }`; `'' → null`; no `!inner`; invalidate billing + resident query keys after generate; this work is on its own worktree/branch off `main`.

---

## File Structure

**Create:**
- `supabase/migrations/20260606100000_admission_resolve_fee_items_readonly.sql` — read-only academic resolution (no side-effect write).
- `supabase/migrations/20260606101000_campus_living_generate_hostel_year_bills.sql` — the generation RPC (dry-run + commit).
- `supabase/migrations/20260606102000_account_transition_skip_hostellers.sql` — route hostellers' academic to Campus Living.
- `lib/services/campus-living/hostel-bill-generation-service.ts` — TS wrapper (dryRun + generate).
- `hooks/campus-living/use-hostel-bill-generation.ts` — dry-run query + generate mutation.
- `app/(routes)/campus-living/residents/_components/generate-bills-tab.tsx` — the generation surface.
- `app/(routes)/campus-living/residents/_components/generate-bills-warning-dialog.tsx` — the pre-generate warning.
- `app/(routes)/campus-living/residents/_components/resident-fee-detail.tsx` — expandable per-student fee breakdown.

**Modify:**
- `app/(routes)/campus-living/residents/page.tsx` — add the "Generate Hostel-Year Bills" tab (URL-param driven, per the Radix-tabs gotcha).
- `lib/query/query-keys.ts` — `campusLiving.hostelBillGeneration` keys.
- `lib/constants/permissions.ts` + a grant migration — `campus_living.fees.generate` (or reuse `campus_living.fees.config`) — **(can defer to Phase 4 if reusing an existing key)**.
- `supabase/setup/02_functions.sql` — mirror the 3 new/changed functions.

---

### Task 0: Confirm dependencies are stable

- [ ] **Step 1:** Verify the three functions execute and agree with the resident view.
```sql
SELECT
  (SELECT count(*) FROM pg_proc WHERE proname='fn_learner_year_of_study') AS yos_fn,
  (SELECT count(*) FROM pg_proc WHERE proname='campus_living_resolve_hostel_fee') AS hostel_fn,
  (SELECT count(*) FROM pg_proc WHERE proname='admission_resolve_fee_items_for_lead'
     AND pg_get_functiondef(oid) LIKE '%applies_to%') AS academic_year_filter,
  (SELECT count(*) FILTER (WHERE v.year_of_study IS DISTINCT FROM fn_learner_year_of_study(v.id))
     FROM v_learner_hostelites v) AS yos_disagreements;
```
Expected: `yos_fn=1, hostel_fn=1, academic_year_filter=1`. If `yos_disagreements > a handful` (a few graduated edge rows are acceptable), STOP and reconcile the fn/view with the admission-year owners first.

---

### Task 1: Read-only academic resolution helper

The existing `admission_resolve_fee_items_for_lead` WRITES `learners_profiles.fee_items` as a side effect — unusable for a dry-run. Extract a pure read-only resolver.

**Files:** Create `supabase/migrations/20260606100000_admission_resolve_fee_items_readonly.sql`

- [ ] **Step 1: Fetch the current resolver body** to mirror its matching + aggregation exactly.
```sql
SELECT pg_get_functiondef('public.admission_resolve_fee_items_for_lead(uuid)'::regprocedure);
```

- [ ] **Step 2: Write a read-only twin** `admission_resolve_fee_items_readonly(p_learner_id uuid, p_year_of_study int)` that:
  - Reuses the SAME structure-match (7 dims + community + gender) and item aggregation/adjustments,
  - applies the SAME year filter using the **passed** `p_year_of_study` (not recomputed) so the caller controls the year,
  - RETURNS the resolved `jsonb` array `[{billing_category_id, category_name, amount, applies_year_of_study}]`,
  - performs **NO** `UPDATE learners_profiles`.
  Keep the matching logic identical; only swap the write for a `RETURN`. `SET search_path = public`, `STABLE SECURITY DEFINER`.

- [ ] **Step 3: Apply + verify** against a known learner at years 1 and 2:
```sql
SELECT admission_resolve_fee_items_readonly('<learner-id>', 1);
SELECT admission_resolve_fee_items_readonly('<learner-id>', 2);
```
Expected: year 1 includes application/university + 1-Year tuition + every-year items; year 2 only 2-Year tuition + every-year. No write to `learners_profiles` (confirm `fee_items` unchanged before/after).

- [ ] **Step 4: Mirror to `02_functions.sql`; commit.**
```bash
git add supabase/migrations/20260606100000_admission_resolve_fee_items_readonly.sql supabase/setup/02_functions.sql
git commit -m "feat(admission): read-only academic fee resolver for dry-run generation"
```

---

### Task 2: The generation RPC (dry-run + commit)

**Files:** Create `supabase/migrations/20260606101000_campus_living_generate_hostel_year_bills.sql`

- [ ] **Step 1: Write the RPC.**
```sql
-- campus_living_generate_hostel_year_bills
-- For each hosteller in p_learner_ids, compute the combined bill set for p_hostel_year_id:
--   year-of-study-filtered academic items + hostel/mess items.
-- Dedup against existing (student, hostel_year, category|package) bills.
-- p_dry_run=true: return the plan without inserting. false: insert new bills idempotently.
CREATE OR REPLACE FUNCTION public.campus_living_generate_hostel_year_bills(
  p_hostel_year_id uuid,
  p_learner_ids    uuid[],
  p_dry_run        boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result      jsonb := '[]'::jsonb;
  v_learner     uuid;
  lp            learners_profiles%ROWTYPE;
  v_year        int;
  v_academic    jsonb;
  v_hostel      jsonb;
  v_item        jsonb;
  v_proposed    jsonb;
  v_skipped     jsonb;
  v_new         int;
  v_exists      boolean;
  v_cat         uuid;
  v_pkg         uuid;
  v_src         text;
BEGIN
  -- permission gate (reuse campus_living.fees.config or the new fees.generate key)
  IF NOT public.user_has_permission('campus_living.fees.config') THEN
    RAISE EXCEPTION 'permission denied: campus_living.fees.config' USING ERRCODE = '42501';
  END IF;

  FOREACH v_learner IN ARRAY p_learner_ids LOOP
    SELECT * INTO lp FROM learners_profiles WHERE id = v_learner;
    CONTINUE WHEN NOT FOUND;
    -- hostellers only
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM accommodation_types a WHERE a.id = lp.accommodation_type_id AND a.code = 'hostel');

    v_year     := COALESCE(public.fn_learner_year_of_study(v_learner), 1);
    v_academic := public.admission_resolve_fee_items_readonly(v_learner, v_year);
    v_hostel   := public.campus_living_resolve_hostel_fee(v_learner, p_hostel_year_id);
    v_proposed := '[]'::jsonb; v_skipped := '[]'::jsonb; v_new := 0;

    -- academic items (fee_source='academic', keyed by billing_category_id)
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_academic,'[]'::jsonb)) LOOP
      v_cat := (v_item->>'billing_category_id')::uuid; v_src := 'academic';
      SELECT EXISTS(SELECT 1 FROM billing_student_bills b
        WHERE b.student_id = v_learner AND b.hostel_year_id = p_hostel_year_id
          AND b.item_category_id = v_cat AND b.fee_source IN ('academic','hostel_category')
          AND b.status <> 'cancelled') INTO v_exists;
      IF v_exists THEN v_skipped := v_skipped || v_item;
      ELSE
        v_proposed := v_proposed || (v_item || jsonb_build_object('fee_source',v_src));
        IF NOT p_dry_run THEN
          INSERT INTO billing_student_bills (student_id, institution_id, item_category_id,
            hostel_year_id, fee_source, applies_year_of_study, bill_description, due_date,
            quantity, unit_amount, total_amount, final_amount, balance_amount, status)
          VALUES (v_learner, lp.institution_id, v_cat, p_hostel_year_id, v_src, v_year,
            v_item->>'category_name', now()+interval '30 day', 1,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric, 'unpaid')
          ON CONFLICT DO NOTHING;  -- partial unique index is the final guard
        END IF;
        v_new := v_new + 1;
      END IF;
    END LOOP;

    -- hostel/mess items (fee_source from resolver: hostel_package | hostel_category)
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_hostel,'[]'::jsonb)) LOOP
      v_src := v_item->>'fee_source'; v_cat := NULLIF(v_item->>'category_id','')::uuid;
      v_pkg := NULLIF(v_item->>'package_id','')::uuid;
      IF v_src = 'hostel_package' THEN
        SELECT EXISTS(SELECT 1 FROM billing_student_bills b WHERE b.student_id=v_learner
          AND b.hostel_year_id=p_hostel_year_id AND b.package_id=v_pkg
          AND b.fee_source='hostel_package' AND b.status<>'cancelled') INTO v_exists;
      ELSE
        SELECT EXISTS(SELECT 1 FROM billing_student_bills b WHERE b.student_id=v_learner
          AND b.hostel_year_id=p_hostel_year_id AND b.item_category_id=v_cat
          AND b.fee_source IN ('academic','hostel_category') AND b.status<>'cancelled') INTO v_exists;
      END IF;
      IF v_exists THEN v_skipped := v_skipped || v_item;
      ELSE
        v_proposed := v_proposed || v_item;
        IF NOT p_dry_run THEN
          INSERT INTO billing_student_bills (student_id, institution_id, item_category_id,
            hostel_year_id, package_id, fee_source, bill_description, due_date,
            quantity, unit_amount, total_amount, final_amount, balance_amount, status)
          VALUES (v_learner, lp.institution_id, v_cat, p_hostel_year_id, v_pkg, v_src,
            v_item->>'category_name', now()+interval '30 day', 1,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric, 'unpaid')
          ON CONFLICT DO NOTHING;
        END IF;
        v_new := v_new + 1;
      END IF;
    END LOOP;

    v_result := v_result || jsonb_build_object(
      'learner_id', v_learner, 'year_of_study', v_year,
      'proposed', v_proposed, 'skipped', v_skipped, 'new_count', v_new);
  END LOOP;

  RETURN v_result;
END $$;
```
> If `ON CONFLICT DO NOTHING` errors because the partial unique index needs an explicit arbiter, drop it — the preceding `EXISTS` check already prevents duplicates; the index remains the concurrency backstop. Verify which during Step 2.

- [ ] **Step 2: Apply + dry-run verify** for a current hostel year + a few hosteller ids:
```sql
SELECT campus_living_generate_hostel_year_bills(
  (SELECT id FROM hostel_years WHERE is_current LIMIT 1),
  ARRAY(SELECT lp.id FROM learners_profiles lp JOIN accommodation_types a ON a.id=lp.accommodation_type_id
        WHERE a.code='hostel' LIMIT 3),
  true);  -- dry-run
```
Expected: per-learner `{year_of_study, proposed, skipped, new_count}`. With no packages/fees configured, hostel items are `[]` and only academic items appear. Run a **seed-and-rollback** test (insert a package + hostel_fees, commit-mode generate, assert bills created with correct `hostel_year_id`/`fee_source`, then re-run and assert `new_count=0` (idempotent), then `RAISE EXCEPTION` to roll back).

- [ ] **Step 3: Mirror + commit.**
```bash
git add supabase/migrations/20260606101000_campus_living_generate_hostel_year_bills.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): hostel-year bill generation RPC (dry-run + idempotent commit)"
```

---

### Task 3: Route hostellers' academic billing to Campus Living

Without this, a hosteller gets academic bills at account-transition (`hostel_year_id` NULL) **and** from the generation run (`hostel_year_id` set) — the dedup index doesn't bridge NULL vs set, so the academic portion double-bills.

**Files:** Create `supabase/migrations/20260606102000_account_transition_skip_hostellers.sql`; Modify `lib/services/billing/onboarding/onboarding-service.ts`

- [ ] **Step 1:** Fetch `admission_account_transition_with_bills` body. In its bill-generation loop, add a guard: **skip INSERT of bills when the learner is a hosteller** (`EXISTS accommodation_types a WHERE a.id=lp.accommodation_type_id AND a.code='hostel'`). Keep the lifecycle transition + fee_items resolution; only skip the bill INSERTs for hostellers. Re-apply via migration.
- [ ] **Step 2:** Mirror the same guard in `OnboardingService.createBillsFromProfile` (TS): early-return `{ generated: 0, skipped: 1, reason: 'hosteller — billed via campus living' }` when the learner's accommodation is hostel. Verify with `getDiagnostics`.
- [ ] **Step 3: Verify** a hosteller account-transition creates **no** academic bills (they come from generation), while a day scholar still does. Commit.

---

### Task 4: TS generation service + hook

**Files:** Create `lib/services/campus-living/hostel-bill-generation-service.ts`, `hooks/campus-living/use-hostel-bill-generation.ts`; Modify `lib/query/query-keys.ts`

- [ ] **Step 1: Service** (mirror `HostelFeeResolutionService` pattern):
```ts
export type GenerationLine = { category_name: string; amount: number; fee_source: string; billing_category_id?: string };
export type LearnerGenerationPlan = { learner_id: string; year_of_study: number; proposed: GenerationLine[]; skipped: GenerationLine[]; new_count: number };

export class HostelBillGenerationService {
  private static get supabase() { return createClientSupabaseClient(); }
  static async run(hostelYearId: string, learnerIds: string[], dryRun: boolean): Promise<LearnerGenerationPlan[]> {
    const { data, error } = await this.supabase.rpc('campus_living_generate_hostel_year_bills', {
      p_hostel_year_id: hostelYearId, p_learner_ids: learnerIds, p_dry_run: dryRun,
    });
    if (error) throw new Error(getErrorMessage(error));
    return (data ?? []) as LearnerGenerationPlan[];
  }
}
```
Add the RPC signature to `types/supabase.ts` Functions (surgical): `Args: { p_hostel_year_id: string; p_learner_ids: string[]; p_dry_run?: boolean }; Returns: Json`.

- [ ] **Step 2: Hook** — a `useMutation` for `run(..., false)` (generate) that invalidates billing + resident query keys, and a `useQuery`/imperative call for the dry-run preview. Add `campusLiving.hostelBillGeneration` keys to `query-keys.ts`.
- [ ] **Step 3:** `getDiagnostics` clean; commit.

---

### Task 5: Generation tab + resident table

**Files:** Create `app/(routes)/campus-living/residents/_components/generate-bills-tab.tsx`; Modify `app/(routes)/campus-living/residents/page.tsx`

- [ ] **Step 1:** Add a "Generate Hostel-Year Bills" tab to the residents page driven by `?tab=generate` (URL param, per the Radix-eager-render gotcha — render only the active tab).
- [ ] **Step 2:** In the tab: a **hostel-year selector** (`useActiveHostelYears`/`useCurrentHostelYear`, default current) + the existing hosteller `DataTable` (from `v_learner_hostelites`) with added columns: **year-of-study**, **matched package** (call the resolver or surface from the dry-run), and a per-hostel-year **status** badge (`Not generated` / `Partially` / `Fully`) computed from a count of `billing_student_bills` where `hostel_year_id = selected`.
- [ ] **Step 3:** A "Preview selected" action calls `HostelBillGenerationService.run(year, selectedIds, true)` and stores the plan; row expansion shows `resident-fee-detail`. Follow existing residents-tab patterns. `getDiagnostics`; browser-check; commit.

---

### Task 6: Per-student fee detail + warning dialog + generate

**Files:** Create `resident-fee-detail.tsx`, `generate-bills-warning-dialog.tsx`

- [ ] **Step 1: `resident-fee-detail.tsx`** — renders a learner's dry-run plan: a table of `proposed` (green/new) and `skipped` (muted/already-billed) lines with `category_name`, `fee_source`, `amount`, and the learner's `year_of_study`.
- [ ] **Step 2: `generate-bills-warning-dialog.tsx`** — on "Generate", compute totals from the dry-run plan across selected learners: `{ studentsWithExisting, totalSkipped, totalNew }`. Show: *"X students already have N of these bills (will be skipped). Y new bills will be created."* with `[Cancel]` / `[Confirm generate]`. Pair `disabled={mutation.isPending}` with a top-of-handler `if (mutation.isPending) return;` (double-submit gotcha).
- [ ] **Step 3:** Confirm → `HostelBillGenerationService.run(year, ids, false)` → toast the `{generated, skipped}` summary → invalidate keys → statuses refresh. `getDiagnostics`; browser-check the full flow (preview → warning → generate → re-run shows all skipped). Commit.

---

### Task 7: Ad-hoc ("additional") bill action

- [ ] **Step 1:** Add an "Add additional bill" row action that opens a small form (category + amount + description) and inserts via the existing single-bill path with `fee_source='ad_hoc'` and the selected `hostel_year_id` — exempt from dedup (always allowed), satisfying the "additional bills can be generated" requirement. Reuse `StudentBillService.createStudentBill` if it accepts the new columns; otherwise extend it minimally. `getDiagnostics`; commit.

---

## Self-Review (against spec §7)

- **Dry-run preview** → Tasks 2 (RPC `p_dry_run`), 5–6 (UI). **Warning before generate** → Task 6. **Verify-then-bulk-generate** → Task 6. **Per-hostel-year status** → Task 5. **Dedup / no double-bill** → Task 2 (EXISTS + index) + Task 3 (hosteller routing). **Ad-hoc bills** → Task 7. **Year-aware academic** → Tasks 1–2. **Combined academic+hostel for hostellers** → Task 2.
- **Placeholders:** none — all RPC bodies and TS skeletons are concrete; UI tasks reference real components/hooks to follow.
- **Type consistency:** `LearnerGenerationPlan`/`GenerationLine` shapes match the RPC's returned jsonb keys (`learner_id`, `year_of_study`, `proposed`, `skipped`, `new_count`, `category_name`, `amount`, `fee_source`).
- **Open:** the `campus_living.fees.generate` permission key + RLS retrofit on `hostel_years`/`learner_package_assignment` are **Phase 4**; Task 2 reuses `campus_living.fees.config` until then.

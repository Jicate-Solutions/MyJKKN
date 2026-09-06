# Auto-Allocation Validation Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-learner validation preview to hostel auto-allocation that checks a mandatory academic-year + current-year-bill prerequisite *first* (short-circuit), then the existing eligibility conditions, and shows every candidate's pass/fail verdict.

**Architecture:** One new read RPC (`fn_auto_allocate_candidates`) returns per-learner verdict rows; the generator (`fn_auto_allocate_classic`) gains a `p_require_bill` param enforcing the same Stage-0 gate so preview = generate. The Auto-Allocate page gains a "Require current-year bill" toggle (default ON) and renders a candidate validation table. Diagnostics-only — it exposes (does not fix) the untagged-bill and duplicate-`academic_years` data problems.

**Tech Stack:** Postgres (Supabase RPC, `plpgsql`/`sql`), Next.js 16 App Router, React 19, TypeScript, TanStack Query, Shadcn UI, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-08-campus-living-auto-allocation-validation-preview-design.md`

**Verification note:** This repo has **no test runner**. "Tests" here = (a) `mcp__ide__getDiagnostics` on each touched TS file, (b) live SQL execution of the RPCs via the Supabase MCP tool, (c) a manual browser pass. Each task states its concrete check.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260608120000_auto_allocate_candidates_and_bill_gate.sql` | Create | New candidate RPC + altered classic generator + grants |
| `supabase/setup/02_functions.sql` | Modify (append) | Mirror all three auto-allocate functions (were never mirrored) |
| `types/allocation-batch.ts` | Modify | `AllocationCandidate` + `BillState` types |
| `lib/services/campus-living/allocation-batch-service.ts` | Modify | `previewCandidates()` + 4-arg `generate()` |
| `hooks/campus-living/use-allocation-batches.ts` | Modify | thread `requireBill` through the `generate` action |
| `app/(routes)/campus-living/allocations/auto/_components/candidate-validation-table.tsx` | Create | Summary cards + per-student table + bill badge + zero-bill banner |
| `app/(routes)/campus-living/allocations/auto/page.tsx` | Modify | toggle + two-call preview + render table |

---

## Task 1: Database migration — candidate RPC + bill gate on generator

**Files:**
- Create: `supabase/migrations/20260608120000_auto_allocate_candidates_and_bill_gate.sql`
- Modify: `supabase/setup/02_functions.sql` (append the three functions)

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260608120000_auto_allocate_candidates_and_bill_gate.sql` with this exact body:

```sql
-- Auto-allocation validation preview + mandatory academic-year/current-year-bill gate.
-- Spec: docs/superpowers/specs/2026-06-08-campus-living-auto-allocation-validation-preview-design.md

-- 1) Drop the 3-arg generator so we can re-create it with p_require_bill.
DROP FUNCTION IF EXISTS public.fn_auto_allocate_classic(uuid, uuid, uuid);

-- 2) Generator with the Stage-0 prerequisite gate (academic year + current-year bill), default ON.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_classic(
  p_block_id uuid, p_category_id uuid, p_hostel_year_id uuid, p_require_bill boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch uuid; v_tier uuid; v_actor uuid := auth.uid();
  v_alloc int := 0; v_skip int := 0;
  v_req_gender text; v_cat_type text; v_block_type text; v_ay uuid;
  cand record; v_bed uuid; v_room uuid;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('campus_living.allocations.create')) THEN
    RAISE EXCEPTION 'Not authorized to run auto-allocation';
  END IF;

  SELECT type, CASE type WHEN 'boys' THEN 'male' WHEN 'girls' THEN 'female' ELSE NULL END
    INTO v_cat_type, v_req_gender
    FROM hostel_categories WHERE id=p_category_id AND allocation_mode='auto';
  IF NOT FOUND THEN RAISE EXCEPTION 'Category is not an auto-allocation category'; END IF;

  SELECT hostel_type::text INTO v_block_type FROM hostel_blocks WHERE id=p_block_id;
  IF v_block_type IS NULL THEN RAISE EXCEPTION 'Block not found'; END IF;
  IF NOT (v_block_type='mixed' OR v_block_type=v_cat_type) THEN
    RAISE EXCEPTION 'The category gender does not match the block';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM hostel_room_eligibility_rules
                 WHERE block_id = p_block_id AND is_active) THEN
    RAISE EXCEPTION 'No physical-room rules are set for this block. Set rules under Program Eligibility -> Physical Rooms before auto-allocating.';
  END IF;

  SELECT id INTO v_tier FROM hostel_tier_policy
    WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN
    SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1;
  END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

  INSERT INTO hostel_allocation_batches (block_id, category_id, hostel_year_id, status, created_by)
  VALUES (p_block_id, p_category_id, p_hostel_year_id, 'pending_approval', v_actor)
  RETURNING id INTO v_batch;

  FOR cand IN
    SELECT lp.id AS lp_id, p.id AS profile_id, lp.semester_id AS sem_id,
           lp.academic_year_id AS ay_id, lp.institution_id AS inst, lower(trim(p.gender)) AS gender
    FROM learners_profiles lp
    JOIN profiles p ON p.learner_id = lp.id
    LEFT JOIN LATERAL (
      SELECT array_agg(category_id) AS cats
      FROM fn_hostel_learner_room_categories(lp.id)
    ) elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id = p_block_id)
      AND COALESCE(p_category_id = ANY(elig.cats), lp.hostel_category_id = p_category_id)
      AND (v_req_gender IS NULL
           OR (v_req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
           OR (v_req_gender='female' AND lower(trim(p.gender)) IN ('female','f')))
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
      AND EXISTS (SELECT 1 FROM hostel_rooms r
                  WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student')
      -- Stage 0: academic year + current-year bill are mandatory when p_require_bill.
      AND (NOT p_require_bill
           OR (lp.academic_year_id IS NOT NULL
               AND fn_learner_current_year_academic_fee(lp.id) IS NOT NULL))
    ORDER BY lower(coalesce(lp.first_name,'')), lower(coalesce(lp.last_name,'')), lp.id
  LOOP
    v_ay := COALESCE(cand.ay_id,
                     (SELECT id FROM academic_years WHERE institution_id=cand.inst AND is_active ORDER BY start_date DESC LIMIT 1));
    IF v_ay IS NULL THEN v_skip := v_skip + 1; CONTINUE; END IF;

    v_bed := NULL;
    SELECT b.id, r.id INTO v_bed, v_room
    FROM hostel_beds b
    JOIN hostel_rooms r ON r.id=b.room_id
    WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student' AND b.status='available'
      AND fn_room_serves_institution(r.id, cand.inst)
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
      AND fn_learner_strictly_eligible_for_room(cand.lp_id, r.id)
    ORDER BY r.floor, r.room_number, b.bed_number
    LIMIT 1;

    IF v_bed IS NULL THEN v_skip := v_skip + 1; CONTINUE; END IF;

    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
      allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      tier_id, batch_id, allocated_by, warden_id
    ) VALUES (
      cand.inst, cand.profile_id, p_block_id, v_room, v_bed, v_ay, cand.sem_id,
      'fresh', CURRENT_DATE, 'pending_approval', '', '', '',
      v_tier, v_batch, v_actor,
      (SELECT user_id FROM user_block_access WHERE block_id=p_block_id AND revoked_at IS NULL LIMIT 1)
    );
    v_alloc := v_alloc + 1;
  END LOOP;

  UPDATE hostel_allocation_batches
    SET allocated_count = v_alloc, skipped_count = v_skip,
        notes = format('%s allocated into this block, %s skipped (no rule-covered bed / academic year). Cohort = fee-aware eligibility for the category (fail-open to saved category). Excluded: no login profile or gender mismatch.', v_alloc, v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END $function$;

-- 3) Per-learner validation preview. Read-only; no internal auth RAISE (mirrors
--    fn_auto_allocate_preview). Access gated by REVOKE/GRANT + the page nav permission.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_candidates(
  p_block_id uuid, p_category_id uuid, p_require_bill boolean DEFAULT true
)
RETURNS TABLE(
  learner_id uuid,
  full_name text,
  email text,
  program_name text,
  gender text,
  has_profile boolean,
  gender_ok boolean,
  not_allocated boolean,
  physical_rule_ok boolean,
  academic_year_id uuid,
  academic_year_name text,
  academic_bill_count int,
  current_year_bill_count int,
  bill_other_year_name text,
  current_year_fee numeric,
  fee_resolved boolean,
  fee_category_match boolean,
  bill_state text,
  stage text,
  verdict text,
  exclusion_reason text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH cat AS (
    SELECT CASE type WHEN 'boys' THEN 'male' WHEN 'girls' THEN 'female' ELSE NULL END AS req_gender
    FROM hostel_categories WHERE id = p_category_id
  ),
  targeted AS (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id,
           lp.academic_year_id, lp.first_name, lp.last_name, lp.hostel_category_id, lp.program_id AS prog_id,
           elig.cats
    FROM learners_profiles lp
    LEFT JOIN LATERAL (
      SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)
    ) elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id=p_block_id)
      AND COALESCE(p_category_id = ANY(elig.cats), lp.hostel_category_id = p_category_id)
  ),
  base AS (
    SELECT
      t.id AS learner_id,
      COALESCE(p.full_name, p.email, '—') AS full_name,
      p.email,
      prog.program_name,
      lower(trim(p.gender)) AS gender,
      (p.id IS NOT NULL) AS has_profile,
      (cat.req_gender IS NULL
        OR (cat.req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
        OR (cat.req_gender='female' AND lower(trim(p.gender)) IN ('female','f'))) AS gender_ok,
      NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval')) AS not_allocated,
      EXISTS (
        SELECT 1 FROM hostel_room_eligibility_rules r
        WHERE r.is_active AND r.block_id=p_block_id AND r.institution_id=t.institution_id
          AND (r.degree_id     IS NULL OR r.degree_id     = t.degree_id)
          AND (r.department_id IS NULL OR r.department_id = t.department_id)
          AND (r.program_id    IS NULL OR r.program_id    = t.program_id)
          AND (r.semester_id   IS NULL OR r.semester_id   = t.semester_id)
          AND EXISTS (
            SELECT 1 FROM hostel_rooms rm
            WHERE rm.block_id=p_block_id AND rm.category_id=p_category_id AND rm.room_purpose='student'
              AND CASE
                    WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id)
                      THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id AND rr.room_id=rm.id)
                    ELSE (r.floor IS NULL OR r.floor = rm.floor)
                  END
          )
      ) AS physical_rule_ok,
      t.academic_year_id,
      ay.academic_year_name,
      (SELECT count(*)::int FROM billing_student_bills b
         WHERE b.student_id=t.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')) AS academic_bill_count,
      (SELECT count(*)::int FROM billing_student_bills b
         WHERE b.student_id=t.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')
           AND b.academic_year_id = t.academic_year_id) AS current_year_bill_count,
      (SELECT ay2.academic_year_name FROM billing_student_bills b
         JOIN academic_years ay2 ON ay2.id=b.academic_year_id
         WHERE b.student_id=t.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')
           AND b.academic_year_id IS NOT NULL AND b.academic_year_id IS DISTINCT FROM t.academic_year_id
         LIMIT 1) AS bill_other_year_name,
      fn_learner_current_year_academic_fee(t.id) AS current_year_fee,
      (t.cats IS NOT NULL) AS fee_resolved,
      COALESCE(p_category_id = ANY(t.cats), false) AS fee_category_match
    FROM targeted t
    LEFT JOIN profiles p ON p.learner_id = t.id
    LEFT JOIN programs prog ON prog.id = t.prog_id
    LEFT JOIN academic_years ay ON ay.id = t.academic_year_id
    CROSS JOIN cat
  )
  SELECT
    b.learner_id, b.full_name, b.email, b.program_name, b.gender,
    b.has_profile, b.gender_ok, b.not_allocated, b.physical_rule_ok,
    b.academic_year_id, b.academic_year_name,
    b.academic_bill_count, b.current_year_bill_count, b.bill_other_year_name,
    b.current_year_fee, b.fee_resolved, b.fee_category_match,
    CASE
      WHEN b.current_year_bill_count > 0 THEN 'matched'
      WHEN b.bill_other_year_name IS NOT NULL THEN 'different_year'
      WHEN b.academic_bill_count > 0 THEN 'untagged'
      ELSE 'none'
    END AS bill_state,
    CASE
      WHEN p_require_bill AND b.academic_year_id IS NULL THEN 'prerequisite'
      WHEN p_require_bill AND b.current_year_fee IS NULL THEN 'prerequisite'
      WHEN NOT b.has_profile OR NOT b.gender_ok OR NOT b.not_allocated OR NOT b.physical_rule_ok THEN 'eligibility'
      ELSE 'ok'
    END AS stage,
    CASE
      WHEN p_require_bill AND b.academic_year_id IS NULL THEN 'out'
      WHEN p_require_bill AND b.current_year_fee IS NULL THEN 'out'
      WHEN NOT b.has_profile OR NOT b.gender_ok OR NOT b.not_allocated OR NOT b.physical_rule_ok THEN 'out'
      ELSE 'in'
    END AS verdict,
    CASE
      WHEN p_require_bill AND b.academic_year_id IS NULL THEN 'Academic year not set on student profile'
      WHEN p_require_bill AND b.current_year_fee IS NULL THEN
        CASE
          WHEN b.bill_other_year_name IS NOT NULL THEN 'Bill tagged to a different academic year (' || b.bill_other_year_name || ')'
          WHEN b.academic_bill_count > 0 THEN 'Academic bills exist but are not year-tagged'
          ELSE 'No academic bill generated for ' || COALESCE(b.academic_year_name, 'the academic year')
        END
      WHEN NOT b.has_profile THEN 'No login profile'
      WHEN NOT b.gender_ok THEN 'Gender does not match category'
      WHEN NOT b.not_allocated THEN 'Already allocated'
      WHEN NOT b.physical_rule_ok THEN 'No physical-room rule covers this student'
      ELSE NULL
    END AS exclusion_reason
  FROM base b
  ORDER BY b.full_name;
$function$;

-- 4) Grants (anon-not-PUBLIC rule).
REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid, uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid, uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_classic(uuid, uuid, uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_classic(uuid, uuid, uuid, boolean) TO authenticated;
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP tool `mcp__supabase__apply_migration` with:
- `name`: `auto_allocate_candidates_and_bill_gate`
- `query`: the full SQL body from Step 1 (commit the same body to the migrations file — never a `SELECT 1;` placeholder).

- [ ] **Step 3: Verify the functions exist with the new signatures**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc WHERE proname IN ('fn_auto_allocate_candidates','fn_auto_allocate_classic')
ORDER BY proname;
```

Expected: `fn_auto_allocate_candidates(p_block_id uuid, p_category_id uuid, p_require_bill boolean DEFAULT true)` and `fn_auto_allocate_classic(p_block_id uuid, p_category_id uuid, p_hostel_year_id uuid, p_require_bill boolean DEFAULT true)`.

- [ ] **Step 4: Verify the candidate logic against live data (the proof)**

Run via `mcp__supabase__execute_sql` (uses the one institution that has rules configured):

```sql
SELECT verdict, exclusion_reason, count(*)
FROM fn_auto_allocate_candidates(
  (SELECT block_id FROM hostel_room_eligibility_rules WHERE is_active LIMIT 1),
  (SELECT r.category_id FROM hostel_rooms r
     WHERE r.block_id = (SELECT block_id FROM hostel_room_eligibility_rules WHERE is_active LIMIT 1)
       AND r.room_purpose='student' AND r.category_id IS NOT NULL LIMIT 1),
  true)
GROUP BY verdict, exclusion_reason
ORDER BY count(*) DESC;
```

Expected: rows are `verdict='out'` with reasons dominated by *"Academic year not set…"* and *"No academic bill generated…"* / *"…not year-tagged"*; **zero** `verdict='in'` today (matches the spec's "0 reach Stage 1"). Re-run with the 3rd arg `false` (toggle OFF) and confirm some rows flip toward `verdict='in'` (Stage 0 skipped).

- [ ] **Step 5: Mirror the three functions into `supabase/setup/02_functions.sql`**

Append (at the end of the file) the complete `CREATE OR REPLACE` statements for `fn_auto_allocate_classic` (4-arg) and `fn_auto_allocate_candidates` from Step 1, plus the existing `fn_auto_allocate_preview` body below (so all three auto-allocate functions are finally mirrored). Use a section header comment:

```sql
-- ============================================================================
-- Hostel auto-allocation (mirrored 2026-06-08; previously absent from setup)
-- ============================================================================
```

Then paste: (1) the 4-arg `fn_auto_allocate_classic` from Step 1, (2) the `fn_auto_allocate_candidates` from Step 1, and (3) this `fn_auto_allocate_preview`:

```sql
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_preview(p_block_id uuid, p_category_id uuid)
 RETURNS TABLE(cohort_eligible integer, no_profile integer, already_allocated integer, available_beds integer, rules_set boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH cat AS (
    SELECT CASE type WHEN 'boys' THEN 'male' WHEN 'girls' THEN 'female' ELSE NULL END AS req_gender
    FROM hostel_categories WHERE id=p_category_id
  ),
  targeted AS (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id
    FROM learners_profiles lp
    LEFT JOIN LATERAL (
      SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)
    ) elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id=p_block_id)
      AND COALESCE(p_category_id = ANY(elig.cats), lp.hostel_category_id = p_category_id)
  )
  SELECT
    (SELECT count(*)::int
       FROM targeted t JOIN profiles p ON p.learner_id=t.id, cat
       WHERE (cat.req_gender IS NULL
              OR (cat.req_gender='male'   AND lower(trim(p.gender)) IN ('male','m'))
              OR (cat.req_gender='female' AND lower(trim(p.gender)) IN ('female','f')))
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
         AND EXISTS (
           SELECT 1 FROM hostel_room_eligibility_rules r
           WHERE r.is_active AND r.block_id = p_block_id
             AND r.institution_id = t.institution_id
             AND (r.degree_id     IS NULL OR r.degree_id     = t.degree_id)
             AND (r.department_id IS NULL OR r.department_id = t.department_id)
             AND (r.program_id    IS NULL OR r.program_id    = t.program_id)
             AND (r.semester_id   IS NULL OR r.semester_id   = t.semester_id)
             AND EXISTS (
               SELECT 1 FROM hostel_rooms rm
               WHERE rm.block_id = p_block_id AND rm.category_id = p_category_id AND rm.room_purpose='student'
                 AND CASE
                       WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id)
                         THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id AND rr.room_id=rm.id)
                       ELSE (r.floor IS NULL OR r.floor = rm.floor)
                     END
             )
         )),
    (SELECT count(*)::int FROM targeted t WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id=t.id)),
    (SELECT count(*)::int FROM targeted t JOIN profiles p ON p.learner_id=t.id
       WHERE EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM hostel_beds b JOIN hostel_rooms r ON r.id=b.room_id
       WHERE r.block_id=p_block_id AND r.category_id=p_category_id AND r.room_purpose='student' AND b.status='available'
         AND fn_room_has_eligibility_rule(r.id)
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))),
    EXISTS (SELECT 1 FROM hostel_room_eligibility_rules WHERE block_id=p_block_id AND is_active);
$function$;
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260608120000_auto_allocate_candidates_and_bill_gate.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): auto-allocate candidate preview RPC + mandatory bill gate"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `types/allocation-batch.ts`

- [ ] **Step 1: Add the candidate types**

Append to `types/allocation-batch.ts`:

```ts
export type BillState = 'matched' | 'different_year' | 'untagged' | 'none';
export type CandidateStage = 'prerequisite' | 'eligibility' | 'ok';
export type CandidateVerdict = 'in' | 'out';

/** One row from fn_auto_allocate_candidates — a learner's per-condition verdict. */
export interface AllocationCandidate {
  learner_id: string;
  full_name: string;
  email: string | null;
  program_name: string | null;
  gender: string | null;
  has_profile: boolean;
  gender_ok: boolean;
  not_allocated: boolean;
  physical_rule_ok: boolean;
  academic_year_id: string | null;
  academic_year_name: string | null;
  academic_bill_count: number;
  current_year_bill_count: number;
  bill_other_year_name: string | null;
  current_year_fee: number | null;
  fee_resolved: boolean;
  fee_category_match: boolean;
  bill_state: BillState;
  stage: CandidateStage;
  verdict: CandidateVerdict;
  exclusion_reason: string | null;
}
```

- [ ] **Step 2: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `types/allocation-batch.ts`. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add types/allocation-batch.ts
git commit -m "feat(campus-living): AllocationCandidate type for validation preview"
```

---

## Task 3: Service layer

**Files:**
- Modify: `lib/services/campus-living/allocation-batch-service.ts`

- [ ] **Step 1: Import the new type**

In the import block at the top, add `AllocationCandidate` to the type import from `@/types/allocation-batch`:

```ts
import type {
  AllocationBatch,
  AllocationBatchRow,
  AllocatePreview,
  ProposedAllocation,
  AutoCategoryOption,
  AcademicYearOption,
  AllocationCandidate,
} from '@/types/allocation-batch';
```

- [ ] **Step 2: Add `previewCandidates` and extend `generate`**

Replace the existing `generate` method and add `previewCandidates` directly after the `preview` method (around line 50). The new `generate` (note the 4th arg + `p_require_bill`):

```ts
  static async previewCandidates(
    blockId: string,
    categoryId: string,
    requireBill: boolean
  ): Promise<AllocationCandidate[]> {
    const { data, error } = await this.rpcCall('fn_auto_allocate_candidates', {
      p_block_id: blockId,
      p_category_id: categoryId,
      p_require_bill: requireBill,
    });
    if (error) {
      logger.error(LOG, 'previewCandidates failed', error);
      throw new Error(error.message || 'Failed to preview candidates');
    }
    return (Array.isArray(data) ? data : []) as AllocationCandidate[];
  }

  static async generate(
    blockId: string,
    categoryId: string,
    hostelYearId: string,
    requireBill: boolean
  ): Promise<string> {
    const { data, error } = await this.rpcCall('fn_auto_allocate_classic', {
      p_block_id: blockId,
      p_category_id: categoryId,
      p_hostel_year_id: hostelYearId,
      p_require_bill: requireBill,
    });
    if (error) {
      logger.error(LOG, 'generate failed', error);
      throw new Error(error.message || 'Failed to generate allocation batch');
    }
    return data as string;
  }
```

- [ ] **Step 3: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `lib/services/campus-living/allocation-batch-service.ts`. Expected: no errors. (The `generate` caller in the hook is updated in Task 4 — if diagnostics run before Task 4, an arity error there is expected and resolved next.)

- [ ] **Step 4: Commit**

```bash
git add lib/services/campus-living/allocation-batch-service.ts
git commit -m "feat(campus-living): previewCandidates service + requireBill on generate"
```

---

## Task 4: React Query hook

**Files:**
- Modify: `hooks/campus-living/use-allocation-batches.ts`

- [ ] **Step 1: Thread `requireBill` through the generate action**

Replace the `generate` callback inside `useAllocationBatchActions` (lines 56-63):

```ts
  const generate = useCallback(
    async (blockId: string, categoryId: string, hostelYearId: string, requireBill: boolean) => {
      const id = await AllocationBatchService.generate(blockId, categoryId, hostelYearId, requireBill);
      await invalidate();
      return id;
    },
    [invalidate]
  );
```

- [ ] **Step 2: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `hooks/campus-living/use-allocation-batches.ts`. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/campus-living/use-allocation-batches.ts
git commit -m "feat(campus-living): thread requireBill through generate action"
```

---

## Task 5: Candidate validation table component

**Files:**
- Create: `app/(routes)/campus-living/allocations/auto/_components/candidate-validation-table.tsx`

- [ ] **Step 1: Create the component**

Create the file with this exact content:

```tsx
'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Check, X, Minus, Users, BedDouble, AlertTriangle } from 'lucide-react';
import type { AllocationCandidate, BillState } from '@/types/allocation-batch';

function BillBadge({ c }: { c: AllocationCandidate }) {
  const fee =
    c.current_year_fee != null ? ` (₹${Number(c.current_year_fee).toLocaleString('en-IN')})` : '';
  const map: Record<BillState, { label: string; cls: string }> = {
    matched: { label: `Matched${fee}`, cls: 'bg-green-100 text-green-800' },
    different_year: {
      label: `Diff. year${c.bill_other_year_name ? ` (${c.bill_other_year_name})` : ''}`,
      cls: 'bg-amber-100 text-amber-800',
    },
    untagged: { label: 'Untagged', cls: 'bg-amber-100 text-amber-800' },
    none: { label: 'None', cls: 'bg-red-100 text-red-700' },
  };
  const m = map[c.bill_state];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${m.cls}`}>{m.label}</span>;
}

function YesNo({ ok, na }: { ok: boolean; na?: boolean }) {
  if (na) return <Minus className="mx-auto h-4 w-4 text-muted-foreground" />;
  return ok ? (
    <Check className="mx-auto h-4 w-4 text-green-600" />
  ) : (
    <X className="mx-auto h-4 w-4 text-red-600" />
  );
}

function Stat({
  icon,
  label,
  value,
  muted,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${muted ? 'opacity-70' : ''}`}>
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export function CandidateValidationTable({
  candidates,
  availableBeds,
}: {
  candidates: AllocationCandidate[];
  availableBeds: number;
}) {
  const eligible = candidates.filter((c) => c.verdict === 'in').length;
  const excluded = candidates.length - eligible;
  const billReady = candidates.filter((c) => c.current_year_bill_count > 0).length;
  const willPlace = Math.min(eligible, availableBeds);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat icon={<Users className="h-4 w-4" />} label="Eligible" value={eligible} />
        <Stat icon={<BedDouble className="h-4 w-4" />} label="Available beds" value={availableBeds} />
        <Stat label="Will place" value={willPlace} />
        <Stat label="Excluded" value={excluded} muted />
        <Stat label="Bill-ready" value={billReady} muted />
      </div>

      {candidates.length > 0 && billReady === 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No hosteller has a current-year bill tagged</AlertTitle>
          <AlertDescription>
            The fee condition is inactive, so allocation falls back to saved categories. Generate
            current-academic-year bills under{' '}
            <Link
              href="/campus-living/residents?tab=generate"
              className="font-medium underline underline-offset-2"
            >
              Campus Living → Residents → Generate
            </Link>{' '}
            for these students first.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-student validation</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Student</th>
                <th className="px-2">Acad. year</th>
                <th className="px-2 text-center">Bill (curr. yr)</th>
                <th className="px-2 text-center">Profile</th>
                <th className="px-2 text-center">Gender</th>
                <th className="px-2 text-center">Not alloc.</th>
                <th className="px-2 text-center">Phys. rule</th>
                <th className="px-2">Category</th>
                <th className="px-2">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const prereqFail = c.stage === 'prerequisite';
                return (
                  <tr key={c.learner_id} className="border-b align-middle last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{c.full_name}</div>
                      <div className="text-xs text-muted-foreground">{c.program_name ?? '—'}</div>
                    </td>
                    <td className="px-2">
                      {c.academic_year_id ? (
                        c.academic_year_name ?? '—'
                      ) : (
                        <span className="text-red-600">Not set</span>
                      )}
                    </td>
                    <td className="px-2 text-center">
                      <BillBadge c={c} />
                    </td>
                    <td className="px-2 text-center">
                      <YesNo ok={c.has_profile} na={prereqFail} />
                    </td>
                    <td className="px-2 text-center">
                      <YesNo ok={c.gender_ok} na={prereqFail} />
                    </td>
                    <td className="px-2 text-center">
                      <YesNo ok={c.not_allocated} na={prereqFail} />
                    </td>
                    <td className="px-2 text-center">
                      <YesNo ok={c.physical_rule_ok} na={prereqFail} />
                    </td>
                    <td className="px-2 text-xs text-muted-foreground">
                      {prereqFail ? '—' : c.fee_resolved ? 'fee rule' : 'saved (fail-open)'}
                    </td>
                    <td className="px-2">
                      {c.verdict === 'in' ? (
                        <Badge className="bg-green-600 hover:bg-green-600">In</Badge>
                      ) : (
                        <span className="text-xs text-red-600">{c.exclusion_reason}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {candidates.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                    No candidates match this block + category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for the new file. Expected: no errors. (If `@/components/ui/badge` or `alert` paths differ, fix the import to match — both are used elsewhere in the repo.)

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/campus-living/allocations/auto/_components/candidate-validation-table.tsx"
git commit -m "feat(campus-living): candidate validation table component"
```

---

## Task 6: Wire the toggle + table into the Auto-Allocate page

**Files:**
- Modify: `app/(routes)/campus-living/allocations/auto/page.tsx`

- [ ] **Step 1: Update imports**

Add `Switch` and the new component + type; the `AllocatePreview` type import stays (still used for `available_beds`/`rules_set`). After the existing `import { usePermissions } ...` block add:

```tsx
import { Switch } from '@/components/ui/switch';
import { CandidateValidationTable } from './_components/candidate-validation-table';
import type { AllocationCandidate } from '@/types/allocation-batch';
```

- [ ] **Step 2: Replace preview state with candidate state**

Replace these lines:

```tsx
  const [preview, setPreview] = useState<AllocatePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { generate } = useAllocationBatchActions();
```

with:

```tsx
  const [candidates, setCandidates] = useState<AllocationCandidate[] | null>(null);
  const [availableBeds, setAvailableBeds] = useState(0);
  const [requireBill, setRequireBill] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { generate } = useAllocationBatchActions();
```

- [ ] **Step 3: Replace `setPreview(null)` resets with `setCandidates(null)`**

In the three `onValueChange` handlers (Type, Block, Category `Select`s) replace every `setPreview(null)` with `setCandidates(null)`. There are three occurrences (lines ~122, ~132, ~141).

- [ ] **Step 4: Rewrite `runPreview` (two-call: candidates + aggregate beds)**

Replace the `runPreview` function:

```tsx
  const runPreview = async () => {
    if (!blockId || !categoryId || blockMissingRules) return;
    setPreviewing(true);
    setCandidates(null);
    try {
      const [cands, agg] = await Promise.all([
        AllocationBatchService.previewCandidates(blockId, categoryId, requireBill),
        AllocationBatchService.preview(blockId, categoryId),
      ]);
      setCandidates(cands);
      setAvailableBeds(agg.available_beds);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to preview');
    } finally {
      setPreviewing(false);
    }
  };
```

- [ ] **Step 5: Pass `requireBill` to generate**

In `runGenerate`, change the generate call:

```tsx
      const batchId = await generate(blockId, categoryId, yearId, requireBill);
```

- [ ] **Step 6: Add the toggle row above the buttons**

Immediately before the `<div className="flex gap-3">` button row, insert:

```tsx
        <div className="flex items-center gap-2">
          <Switch
            id="require-bill"
            checked={requireBill}
            onCheckedChange={(v) => {
              setRequireBill(v);
              setCandidates(null);
            }}
          />
          <Label htmlFor="require-bill">
            Require current-year bill
            <span className="ml-1 text-xs text-muted-foreground">
              (academic year + matching bill are mandatory)
            </span>
          </Label>
        </div>
```

- [ ] **Step 7: Replace the old preview Card and remove the page-local `Stat`**

Replace the whole `{preview && ( ... )}` block (lines ~199-218) with:

```tsx
        {candidates && (
          <CandidateValidationTable candidates={candidates} availableBeds={availableBeds} />
        )}
```

Then delete the now-unused page-local `Stat` function at the bottom of the file (lines ~224-231) — it moved into the component. Leave the `AllocatePreview` import in place (used by `AllocationBatchService.preview`).

- [ ] **Step 8: Verify diagnostics**

Run `mcp__ide__getDiagnostics` for `app/(routes)/campus-living/allocations/auto/page.tsx`. Expected: no errors and no "unused `Stat`/`AllocatePreview`" warnings.

- [ ] **Step 9: Commit**

```bash
git add "app/(routes)/campus-living/allocations/auto/page.tsx"
git commit -m "feat(campus-living): validation-preview table + require-bill toggle on auto-allocate page"
```

---

## Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Diagnostics sweep**

Run `mcp__ide__getDiagnostics` for all touched TS files:
- `types/allocation-batch.ts`
- `lib/services/campus-living/allocation-batch-service.ts`
- `hooks/campus-living/use-allocation-batches.ts`
- `app/(routes)/campus-living/allocations/auto/_components/candidate-validation-table.tsx`
- `app/(routes)/campus-living/allocations/auto/page.tsx`

Expected: zero errors across all five.

- [ ] **Step 2: Browser pass** (`npm run dev`, log in as a super-admin or a `campus_living.allocations.create` holder)

Navigate to `/campus-living/allocations/auto`:
1. Pick Type → Block (one with rules) → Category → **Preview**.
2. With the toggle **ON** (default): the table lists candidates, most/all `Out` with *"Academic year not set"* or *"No bill generated…"*; the **Bill-ready = 0** banner shows; Stage-1 cells render `—` for prerequisite failures.
3. Toggle **OFF** and Preview again: rows shift toward `In` (Stage 0 skipped), proving the fail-open escape hatch.
4. (Optional, reversible) With toggle ON, click **Generate** → it produces a batch matching the preview's "Will place" count; then **reset** that batch from the batches page to undo.

- [ ] **Step 3: Final commit (if any browser-pass fixes were needed)**

```bash
git add -A
git commit -m "fix(campus-living): auto-allocate validation preview browser-pass adjustments"
```

---

## Self-Review

**Spec coverage:**
- §2.1 Preview + diagnostics only → Tasks 1,5,6 (no bill rewrite). ✅
- §2.2 Academic year mandatory → Task 1 candidate `stage/verdict` + classic WHERE. ✅
- §2.3 Require-bill toggle (default ON) → Task 6 Switch + `p_require_bill` default true. ✅
- §2.4 Two-stage short-circuit → Task 1 CASE priority. ✅
- §2.5 All candidates + verdict → Task 1 `targeted` universe + Task 5 table. ✅
- §2.6 4-state bill indicator → Task 1 `bill_state` + Task 5 `BillBadge`. ✅
- §2.7 Preview = generate → Task 1 classic gate mirrors candidate Stage 0. ✅
- §4.4 SQL hygiene (SECURITY DEFINER, REVOKE anon, mirror setup) → Task 1 Steps 1,5. ✅
- §5 UI (toggle, cards, table, banner) → Tasks 5,6. ✅
- §6 Plumbing (types/service/hook) → Tasks 2,3,4. ✅

**Deviation from spec §4.3:** the page still calls `fn_auto_allocate_preview` — but only for `available_beds` (the candidate fn intentionally returns no global bed scalar). This is a deliberate refinement, documented in Task 6 Step 4.

**Placeholder scan:** none — every code/SQL block is complete.

**Type consistency:** `AllocationCandidate` fields (Task 2) match the RPC `RETURNS TABLE` columns (Task 1) one-for-one; `BillState` union matches the SQL `bill_state` CASE outputs (`matched`/`different_year`/`untagged`/`none`); `generate(blockId, categoryId, hostelYearId, requireBill)` is consistent across service (Task 3), hook (Task 4), and page (Task 6).
```

# Rules-Driven Auto-Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Auto-Allocate fully rules-driven — drop the Category selector; place each learner into their own Category-Eligibility-resolved room category (strict; skip if none) and assign their rules-resolved mess category.

**Architecture:** Rework 3 RPCs to drop `p_category_id` (and `p_require_bill`); make `hostel_allocation_batches.category_id` nullable; update service/hook/types/component/page. No new tables.

**Spec:** `docs/superpowers/specs/2026-06-08-auto-allocate-rules-driven-design.md`

**Verification:** no test runner — `mcp__ide__getDiagnostics` per TS file + live SQL on the RPCs + reversible browser pass.

---

## Task 1: DB migration (RPC rework + nullable batch category)

**File:** Create `supabase/migrations/20260608160000_auto_allocate_rules_driven.sql`; mirror into `supabase/setup/02_functions.sql`.

- [ ] **Step 1: Write the migration** with this exact body:

```sql
-- Rules-driven auto-allocation: drop the single-category model. Each learner is
-- placed into their own Category-Eligibility-resolved room category (strict — no
-- saved-category fallback) and their rules-resolved mess category is written to
-- learners_profiles. Drops p_category_id / p_require_bill from all three RPCs.

-- Batches now span categories (rules-driven) → category_id must be nullable.
ALTER TABLE public.hostel_allocation_batches ALTER COLUMN category_id DROP NOT NULL;

-- Old signatures must be dropped (param list changed).
DROP FUNCTION IF EXISTS public.fn_auto_allocate_classic(uuid, uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.fn_auto_allocate_candidates(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.fn_auto_allocate_preview(uuid, uuid);

-- 1) Generator: strict rules-driven sweep + mess assignment.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_classic(p_block_id uuid, p_hostel_year_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_batch uuid; v_tier uuid; v_actor uuid := auth.uid();
  v_alloc int := 0; v_skip int := 0;
  v_block_type text; v_ay uuid;
  cand record; v_bed uuid; v_room uuid; v_mess uuid;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('campus_living.allocations.create')) THEN
    RAISE EXCEPTION 'Not authorized to run auto-allocation';
  END IF;

  SELECT hostel_type::text INTO v_block_type FROM hostel_blocks WHERE id=p_block_id;
  IF v_block_type IS NULL THEN RAISE EXCEPTION 'Block not found'; END IF;

  IF NOT EXISTS (SELECT 1 FROM hostel_room_eligibility_rules WHERE block_id = p_block_id AND is_active) THEN
    RAISE EXCEPTION 'No physical-room rules are set for this block. Set rules under Program Eligibility -> Physical Rooms before auto-allocating.';
  END IF;

  SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1; END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

  INSERT INTO hostel_allocation_batches (block_id, category_id, hostel_year_id, status, created_by)
  VALUES (p_block_id, NULL, p_hostel_year_id, 'pending_approval', v_actor)
  RETURNING id INTO v_batch;

  FOR cand IN
    SELECT lp.id AS lp_id, p.id AS profile_id, lp.semester_id AS sem_id,
           lp.academic_year_id AS ay_id, lp.institution_id AS inst,
           lower(trim(p.gender)) AS gender,
           room_elig.cats AS room_cats, mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    JOIN profiles p ON p.learner_id = lp.id
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)) room_elig ON true
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_mess_categories(lp.id)) mess_elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id = p_block_id)
      AND room_elig.cats IS NOT NULL  -- STRICT: rules must resolve a room category
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
    ORDER BY lower(coalesce(lp.first_name,'')), lower(coalesce(lp.last_name,'')), lp.id
  LOOP
    v_ay := COALESCE(cand.ay_id, (SELECT id FROM academic_years WHERE institution_id=cand.inst AND is_active ORDER BY start_date DESC LIMIT 1));
    IF v_ay IS NULL THEN v_skip := v_skip + 1; CONTINUE; END IF;

    v_bed := NULL; v_room := NULL;
    SELECT b.id, r.id INTO v_bed, v_room
    FROM hostel_beds b
    JOIN hostel_rooms r ON r.id=b.room_id
    JOIN hostel_categories hc ON hc.id = r.category_id
    WHERE r.block_id=p_block_id AND r.room_purpose='student' AND b.status='available'
      AND r.category_id = ANY(cand.room_cats)
      AND (hc.type IS NULL
           OR (hc.type='boys'  AND cand.gender IN ('male','m'))
           OR (hc.type='girls' AND cand.gender IN ('female','f')))
      AND fn_room_serves_institution(r.id, cand.inst)
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
      AND fn_learner_strictly_eligible_for_room(cand.lp_id, r.id)
    ORDER BY array_position(cand.room_cats, r.category_id), r.floor, r.room_number, b.bed_number
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

    -- Mess category is assigned from rules at proposal time (rules-derived, idempotent); a rejected/reset batch does NOT revert it.
    v_mess := CASE WHEN cand.mess_cats IS NOT NULL THEN cand.mess_cats[1] ELSE NULL END;
    IF v_mess IS NOT NULL THEN
      UPDATE learners_profiles SET mess_category_id = v_mess WHERE id = cand.lp_id;
    END IF;

    v_alloc := v_alloc + 1;
  END LOOP;

  UPDATE hostel_allocation_batches
    SET allocated_count = v_alloc, skipped_count = v_skip,
        notes = format('%s allocated (rules-driven: each learner placed into their Category-Eligibility room category; mess category assigned from rules). %s skipped (no rule-covered bed free / gender / no academic year). Strict: learners with no rule-resolved category (e.g. no current-year bill) are excluded from the cohort.', v_alloc, v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END $function$;

-- 2) Per-learner validation preview (no category input; strict).
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_candidates(p_block_id uuid)
RETURNS TABLE(
  learner_id uuid, full_name text, email text, program_name text, gender text,
  has_profile boolean, gender_ok boolean, not_allocated boolean,
  physical_rule_ok boolean, bed_available boolean,
  academic_year_id uuid, academic_year_name text,
  academic_bill_count integer, current_year_bill_count integer, bill_other_year_name text,
  current_year_fee numeric,
  resolved_room_category_id uuid, resolved_room_category_name text,
  resolved_mess_category_id uuid, resolved_mess_category_name text,
  bill_state text, stage text, verdict text, exclusion_reason text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH cohort AS (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id,
           lp.academic_year_id, lp.first_name, lp.last_name,
           room_elig.cats AS room_cats, mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)) room_elig ON true
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_mess_categories(lp.id)) mess_elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id=p_block_id)
  ),
  base AS (
    SELECT
      c.id AS learner_id,
      COALESCE(p.full_name, p.email, '—') AS full_name,
      p.email, prog.program_name, lower(trim(p.gender)) AS gender,
      (p.id IS NOT NULL) AS has_profile,
      c.academic_year_id, ay.academic_year_name, c.room_cats, c.mess_cats,
      c.room_cats[1] AS resolved_room_category_id, rc.name AS resolved_room_category_name, rc.type AS resolved_room_category_type,
      c.mess_cats[1] AS resolved_mess_category_id, mc.name AS resolved_mess_category_name,
      (SELECT count(*)::int FROM billing_student_bills b WHERE b.student_id=c.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')) AS academic_bill_count,
      (SELECT count(*)::int FROM billing_student_bills b WHERE b.student_id=c.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded') AND b.academic_year_id = c.academic_year_id) AS current_year_bill_count,
      (SELECT ay2.academic_year_name FROM billing_student_bills b JOIN academic_years ay2 ON ay2.id=b.academic_year_id
         WHERE b.student_id=c.id AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')
           AND b.academic_year_id IS NOT NULL AND b.academic_year_id IS DISTINCT FROM c.academic_year_id
         ORDER BY b.created_at DESC LIMIT 1) AS bill_other_year_name,
      fn_learner_current_year_academic_fee(c.id) AS current_year_fee,
      NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval')) AS not_allocated,
      EXISTS (
        SELECT 1 FROM hostel_room_eligibility_rules r
        WHERE r.is_active AND r.block_id=p_block_id AND r.institution_id=c.institution_id
          AND (r.degree_id IS NULL OR r.degree_id=c.degree_id)
          AND (r.department_id IS NULL OR r.department_id=c.department_id)
          AND (r.program_id IS NULL OR r.program_id=c.program_id)
          AND (r.semester_id IS NULL OR r.semester_id=c.semester_id)
          AND EXISTS (SELECT 1 FROM hostel_rooms rm WHERE rm.block_id=p_block_id AND rm.room_purpose='student' AND rm.category_id = ANY(c.room_cats)
                AND CASE WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id)
                      THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id AND rr.room_id=rm.id)
                      ELSE (r.floor IS NULL OR r.floor=rm.floor) END)
      ) AS physical_rule_ok,
      EXISTS (
        SELECT 1 FROM hostel_beds bd JOIN hostel_rooms r ON r.id=bd.room_id
        JOIN hostel_categories hc ON hc.id = r.category_id
        WHERE r.block_id=p_block_id AND r.room_purpose='student' AND bd.status='available'
          AND r.category_id = ANY(c.room_cats)
          AND (hc.type IS NULL
               OR (hc.type='boys'  AND lower(trim(p.gender)) IN ('male','m'))
               OR (hc.type='girls' AND lower(trim(p.gender)) IN ('female','f')))
          AND fn_room_serves_institution(r.id, c.institution_id)
          AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=bd.id AND a.status IN ('active','pending_approval'))
          AND fn_learner_strictly_eligible_for_room(c.id, r.id)
      ) AS bed_available
    FROM cohort c
    LEFT JOIN profiles p ON p.learner_id = c.id
    LEFT JOIN programs prog ON prog.id = c.program_id
    LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
    LEFT JOIN hostel_categories rc ON rc.id = c.room_cats[1]
    LEFT JOIN mess_categories mc ON mc.id = c.mess_cats[1]
  ),
  scored AS (
    SELECT b.*,
      (b.resolved_room_category_type IS NULL
        OR (b.resolved_room_category_type='boys'  AND b.gender IN ('male','m'))
        OR (b.resolved_room_category_type='girls' AND b.gender IN ('female','f'))) AS gender_ok
    FROM base b
  )
  SELECT
    s.learner_id, s.full_name, s.email, s.program_name, s.gender,
    s.has_profile, s.gender_ok, s.not_allocated, s.physical_rule_ok, s.bed_available,
    s.academic_year_id, s.academic_year_name,
    s.academic_bill_count, s.current_year_bill_count, s.bill_other_year_name, s.current_year_fee,
    s.resolved_room_category_id, s.resolved_room_category_name,
    s.resolved_mess_category_id, s.resolved_mess_category_name,
    CASE
      WHEN s.current_year_bill_count > 0 THEN 'matched'
      WHEN s.bill_other_year_name IS NOT NULL THEN 'different_year'
      WHEN s.academic_bill_count > 0 THEN 'untagged'
      ELSE 'none'
    END AS bill_state,
    CASE
      WHEN s.academic_year_id IS NULL THEN 'prerequisite'
      WHEN s.current_year_fee IS NULL THEN 'prerequisite'
      WHEN s.room_cats IS NULL THEN 'prerequisite'
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.not_allocated OR NOT s.physical_rule_ok OR NOT s.bed_available THEN 'eligibility'
      ELSE 'ok'
    END AS stage,
    CASE
      WHEN s.academic_year_id IS NULL THEN 'out'
      WHEN s.current_year_fee IS NULL THEN 'out'
      WHEN s.room_cats IS NULL THEN 'out'
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.not_allocated OR NOT s.physical_rule_ok OR NOT s.bed_available THEN 'out'
      ELSE 'in'
    END AS verdict,
    CASE
      WHEN s.academic_year_id IS NULL THEN 'Academic year not set on student profile'
      WHEN s.current_year_fee IS NULL THEN
        CASE
          WHEN s.bill_other_year_name IS NOT NULL THEN 'Bill tagged to a different academic year (' || s.bill_other_year_name || ')'
          WHEN s.academic_bill_count > 0 THEN 'Academic bills exist but are not year-tagged'
          ELSE 'No academic bill generated for ' || COALESCE(s.academic_year_name, 'the academic year')
        END
      WHEN s.room_cats IS NULL THEN 'No Category-Eligibility rule resolves a room category for this student'
      WHEN NOT s.has_profile THEN 'No login profile'
      WHEN NOT s.gender_ok THEN 'Gender does not match the resolved room category'
      WHEN NOT s.not_allocated THEN 'Already allocated'
      WHEN NOT s.physical_rule_ok THEN 'No physical-room rule covers this student'
      WHEN NOT s.bed_available THEN 'No rule-covered bed free in their resolved category'
      ELSE NULL
    END AS exclusion_reason
  FROM scored s
  ORDER BY s.full_name;
$function$;

-- 3) Aggregate preview (no category input) — beds/rules summary for the page.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_preview(p_block_id uuid)
RETURNS TABLE(cohort_eligible integer, no_profile integer, already_allocated integer, available_beds integer, rules_set boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH cohort AS (
    SELECT lp.id, lp.institution_id,
           (SELECT array_agg(category_id) FROM fn_hostel_learner_room_categories(lp.id)) AS room_cats
    FROM learners_profiles lp
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id=p_block_id)
  )
  SELECT
    (SELECT count(*)::int FROM cohort c JOIN profiles p ON p.learner_id=c.id
       WHERE c.room_cats IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM cohort c WHERE c.room_cats IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id=c.id)),
    (SELECT count(*)::int FROM cohort c JOIN profiles p ON p.learner_id=c.id
       WHERE c.room_cats IS NOT NULL AND EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM hostel_beds b JOIN hostel_rooms r ON r.id=b.room_id
       WHERE r.block_id=p_block_id AND r.room_purpose='student' AND b.status='available'
         AND fn_room_has_eligibility_rule(r.id)
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))),
    EXISTS (SELECT 1 FROM hostel_room_eligibility_rules WHERE block_id=p_block_id AND is_active);
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_preview(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_preview(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_classic(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_classic(uuid, uuid) TO authenticated;
```

- [ ] **Step 2: Apply** via `mcp__supabase__apply_migration` (name `auto_allocate_rules_driven`), commit the identical body to the migrations file.
- [ ] **Step 3: Verify signatures** — `SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname LIKE 'fn_auto_allocate%'`. Expect `_classic(p_block_id uuid, p_hostel_year_id uuid)`, `_candidates(p_block_id uuid)`, `_preview(p_block_id uuid)`; and `hostel_allocation_batches.category_id` now nullable.
- [ ] **Step 4: Verify candidate logic** — run `SELECT verdict, exclusion_reason, count(*) FROM fn_auto_allocate_candidates((SELECT block_id FROM hostel_room_eligibility_rules WHERE is_active LIMIT 1)) GROUP BY 1,2 ORDER BY 3 DESC`. Expect **0 `in`** today; reasons led by "No academic bill…" / "No Category-Eligibility rule resolves a room category…". Confirm `resolved_room_category_name`/`resolved_mess_category_name` are non-null for any learner whose resolver returns a category.
- [ ] **Step 5: Mirror** all three function bodies into `supabase/setup/02_functions.sql` (replace the existing auto-allocate block from the prior migration; keep the section header).
- [ ] **Step 6: Commit** `git add supabase/migrations/20260608160000_auto_allocate_rules_driven.sql supabase/setup/02_functions.sql && git commit -m "feat(campus-living): rules-driven auto-allocation RPCs (drop category, assign mess)"`

---

## Task 2: Types + Service + Hook

**Files:** `types/allocation-batch.ts`, `lib/services/campus-living/allocation-batch-service.ts`, `hooks/campus-living/use-allocation-batches.ts`

- [ ] **Step 1: Type** — in `types/allocation-batch.ts`, replace the `AllocationCandidate` fields `fee_resolved`/`fee_category_match` with the resolved-category fields and add `bed_available`:

```ts
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
  bed_available: boolean;
  academic_year_id: string | null;
  academic_year_name: string | null;
  academic_bill_count: number;
  current_year_bill_count: number;
  bill_other_year_name: string | null;
  current_year_fee: number | null;
  resolved_room_category_id: string | null;
  resolved_room_category_name: string | null;
  resolved_mess_category_id: string | null;
  resolved_mess_category_name: string | null;
  bill_state: BillState;
  stage: CandidateStage;
  verdict: CandidateVerdict;
  exclusion_reason: string | null;
}
```

- [ ] **Step 2: Service** — in `allocation-batch-service.ts`, drop `categoryId`/`requireBill` args:

```ts
  static async preview(blockId: string): Promise<AllocatePreview> {
    const { data, error } = await this.rpcCall('fn_auto_allocate_preview', { p_block_id: blockId });
    if (error) { logger.error(LOG, 'preview failed', error); throw new Error(error.message || 'Failed to preview allocation'); }
    const row = Array.isArray(data) ? data[0] : data;
    return (row ?? { cohort_eligible: 0, no_profile: 0, already_allocated: 0, available_beds: 0, rules_set: false }) as AllocatePreview;
  }

  static async previewCandidates(blockId: string): Promise<AllocationCandidate[]> {
    const { data, error } = await this.rpcCall('fn_auto_allocate_candidates', { p_block_id: blockId });
    if (error) { logger.error(LOG, 'previewCandidates failed', error); throw new Error(error.message || 'Failed to preview candidates'); }
    return (Array.isArray(data) ? data : []) as AllocationCandidate[];
  }

  static async generate(blockId: string, hostelYearId: string): Promise<string> {
    const { data, error } = await this.rpcCall('fn_auto_allocate_classic', { p_block_id: blockId, p_hostel_year_id: hostelYearId });
    if (error) { logger.error(LOG, 'generate failed', error); throw new Error(error.message || 'Failed to generate allocation batch'); }
    return data as string;
  }
```

- [ ] **Step 3: Hook** — in `use-allocation-batches.ts`, the `generate` action:

```ts
  const generate = useCallback(
    async (blockId: string, hostelYearId: string) => {
      const id = await AllocationBatchService.generate(blockId, hostelYearId);
      await invalidate();
      return id;
    },
    [invalidate]
  );
```

- [ ] **Step 4:** `mcp__ide__getDiagnostics` on the 3 files (page error from arg-count is expected until Task 4). Commit: `feat(campus-living): rules-driven allocation service/hook/types`.

---

## Task 3: Candidate validation table — Room/Mess category columns

**File:** `app/(routes)/campus-living/allocations/auto/_components/candidate-validation-table.tsx`

- [ ] **Step 1:** Replace the single "Category" `<th>`/cell (the `fee_resolved ? 'fee rule' : 'saved (fail-open)'` provenance) with two columns:

```tsx
                <th className="px-2">Room cat.</th>
                <th className="px-2">Mess cat.</th>
```

and the matching cells (replace the old Category `<td>`):

```tsx
                    <td className="px-2 text-xs">{c.resolved_room_category_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2 text-xs">{c.resolved_mess_category_name ?? <span className="text-muted-foreground">—</span>}</td>
```

Update the empty-state `colSpan` from `9` to `10` (one net column added). Keep summary cards + bill badge + verdict; `billReady`/`eligible`/`excluded` math unchanged.

- [ ] **Step 2:** `getDiagnostics` clean; commit `feat(campus-living): show resolved room/mess category in validation table`.

---

## Task 4: Auto-Allocate page — drop Category + toggle

**File:** `app/(routes)/campus-living/allocations/auto/page.tsx`

- [ ] **Step 1:** Remove `useAutoCategories` import/use, the `categoryId` + `requireBill` state, the **Category** `Select`, and the **Require current-year bill** `Switch` (+ its `Switch`/`Label` import if now unused — `Label` still used by other fields). Keep Type (filters blocks) + Block + Hostel Year.
- [ ] **Step 2:** `runPreview`: `const [cands, agg] = await Promise.all([AllocationBatchService.previewCandidates(blockId), AllocationBatchService.preview(blockId)]);` (drop categoryId). Gate on `blockId` only (remove `categoryId` from guards). `runGenerate`: `generate(blockId, yearId)`.
- [ ] **Step 3:** Title `Auto-Allocate (Classic)` → `Auto-Allocate`; update intro copy to "places each unallocated hostelite into the room category the Category Eligibility rules resolve for them (and assigns their mess category); students with no rule-resolved category are skipped."
- [ ] **Step 4:** `getDiagnostics` clean on the page (and re-run on the service file — the expected arg-count error should be gone). Commit `feat(campus-living): rules-driven Auto-Allocate page (no category selector)`.

---

## Self-Review
- Spec §2 decisions 1–7 → Task 1 (RPCs) + Task 4 (page). ✅
- Mess assignment (decision 3) → Task 1 generator `UPDATE learners_profiles`. ✅
- Strict (decision 2) → `room_elig.cats IS NOT NULL` filter + `room_cats IS NULL → out`. ✅
- Nullable batch category → Task 1 ALTER. ✅
- Preview=generate → candidate `bed_available`/gender/rule logic mirrors generator's bed query. ✅
- Type/service/hook/component/page → Tasks 2–4. ✅
- Placeholder scan: none. Type names (`resolved_*`, `bed_available`) consistent across Task 1 RETURNS TABLE ↔ Task 2 type ↔ Task 3 component.

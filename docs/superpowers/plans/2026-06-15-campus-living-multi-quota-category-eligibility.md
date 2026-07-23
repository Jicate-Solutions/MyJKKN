# Multi-Quota Category Eligibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one Campus Living *Category Eligibility* rule apply to several quotas by replacing the scalar `quota_id` with an array `quota_ids uuid[]`, end to end (DB → resolver functions → types → service → form → table/filters).

**Architecture:** `hostel_program_eligibility.quota_id uuid` (FK) becomes `quota_ids uuid[]` (nullable; `NULL` = any quota). A `BEFORE INSERT/UPDATE` trigger replaces the dropped FK by validating + canonicalising (de-dupe + sort) the array. The three read-side functions that match a learner's quota switch their predicate from `quota_id = p_quota OR quota_id IS NULL` to `quota_ids IS NULL OR p_quota = ANY(quota_ids)`, preserving the `program×4 + quota×2 + fee×1` specificity ordering. The form gets a Command+Popover+Badge multi-select; the table renders quota chips.

**Tech Stack:** PostgreSQL (Supabase, RLS), Next.js 16 App Router, React 19, TanStack Query, TypeScript (strict off), Shadcn UI. **No test runner exists** (per CLAUDE.md) — verification is SQL assertions via the Supabase MCP, `mcp__ide__getDiagnostics` per file, and a browser smoke.

**Reference spec:** `docs/superpowers/specs/2026-06-15-campus-living-multi-quota-category-eligibility-design.md`

**Conventions for this repo:**
- Apply SQL with the Supabase MCP `apply_migration` (name = the migration filename without extension), **and** commit the identical body to `supabase/migrations/`, **and** mirror into `supabase/setup/01_tables.sql` + `02_functions.sql`. Never leave a `SELECT 1;` placeholder.
- `hostel_program_eligibility` is **not** in `types/supabase.ts` (the service uses `this.supabase as any`) — do **not** edit `types/supabase.ts`.
- Verify a TS/TSX file with `mcp__ide__getDiagnostics` (fast), never full `tsc`.

---

## Task 1: Database migration — array column, trigger, indexes, resolver functions

This is one atomic migration (single-cutover: the live app reads `quota_id`, so DB + frontend ship together). Author the full body, apply once, verify, mirror, commit.

**Files:**
- Create: `supabase/migrations/20260615120000_hostel_program_eligibility_multi_quota.sql`
- Modify: `supabase/setup/01_tables.sql` (mirror column + drop FK line)
- Modify: `supabase/setup/02_functions.sql` (mirror the new trigger fn + 3 replaced fns)

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260615120000_hostel_program_eligibility_multi_quota.sql` with this exact body:

```sql
-- Multi-quota Category Eligibility: hostel_program_eligibility.quota_id -> quota_ids uuid[]
-- One rule can now apply to several quotas. quota_ids IS NULL keeps meaning "any quota".
-- Spec: docs/superpowers/specs/2026-06-15-campus-living-multi-quota-category-eligibility-design.md

-- ── 1. Array column + backfill from the scalar ───────────────────────────────
ALTER TABLE public.hostel_program_eligibility ADD COLUMN quota_ids uuid[];

UPDATE public.hostel_program_eligibility
SET quota_ids = CASE WHEN quota_id IS NULL THEN NULL ELSE ARRAY[quota_id] END;

-- ── 2. Drop the FK + scalar column (arrays cannot carry a foreign key) ────────
ALTER TABLE public.hostel_program_eligibility
  DROP CONSTRAINT IF EXISTS hostel_program_eligibility_quota_id_fkey;
ALTER TABLE public.hostel_program_eligibility DROP COLUMN quota_id;

-- ── 3. Normalization + validation trigger (replaces the dropped FK) ───────────
-- Empty array -> NULL; de-dupe + sort ascending (canonical form so the unique
-- index is order-insensitive); reject any element that is not a real quota.
CREATE OR REPLACE FUNCTION public.fn_prog_elig_normalize_quotas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_clean uuid[];
  v_bad uuid;
BEGIN
  IF NEW.quota_ids IS NULL OR cardinality(NEW.quota_ids) = 0 THEN
    NEW.quota_ids := NULL;
    RETURN NEW;
  END IF;

  SELECT array_agg(q ORDER BY q) INTO v_clean
  FROM (SELECT DISTINCT unnest(NEW.quota_ids) AS q) s;

  SELECT v INTO v_bad
  FROM unnest(v_clean) AS v
  WHERE NOT EXISTS (SELECT 1 FROM public.quotas WHERE id = v);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'quota_ids contains a non-existent quota id: %', v_bad
      USING ERRCODE = '23503';
  END IF;

  NEW.quota_ids := v_clean;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prog_elig_normalize_quotas ON public.hostel_program_eligibility;
CREATE TRIGGER trg_prog_elig_normalize_quotas
  BEFORE INSERT OR UPDATE ON public.hostel_program_eligibility
  FOR EACH ROW EXECUTE FUNCTION public.fn_prog_elig_normalize_quotas();

-- ── 4. Rebuild indexes to use the array column ───────────────────────────────
DROP INDEX IF EXISTS public.uq_prog_elig_band;
CREATE UNIQUE INDEX uq_prog_elig_band ON public.hostel_program_eligibility
USING btree (
  institution_id,
  COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(quota_ids, '{}'::uuid[]),
  COALESCE(fee_min, ('-1'::integer)::numeric),
  COALESCE(fee_max, ('-1'::integer)::numeric),
  hostel_type
);

DROP INDEX IF EXISTS public.idx_prog_elig_resolve;
CREATE INDEX idx_prog_elig_resolve ON public.hostel_program_eligibility
USING btree (institution_id, program_id, is_active);

CREATE INDEX IF NOT EXISTS idx_prog_elig_quota_ids
  ON public.hostel_program_eligibility USING gin (quota_ids);

-- ── 5. Resolver: effective ROOM categories (array predicate + specificity) ────
CREATE OR REPLACE FUNCTION public.fn_hostel_effective_room_categories(p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric, p_gender text DEFAULT NULL::text)
 RETURNS TABLE(category_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT e.room_category_id AS cat,
           e.program_id, e.quota_ids, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_ids  IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND e.room_category_id IS NOT NULL
      AND (p_gender IS NULL OR e.hostel_type = 'both' OR e.hostel_type = p_gender)
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_ids IS NULL OR p_quota = ANY(e.quota_ids))
      AND (e.fee_min IS NULL OR p_fee >= e.fee_min)
      AND (e.fee_max IS NULL OR p_fee <  e.fee_max)
  ),
  winner AS (
    SELECT program_id, quota_ids, fee_min, fee_max
    FROM candidates
    ORDER BY specificity DESC,
             (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT c.cat
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_ids  IS NOT DISTINCT FROM w.quota_ids
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max;
$function$;

-- ── 6. Resolver: effective MESS categories (array predicate + specificity) ────
CREATE OR REPLACE FUNCTION public.fn_hostel_effective_mess_categories(p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric, p_gender text DEFAULT NULL::text)
 RETURNS TABLE(category_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT e.mess_category_id AS cat,
           e.program_id, e.quota_ids, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_ids  IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND e.mess_category_id IS NOT NULL
      AND (p_gender IS NULL OR e.hostel_type = 'both' OR e.hostel_type = p_gender)
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_ids IS NULL OR p_quota = ANY(e.quota_ids))
      AND (e.fee_min IS NULL OR p_fee >= e.fee_min)
      AND (e.fee_max IS NULL OR p_fee <  e.fee_max)
  ),
  winner AS (
    SELECT program_id, quota_ids, fee_min, fee_max
    FROM candidates
    ORDER BY specificity DESC,
             (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT c.cat
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_ids  IS NOT DISTINCT FROM w.quota_ids
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max;
$function$;

-- ── 7. Allocation explainer (array predicate + specificity + name display) ────
CREATE OR REPLACE FUNCTION public.fn_explain_allocation(p_allocation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile uuid; v_room uuid; v_block uuid; v_floor int; v_room_cat uuid;
  v_room_number text; v_status text; v_room_cat_name text; v_room_cat_type text;
  v_lp uuid; v_inst uuid; v_degree uuid; v_dept uuid; v_program uuid; v_semester uuid; v_ay uuid;
  v_quota uuid; v_gender text;
  v_inst_name text; v_degree_name text; v_dept_name text; v_program_name text;
  v_semester_name text; v_quota_name text;
  v_room_cats uuid[]; v_mess_cats uuid[];
  v_resolved_room_name text; v_resolved_mess_name text;
  v_fee numeric; v_ay_name text;
  v_has_covering boolean; v_matched boolean; v_rules jsonb;
  v_pinned boolean; v_pinned_blocks text; v_pinned_rules jsonb;
  v_serves boolean; v_cur_bill int; v_acad_bill int;
  v_elig_rules jsonb; v_bills jsonb;
BEGIN
  SELECT a.learner_id, a.room_id, a.status, r.room_number, r.block_id, r.floor, r.category_id
    INTO v_profile, v_room, v_status, v_room_number, v_block, v_floor, v_room_cat
    FROM hostel_allocations a LEFT JOIN hostel_rooms r ON r.id = a.room_id
    WHERE a.id = p_allocation_id;
  IF v_profile IS NULL THEN RETURN jsonb_build_object('error','allocation_not_found'); END IF;

  SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id,
         lp.academic_year_id, lp.quota_id
    INTO v_lp, v_inst, v_degree, v_dept, v_program, v_semester, v_ay, v_quota
    FROM profiles p JOIN learners_profiles lp ON lp.id = p.learner_id
    WHERE p.id = v_profile;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE id = v_profile;
  SELECT name, type INTO v_room_cat_name, v_room_cat_type FROM hostel_categories WHERE id = v_room_cat;

  SELECT name INTO v_inst_name FROM institutions WHERE id = v_inst;
  SELECT degree_name INTO v_degree_name FROM degrees WHERE id = v_degree;
  SELECT department_name INTO v_dept_name FROM departments WHERE id = v_dept;
  SELECT program_name INTO v_program_name FROM programs WHERE id = v_program;
  SELECT semester_name INTO v_semester_name FROM semesters WHERE id = v_semester;
  SELECT name INTO v_quota_name FROM quotas WHERE id = v_quota;

  SELECT array_agg(category_id) INTO v_room_cats FROM fn_hostel_learner_room_categories(v_lp);
  SELECT array_agg(category_id) INTO v_mess_cats FROM fn_hostel_learner_mess_categories(v_lp);
  SELECT name INTO v_resolved_room_name FROM hostel_categories WHERE id = v_room_cats[1];
  SELECT name INTO v_resolved_mess_name FROM mess_categories WHERE id = v_mess_cats[1];
  v_fee := fn_learner_current_year_academic_fee(v_lp);
  SELECT academic_year_name INTO v_ay_name FROM academic_years WHERE id = v_ay;
  v_serves := fn_room_serves_institution(v_room, v_inst);

  WITH rules AS (
    SELECT e.*,
           COALESCE(e.program_id IS NULL OR e.program_id = v_program, false) AS program_ok,
           COALESCE(e.quota_ids IS NULL OR v_quota = ANY(e.quota_ids), false) AS quota_ok,
           (v_fee IS NOT NULL
              AND (e.fee_min IS NULL OR v_fee >= e.fee_min)
              AND (e.fee_max IS NULL OR v_fee <  e.fee_max)) AS fee_ok,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_ids  IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = v_inst AND e.is_active
  ),
  room_winner AS (
    SELECT program_id, quota_ids, fee_min, fee_max FROM rules
    WHERE room_category_id IS NOT NULL AND program_ok AND quota_ok AND fee_ok
    ORDER BY specificity DESC, (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  ),
  mess_winner AS (
    SELECT program_id, quota_ids, fee_min, fee_max FROM rules
    WHERE mess_category_id IS NOT NULL AND program_ok AND quota_ok AND fee_ok
    ORDER BY specificity DESC, (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT jsonb_agg(jsonb_build_object(
      'program', (SELECT program_name FROM programs WHERE id = r.program_id),
      'quota',   (SELECT string_agg(name, ', ' ORDER BY name) FROM quotas WHERE id = ANY(r.quota_ids)),
      'fee_min', r.fee_min,
      'fee_max', r.fee_max,
      'room_category', (SELECT name FROM hostel_categories WHERE id = r.room_category_id),
      'mess_category', (SELECT name FROM mess_categories  WHERE id = r.mess_category_id),
      'program_ok', r.program_ok,
      'quota_ok',   r.quota_ok,
      'fee_ok',     r.fee_ok,
      'matched',    (r.program_ok AND r.quota_ok AND r.fee_ok),
      'selected_room', (r.room_category_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM room_winner w
        WHERE r.program_id IS NOT DISTINCT FROM w.program_id
          AND r.quota_ids  IS NOT DISTINCT FROM w.quota_ids
          AND r.fee_min    IS NOT DISTINCT FROM w.fee_min
          AND r.fee_max    IS NOT DISTINCT FROM w.fee_max)),
      'selected_mess', (r.mess_category_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM mess_winner w
        WHERE r.program_id IS NOT DISTINCT FROM w.program_id
          AND r.quota_ids  IS NOT DISTINCT FROM w.quota_ids
          AND r.fee_min    IS NOT DISTINCT FROM w.fee_min
          AND r.fee_max    IS NOT DISTINCT FROM w.fee_max))
    ) ORDER BY (r.program_ok AND r.quota_ok AND r.fee_ok) DESC, r.specificity DESC,
               r.fee_min ASC NULLS FIRST)
  INTO v_elig_rules
  FROM rules r;

  SELECT jsonb_agg(jsonb_build_object(
      'description', b.bill_description,
      'amount', b.final_amount,
      'status', b.status,
      'due_date', b.due_date,
      'academic_year', (SELECT academic_year_name FROM academic_years WHERE id = b.academic_year_id),
      'counted', (COALESCE(b.status NOT IN ('cancelled','superseded'), false)
                  AND b.academic_year_id IS NOT NULL
                  AND b.academic_year_id IS NOT DISTINCT FROM v_ay)
    ) ORDER BY b.due_date DESC)
  INTO v_bills
  FROM billing_student_bills b
  WHERE b.student_id = v_lp AND b.fee_source = 'academic';

  WITH covering AS (
    SELECT r.* FROM hostel_room_eligibility_rules r
    WHERE r.is_active AND r.block_id = v_block
      AND CASE
            WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id)
              THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id AND rr.room_id=v_room)
            ELSE (r.floor IS NULL OR r.floor = v_floor)
          END
  )
  SELECT
    EXISTS (SELECT 1 FROM covering),
    EXISTS (SELECT 1 FROM covering c WHERE c.institution_id=v_inst
              AND (c.degree_id     IS NULL OR c.degree_id     = v_degree)
              AND (c.department_id IS NULL OR c.department_id = v_dept)
              AND (c.program_id    IS NULL OR c.program_id    = v_program)
              AND (c.semester_id   IS NULL OR c.semester_id   = v_semester)),
    (SELECT jsonb_agg(jsonb_build_object(
       'rule_name', COALESCE(NULLIF(btrim(c.rule_name),''),'(unnamed rule)'),
       'floor', c.floor,
       'matched', COALESCE((c.institution_id=v_inst
              AND (c.degree_id     IS NULL OR c.degree_id     = v_degree)
              AND (c.department_id IS NULL OR c.department_id = v_dept)
              AND (c.program_id    IS NULL OR c.program_id    = v_program)
              AND (c.semester_id   IS NULL OR c.semester_id   = v_semester)), false),
       'cohort', NULLIF(concat_ws(' · ',
         (SELECT degree_name     FROM degrees     WHERE id=c.degree_id),
         (SELECT department_name FROM departments WHERE id=c.department_id),
         (SELECT program_name    FROM programs    WHERE id=c.program_id),
         (SELECT semester_name   FROM semesters   WHERE id=c.semester_id)),''),
       'institution',    (SELECT name FROM institutions WHERE id=c.institution_id),
       'institution_ok', COALESCE(c.institution_id = v_inst, false),
       'degree',         (SELECT degree_name FROM degrees WHERE id=c.degree_id),
       'degree_ok',      COALESCE((c.degree_id IS NULL OR c.degree_id = v_degree), false),
       'department',     (SELECT department_name FROM departments WHERE id=c.department_id),
       'department_ok',  COALESCE((c.department_id IS NULL OR c.department_id = v_dept), false),
       'program',        (SELECT program_name FROM programs WHERE id=c.program_id),
       'program_ok',     COALESCE((c.program_id IS NULL OR c.program_id = v_program), false),
       'semester',       (SELECT semester_name FROM semesters WHERE id=c.semester_id),
       'semester_ok',    COALESCE((c.semester_id IS NULL OR c.semester_id = v_semester), false)
     ) ORDER BY c.rule_name) FROM covering c)
  INTO v_has_covering, v_matched, v_rules;

  SELECT EXISTS (
    SELECT 1 FROM hostel_room_eligibility_rules r
    WHERE r.is_active
      AND r.institution_id = v_inst
      AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
      AND (r.department_id IS NULL OR r.department_id = v_dept)
      AND (r.program_id    IS NULL OR r.program_id    = v_program)
      AND (r.semester_id   IS NULL OR r.semester_id   = v_semester)
  ),
  (SELECT string_agg(DISTINCT hb.name, ', ')
     FROM hostel_room_eligibility_rules r
     JOIN hostel_blocks hb ON hb.id = r.block_id
     WHERE r.is_active
       AND r.institution_id = v_inst
       AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
       AND (r.department_id IS NULL OR r.department_id = v_dept)
       AND (r.program_id    IS NULL OR r.program_id    = v_program)
       AND (r.semester_id   IS NULL OR r.semester_id   = v_semester))
  INTO v_pinned, v_pinned_blocks;

  SELECT jsonb_agg(jsonb_build_object(
      'block', hb.name,
      'rule_name', COALESCE(NULLIF(btrim(r.rule_name),''),'(unnamed rule)'),
      'floor', r.floor,
      'rooms', (SELECT count(*)::int FROM hostel_room_eligibility_rule_rooms rr WHERE rr.rule_id=r.id),
      'institution', (SELECT name FROM institutions WHERE id=r.institution_id),
      'degree',      (SELECT degree_name FROM degrees WHERE id=r.degree_id),
      'department',  (SELECT department_name FROM departments WHERE id=r.department_id),
      'program',     (SELECT program_name FROM programs WHERE id=r.program_id),
      'semester',    (SELECT semester_name FROM semesters WHERE id=r.semester_id),
      'covers_allocated_room', (r.block_id = v_block)
    ) ORDER BY hb.name)
  INTO v_pinned_rules
  FROM hostel_room_eligibility_rules r
  JOIN hostel_blocks hb ON hb.id = r.block_id
  WHERE r.is_active
    AND r.institution_id = v_inst
    AND (r.degree_id     IS NULL OR r.degree_id     = v_degree)
    AND (r.department_id IS NULL OR r.department_id = v_dept)
    AND (r.program_id    IS NULL OR r.program_id    = v_program)
    AND (r.semester_id   IS NULL OR r.semester_id   = v_semester);

  SELECT count(*)::int INTO v_acad_bill FROM billing_student_bills b
    WHERE b.student_id=v_lp AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded');
  SELECT count(*)::int INTO v_cur_bill FROM billing_student_bills b
    WHERE b.student_id=v_lp AND b.fee_source='academic' AND b.status NOT IN ('cancelled','superseded')
      AND b.academic_year_id=v_ay;

  RETURN jsonb_build_object(
    'allocation_id', p_allocation_id, 'room_number', v_room_number, 'status', v_status,
    'learner', jsonb_build_object(
      'institution', v_inst_name,
      'degree', v_degree_name,
      'department', v_dept_name,
      'program', v_program_name,
      'semester', v_semester_name,
      'quota', v_quota_name,
      'academic_year', v_ay_name,
      'academic_fee', v_fee,
      'gender', v_gender
    ),
    'eligibility_rules', COALESCE(v_elig_rules, '[]'::jsonb),
    'category', jsonb_build_object(
      'allocated_room_category', v_room_cat_name,
      'resolved_room_category', v_resolved_room_name,
      'room_category_matched', (v_room_cat = ANY(COALESCE(v_room_cats,'{}'::uuid[]))),
      'resolved_mess_category', v_resolved_mess_name,
      'academic_year', v_ay_name,
      'academic_fee', v_fee,
      'gender', v_gender,
      'gender_ok', (v_room_cat_type IS NULL
                    OR (v_room_cat_type='boys'  AND v_gender IN ('male','m'))
                    OR (v_room_cat_type='girls' AND v_gender IN ('female','f')))
    ),
    'physical', jsonb_build_object(
      'institution_served', v_serves,
      'is_rule_covered', v_has_covering,
      'rule_matched', v_matched,
      'open_room', NOT v_has_covering,
      'pinned_elsewhere', (v_pinned AND NOT v_matched),
      'pinned_blocks', v_pinned_blocks,
      'pinned_rules', COALESCE(v_pinned_rules, '[]'::jsonb),
      'access_ok', (v_matched OR (NOT v_has_covering AND NOT v_pinned)),
      'covering_rules', COALESCE(v_rules, '[]'::jsonb)
    ),
    'bill', jsonb_build_object('current_year_bills', v_cur_bill, 'academic_bills', v_acad_bill),
    'bills', COALESCE(v_bills, '[]'::jsonb)
  );
END $function$;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` with `name: "20260615120000_hostel_program_eligibility_multi_quota"` and the body from Step 1.
Expected: success, no error.

- [ ] **Step 3: Verify the schema change**

Run via Supabase MCP `execute_sql`:
```sql
SELECT
  (SELECT data_type FROM information_schema.columns
     WHERE table_name='hostel_program_eligibility' AND column_name='quota_ids') AS quota_ids_type,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='hostel_program_eligibility' AND column_name='quota_id') AS old_col_present,
  (SELECT count(*) FROM hostel_program_eligibility WHERE cardinality(quota_ids) >= 1) AS rows_with_quota,
  (SELECT indexdef FROM pg_indexes WHERE indexname='uq_prog_elig_band') AS uq_def;
```
Expected: `quota_ids_type = 'ARRAY'`, `old_col_present = 0`, `rows_with_quota = 1`, `uq_def` contains `COALESCE(quota_ids,`.

- [ ] **Step 4: Verify the trigger rejects a bad quota id and canonicalises**

Run via `execute_sql` (wrapped so nothing persists):
```sql
DO $$
DECLARE v_inst uuid; v_room uuid; v_err text;
BEGIN
  SELECT institution_id, room_category_id INTO v_inst, v_room
  FROM hostel_program_eligibility LIMIT 1;
  BEGIN
    INSERT INTO hostel_program_eligibility (institution_id, quota_ids, room_category_id, hostel_type)
    VALUES (v_inst, ARRAY['00000000-0000-0000-0000-000000000000'::uuid], v_room, 'both');
    RAISE EXCEPTION 'TEST FAILED: bad quota id was accepted';
  EXCEPTION WHEN sqlstate '23503' THEN
    RAISE NOTICE 'OK: bad quota id rejected';
  END;
  RAISE EXCEPTION 'rollback test';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'rollback test' THEN RAISE; END IF;
END $$;
```
Expected: completes with NOTICE "OK: bad quota id rejected" (the final `rollback test` raise is swallowed and discards the transaction's writes).

- [ ] **Step 5: Verify the resolver still resolves the pre-existing quota rule**

Run via `execute_sql`:
```sql
WITH r AS (
  SELECT institution_id, program_id, quota_ids[1] AS q, room_category_id,
         COALESCE(fee_min, 0) AS f
  FROM hostel_program_eligibility
  WHERE quota_ids IS NOT NULL AND room_category_id IS NOT NULL
  LIMIT 1
)
SELECT r.room_category_id AS expected,
       (SELECT category_id FROM fn_hostel_effective_room_categories(
          r.institution_id, r.program_id, r.q, r.f, NULL) LIMIT 1) AS resolved
FROM r;
```
Expected: `expected = resolved` (the quota learner still maps to the rule's room category).

- [ ] **Step 6: Mirror into `supabase/setup/`**

In `supabase/setup/01_tables.sql`: find the `hostel_program_eligibility` `CREATE TABLE`, change the `quota_id uuid` column to `quota_ids uuid[]`, and remove the `quota_id` FK reference line. Update the `uq_prog_elig_band` / `idx_prog_elig_resolve` definitions and add `idx_prog_elig_quota_ids` to match Step 1.
In `supabase/setup/02_functions.sql`: add `fn_prog_elig_normalize_quotas` (+ its trigger) and replace the three function bodies (`fn_hostel_effective_room_categories`, `fn_hostel_effective_mess_categories`, `fn_explain_allocation`) with the Step 1 versions.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260615120000_hostel_program_eligibility_multi_quota.sql supabase/setup/01_tables.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): hostel_program_eligibility quota_id -> quota_ids[] (DB)

Add quota_ids uuid[], backfill, drop FK, add normalize/validate trigger,
rebuild indexes, and switch the 3 resolver functions to ANY(quota_ids).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Types — `quota_id` → `quota_ids`, `quota_name` → `quota_names`

**Files:**
- Modify: `types/program-eligibility.ts`

- [ ] **Step 1: Update the header comment + interfaces**

In `types/program-eligibility.ts`, change the top comment line `quota_id === null => any quota.` to `quota_ids === null => any quota.`

In `interface ProgramEligibility`, replace:
```typescript
  quota_id: string | null;
```
with:
```typescript
  quota_ids: string[] | null;
```

In `interface ProgramEligibilityRow`, replace:
```typescript
  quota_name: string | null; // null => any quota
```
with:
```typescript
  quota_names: string[]; // [] => any quota; aligned 1:1 with quota_ids
```

In `interface CreateProgramEligibilityDto`, replace:
```typescript
  quota_id?: string | null;
```
with:
```typescript
  quota_ids?: string[] | null;
```

In `interface UpdateProgramEligibilityDto`, replace:
```typescript
  quota_id?: string | null;
```
with:
```typescript
  quota_ids?: string[] | null;
```

> Leave `CategorySyncPreviewRow.quota_name` untouched — that is the *learner's* single quota, unrelated to the rule's quota set.

- [ ] **Step 2: Verify diagnostics**

Run `mcp__ide__getDiagnostics` on `types/program-eligibility.ts`.
Expected: no new errors in this file (consumers are fixed in Tasks 3–6; cross-file errors there are expected until then).

- [ ] **Step 3: Commit**

```bash
git add types/program-eligibility.ts
git commit -m "feat(campus-living): types — quota_ids[] + quota_names on program eligibility

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Service — drop the quota embed, resolve quota names, write array

**Files:**
- Modify: `lib/services/campus-living/program-eligibility-service.ts`

- [ ] **Step 1: Replace `getEligibility` with the array-aware version**

Replace the entire `getEligibility` method (currently lines ~39–74) with:

```typescript
  static async getEligibility(institutionId?: string): Promise<ProgramEligibilityRow[]> {
    const sb = this.supabase as any;
    let query = sb
      .from('hostel_program_eligibility')
      .select(
        '*, institution:institutions(name), program:programs(program_name), room_category:hostel_categories(name), mess_category:mess_categories(name)'
      )
      .order('institution_id', { ascending: true })
      .order('program_id', { ascending: true, nullsFirst: true })
      .order('fee_min', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true });
    if (institutionId) query = query.eq('institution_id', institutionId);

    const { data, error } = await query;
    if (error) {
      logger.error(LOG, 'Database error listing eligibility', error);
      throw new Error(error.message || 'Failed to fetch eligibility');
    }
    const rows = (data ?? []) as Record<string, unknown>[];

    // quota_ids is a uuid[] with no FK, so resolve names in one extra lookup
    // (PostgREST can't embed across an array). Names stay aligned 1:1 with ids.
    const quotaIdSet = new Set<string>();
    for (const r of rows) for (const id of ((r.quota_ids as string[] | null) ?? [])) quotaIdSet.add(id);
    const quotaNameById = new Map<string, string>();
    if (quotaIdSet.size > 0) {
      const { data: qrows, error: qerr } = await sb
        .from('quotas')
        .select('id, name')
        .in('id', Array.from(quotaIdSet));
      if (qerr) {
        logger.error(LOG, 'Database error resolving quota names', qerr);
        throw new Error(qerr.message || 'Failed to resolve quota names');
      }
      for (const q of (qrows ?? []) as { id: string; name: string }[]) quotaNameById.set(q.id, q.name);
    }

    return rows.map((r) => {
      const institution = r.institution as { name?: string } | null;
      const program = r.program as { program_name?: string } | null;
      const room = r.room_category as { name?: string } | null;
      const mess = r.mess_category as { name?: string } | null;
      const { institution: _i, program: _p, room_category: _rc, mess_category: _mc, ...rest } = r;
      const quotaIds = ((rest as ProgramEligibility).quota_ids ?? []);
      return {
        ...(rest as ProgramEligibility),
        institution_name: institution?.name ?? null,
        program_name: program?.program_name ?? null,
        quota_names: quotaIds.map((id) => quotaNameById.get(id) ?? id),
        room_category_name: room?.name ?? null,
        mess_category_name: mess?.name ?? null,
      };
    });
  }
```

> Key changes: removed `quota:quotas(name)` from `.select`, removed the `quota: _q` destructure, added the quota-name lookup, and project `quota_names` aligned with `quota_ids`.

- [ ] **Step 2: Update the insert in `createEligibility`**

In `createEligibility`, replace the insert line:
```typescript
        quota_id: dto.quota_id || null,
```
with:
```typescript
        quota_ids: dto.quota_ids && dto.quota_ids.length ? dto.quota_ids : null,
```

> `updateEligibility` spreads `...dto`, so passing `quota_ids` through it already works — no change needed there. The DB trigger also collapses `[]` → `NULL` defensively.

- [ ] **Step 3: Verify diagnostics**

Run `mcp__ide__getDiagnostics` on `lib/services/campus-living/program-eligibility-service.ts`.
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/services/campus-living/program-eligibility-service.ts
git commit -m "feat(campus-living): service — resolve quota_names for array column, write quota_ids

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: New `QuotaMultiSelect` component (Command + Popover + Badge)

**Files:**
- Create: `app/(routes)/campus-living/settings/program-eligibility/_components/quota-multi-select.tsx`

- [ ] **Step 1: Create the component**

Create the file with this content (follows the `multi-role-selector.tsx` idiom; imports verified to exist):

```tsx
'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface QuotaMultiSelectOption {
  value: string;
  label: string;
}

interface QuotaMultiSelectProps {
  options: QuotaMultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

// Multi-select for quotas. Empty selection means "any quota" (stored as NULL).
export function QuotaMultiSelect({
  options,
  value,
  onChange,
  placeholder = 'All quotas — any',
  disabled,
}: QuotaMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const labelById = React.useMemo(
    () => new Map(options.map((o) => [o.value, o.label])),
    [options]
  );
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          role='combobox'
          aria-expanded={open}
          disabled={disabled}
          className='w-full justify-between font-normal h-auto min-h-9'
        >
          <span className='flex flex-wrap gap-1 items-center text-left'>
            {value.length === 0 ? (
              <span className='text-muted-foreground'>{placeholder}</span>
            ) : (
              value.map((id) => (
                <Badge key={id} variant='secondary' className='font-normal'>
                  {labelById.get(id) ?? id}
                  <span
                    role='button'
                    tabIndex={0}
                    aria-label='Remove'
                    className='ml-1 inline-flex rounded-sm hover:bg-muted'
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        toggle(id);
                      }
                    }}
                  >
                    <X className='h-3 w-3' />
                  </span>
                </Badge>
              ))
            )}
          </span>
          <ChevronsUpDown className='h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className='w-[var(--radix-popover-trigger-width)] p-0'
        align='start'
      >
        <Command>
          <CommandInput placeholder='Search quotas…' />
          <CommandList>
            <CommandEmpty>No quotas found.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const selected = value.includes(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    onSelect={() => toggle(o.value)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {o.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify diagnostics**

Run `mcp__ide__getDiagnostics` on the new file.
Expected: no errors (if `Command`/`Popover` import paths differ, cross-check against `components/ui/multi-role-selector.tsx` which imports the same modules).

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/campus-living/settings/program-eligibility/_components/quota-multi-select.tsx"
git commit -m "feat(campus-living): QuotaMultiSelect component for category eligibility form

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Form dialog — single quota select → multi-select

**Files:**
- Modify: `app/(routes)/campus-living/settings/program-eligibility/_components/form-dialog.tsx`

- [ ] **Step 1: Imports + remove the ANY_QUOTA sentinel**

Add to the imports block:
```tsx
import { QuotaMultiSelect } from './quota-multi-select';
```
Delete this line (the sentinel is no longer needed — empty array = any quota):
```tsx
const ANY_QUOTA = '__any_quota__';
```

- [ ] **Step 2: Swap the quota state**

Replace:
```tsx
  const [quota, setQuota] = useState<string>(ANY_QUOTA);
```
with:
```tsx
  const [quotaIds, setQuotaIds] = useState<string[]>([]);
```

- [ ] **Step 3: Update the load/reset effect**

In the `useEffect`, in the edit branch replace:
```tsx
      setQuota(row.quota_id ?? ANY_QUOTA);
```
with:
```tsx
      setQuotaIds(row.quota_ids ?? []);
```
and in the else (create) branch replace:
```tsx
      setQuota(ANY_QUOTA);
```
with:
```tsx
      setQuotaIds([]);
```

- [ ] **Step 4: Rebuild the quota options**

Replace:
```tsx
  const quotaOptions = [
    { value: ANY_QUOTA, label: 'All quotas — any' },
    ...quotas.map((q) => ({ value: q.id, label: q.name })),
  ];
```
with:
```tsx
  const quotaOptions = quotas.map((q) => ({ value: q.id, label: q.name }));
```

- [ ] **Step 5: Update submit to send the array**

In `onSubmit`, replace:
```tsx
      const quotaId = quota === ANY_QUOTA ? null : quota;
```
with:
```tsx
      const quotaIdsToSend = quotaIds.length ? quotaIds : null;
```
Then in the `updateEligibility` call replace `quota_id: quotaId,` with `quota_ids: quotaIdsToSend,`, and in the `createEligibility` call replace `quota_id: quotaId,` with `quota_ids: quotaIdsToSend,`.

- [ ] **Step 6: Replace the Quota field JSX**

Replace:
```tsx
          <div className='space-y-2'>
            <Label>Quota</Label>
            <SearchableSelect className='w-full' value={quota} onValueChange={setQuota} options={quotaOptions} placeholder='Select quota' modal />
          </div>
```
with:
```tsx
          <div className='space-y-2'>
            <Label>Quota</Label>
            <QuotaMultiSelect options={quotaOptions} value={quotaIds} onChange={setQuotaIds} />
            <p className='text-xs text-muted-foreground'>Pick one or more quotas, or leave empty to apply to any quota.</p>
          </div>
```

- [ ] **Step 7: Verify diagnostics**

Run `mcp__ide__getDiagnostics` on `form-dialog.tsx`.
Expected: no errors. (If `SearchableSelect` is now unused, leave the import — it's still used for Institution/Scope/Hostel Type/categories.)

- [ ] **Step 8: Commit**

```bash
git add "app/(routes)/campus-living/settings/program-eligibility/_components/form-dialog.tsx"
git commit -m "feat(campus-living): category eligibility form — multi-quota selection

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Table column — render quota chips

**Files:**
- Modify: `app/(routes)/campus-living/settings/program-eligibility/_components/columns.tsx`

- [ ] **Step 1: Replace `QuotaCell`**

Replace:
```tsx
function QuotaCell({ name }: { name: string | null }) {
  return name
    ? <span className='text-sm'>{name}</span>
    : <Badge variant='secondary' className='font-normal'>Any quota</Badge>;
}
```
with:
```tsx
function QuotaCell({ names }: { names: string[] }) {
  if (!names || names.length === 0)
    return <Badge variant='secondary' className='font-normal'>Any quota</Badge>;
  return (
    <span className='flex flex-wrap gap-1'>
      {names.map((n) => (
        <Badge key={n} variant='outline' className='font-normal'>{n}</Badge>
      ))}
    </span>
  );
}
```

- [ ] **Step 2: Update the column definition**

Replace:
```tsx
  {
    accessorKey: 'quota_name',
    header: 'Quota',
    cell: ({ row }) => <QuotaCell name={row.original.quota_name} />,
  },
```
with:
```tsx
  {
    accessorKey: 'quota_names',
    header: 'Quota',
    cell: ({ row }) => <QuotaCell names={row.original.quota_names} />,
  },
```

- [ ] **Step 3: Verify diagnostics**

Run `mcp__ide__getDiagnostics` on `columns.tsx`.
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/campus-living/settings/program-eligibility/_components/columns.tsx"
git commit -m "feat(campus-living): category eligibility table — quota chips

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Filters — match against the quota array

**Files:**
- Modify: `app/(routes)/campus-living/settings/program-eligibility/_components/eligibility-filters.tsx`

- [ ] **Step 1: Update the filter predicate**

In `eligibilityMatchesFilters`, replace:
```tsx
  if (f.quota) {
    const match =
      f.quota === QUOTA_ANY ? row.quota_id === null : row.quota_id === f.quota;
    if (!match) return false;
  }
```
with:
```tsx
  if (f.quota) {
    const ids = row.quota_ids ?? [];
    const match = f.quota === QUOTA_ANY ? ids.length === 0 : ids.includes(f.quota);
    if (!match) return false;
  }
```

- [ ] **Step 2: Update the search haystack**

In the same function, replace:
```tsx
      row.quota_name ?? 'Any quota',
```
with:
```tsx
      row.quota_names.length ? row.quota_names.join(' ') : 'Any quota',
```

- [ ] **Step 3: Update the quota filter options**

Replace the `quotaOptions` memo:
```tsx
  const quotaOptions = useMemo<Option[]>(() => {
    const quotas = distinctOptions(rows, (r) => ({
      value: r.quota_id,
      label: r.quota_name,
    }));
    return rows.some((r) => r.quota_id === null)
      ? [{ value: QUOTA_ANY, label: 'Any quota' }, ...quotas]
      : quotas;
  }, [rows]);
```
with:
```tsx
  const quotaOptions = useMemo<Option[]>(() => {
    const byId = new Map<string, string>();
    let hasAny = false;
    for (const r of rows) {
      const ids = r.quota_ids ?? [];
      if (ids.length === 0) hasAny = true;
      ids.forEach((id, i) => {
        if (!byId.has(id)) byId.set(id, r.quota_names[i] ?? id);
      });
    }
    const quotas: Option[] = Array.from(byId, ([value, label]) => ({ value, label }));
    return hasAny ? [{ value: QUOTA_ANY, label: 'Any quota' }, ...quotas] : quotas;
  }, [rows]);
```

- [ ] **Step 4: Update the comment**

Replace the comment near the top:
```tsx
// program_id === null means "institution default"; quota_id === null means
// "any quota". Both need explicit filter options, so they get sentinels.
```
with:
```tsx
// program_id === null means "institution default"; an empty quota_ids means
// "any quota". Both need explicit filter options, so they get sentinels.
```

- [ ] **Step 5: Verify diagnostics**

Run `mcp__ide__getDiagnostics` on `eligibility-filters.tsx`.
Expected: no errors. (`distinctOptions` may now be used only for other facets — that's fine; leave the import as long as it's still referenced.)

- [ ] **Step 6: Commit**

```bash
git add "app/(routes)/campus-living/settings/program-eligibility/_components/eligibility-filters.tsx"
git commit -m "feat(campus-living): category eligibility filters — match quota array

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Full-stack verification

**Files:** none (verification only)

- [ ] **Step 1: Diagnostics sweep**

Run `mcp__ide__getDiagnostics` on every touched TS/TSX file:
- `types/program-eligibility.ts`
- `lib/services/campus-living/program-eligibility-service.ts`
- `app/(routes)/campus-living/settings/program-eligibility/_components/quota-multi-select.tsx`
- `app/(routes)/campus-living/settings/program-eligibility/_components/form-dialog.tsx`
- `app/(routes)/campus-living/settings/program-eligibility/_components/columns.tsx`
- `app/(routes)/campus-living/settings/program-eligibility/_components/eligibility-filters.tsx`

Expected: zero errors across all six.

- [ ] **Step 2: Browser smoke — create a multi-quota rule**

Start `npm run dev`. Go to `/campus-living/settings/program-eligibility` → **Category Eligibility** → **Add Rule**. Pick an institution, a hostel type, **two quotas**, a fee band, and a room category. Save.
Expected: toast "Eligibility added"; the new row shows **two quota chips**; filtering by either quota shows the row; searching a quota name finds it.

- [ ] **Step 3: Browser smoke — verify resolution**

Run via Supabase MCP `execute_sql`, substituting the institution + one of the two quotas you chose, and a fee inside the band:
```sql
SELECT category_id FROM fn_hostel_effective_room_categories(
  '<institution_id>'::uuid, NULL, '<one_of_the_two_quota_ids>'::uuid, <fee_in_band>, NULL);
```
Expected: returns the room category you selected. Repeat with the *other* quota → same category. Repeat with a *third* quota not in the set → returns nothing (rule does not apply).

- [ ] **Step 4: Edit round-trip**

Open the rule in **Edit**, confirm both quota chips are pre-selected, remove one, save, reopen.
Expected: only the remaining quota is selected; the table shows one chip.

- [ ] **Step 5: Final confirmation**

Confirm no routes / menu entries / permission keys changed → the `check:*` build gates are not triggered (no need to run them). State explicitly in the PR description that verification was DB-assertion + diagnostics + browser smoke (no test suite exists).

---

## Notes for the executor

- **Single cutover:** the DB migration (Task 1) and the frontend (Tasks 2–7) must deploy together — the currently-deployed app reads `quota_id` via a PostgREST embed and will error in any gap. Don't apply the migration to prod until the frontend is merged and ready to ship.
- **Index lag:** after editing a file, codegraph's watcher debounces ~500 ms — don't re-query the index in the same turn.
- **Error objects:** Supabase errors are plain objects — the service already uses `error.message`/`error.code`; keep that pattern.

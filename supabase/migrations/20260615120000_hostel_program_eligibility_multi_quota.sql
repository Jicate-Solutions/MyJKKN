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

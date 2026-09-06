-- 20260610150000_explain_allocation_pinned_rules.sql
-- Batch-detail modal: surface the learner cohort's OWN reservation rule(s) (the
-- configured "exist condition") with per-dimension values, so the physical section can
-- show WHERE the cohort is reserved and how the learner satisfies that rule -- even when
-- the allocated room is open or in another block. Adds physical.pinned_rules (block,
-- rule, floor, rooms count, cohort dims). Rebuilt from 20260610130000; additive only.
CREATE OR REPLACE FUNCTION public.fn_explain_allocation(p_allocation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

  -- Bridge profiles.id (allocation key) -> learners_profiles (eligibility/category data).
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

  -- Category eligibility (fee-aware program eligibility allow-sets).
  SELECT array_agg(category_id) INTO v_room_cats FROM fn_hostel_learner_room_categories(v_lp);
  SELECT array_agg(category_id) INTO v_mess_cats FROM fn_hostel_learner_mess_categories(v_lp);
  SELECT name INTO v_resolved_room_name FROM hostel_categories WHERE id = v_room_cats[1];
  SELECT name INTO v_resolved_mess_name FROM mess_categories WHERE id = v_mess_cats[1];
  v_fee := fn_learner_current_year_academic_fee(v_lp);
  SELECT academic_year_name INTO v_ay_name FROM academic_years WHERE id = v_ay;
  v_serves := fn_room_serves_institution(v_room, v_inst);

  -- Program-Eligibility conditions configured for the learner's institution, with
  -- per-condition verdicts; selected_room/selected_mess mark the winner scope exactly
  -- as fn_hostel_effective_room/mess_categories resolve it.
  WITH rules AS (
    SELECT e.*,
           COALESCE(e.program_id IS NULL OR e.program_id = v_program, false) AS program_ok,
           COALESCE(e.quota_id   IS NULL OR e.quota_id   = v_quota,   false) AS quota_ok,
           (v_fee IS NOT NULL
              AND (e.fee_min IS NULL OR v_fee >= e.fee_min)
              AND (e.fee_max IS NULL OR v_fee <  e.fee_max)) AS fee_ok,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_id   IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = v_inst AND e.is_active
  ),
  room_winner AS (
    SELECT program_id, quota_id, fee_min, fee_max FROM rules
    WHERE room_category_id IS NOT NULL AND program_ok AND quota_ok AND fee_ok
    ORDER BY specificity DESC, (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  ),
  mess_winner AS (
    SELECT program_id, quota_id, fee_min, fee_max FROM rules
    WHERE mess_category_id IS NOT NULL AND program_ok AND quota_ok AND fee_ok
    ORDER BY specificity DESC, (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT jsonb_agg(jsonb_build_object(
      'program', (SELECT program_name FROM programs WHERE id = r.program_id),
      'quota',   (SELECT name FROM quotas WHERE id = r.quota_id),
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
          AND r.quota_id   IS NOT DISTINCT FROM w.quota_id
          AND r.fee_min    IS NOT DISTINCT FROM w.fee_min
          AND r.fee_max    IS NOT DISTINCT FROM w.fee_max)),
      'selected_mess', (r.mess_category_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM mess_winner w
        WHERE r.program_id IS NOT DISTINCT FROM w.program_id
          AND r.quota_id   IS NOT DISTINCT FROM w.quota_id
          AND r.fee_min    IS NOT DISTINCT FROM w.fee_min
          AND r.fee_max    IS NOT DISTINCT FROM w.fee_max))
    ) ORDER BY (r.program_ok AND r.quota_ok AND r.fee_ok) DESC, r.specificity DESC,
               r.fee_min ASC NULLS FIRST)
  INTO v_elig_rules
  FROM rules r;

  -- The learner's academic bills; `counted` mirrors fn_learner_current_year_academic_fee
  -- (fee_source=academic, not cancelled/superseded, tagged to the learner's current AY).
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

  -- Physical-room rule coverage for the ALLOCATED room (mirrors fn_learner_strictly_eligible_for_room),
  -- with per-dimension rule-vs-learner verdicts for the comparison UI.
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

  -- Cohort pinning: does ANY active rule (any block) match this learner's cohort?
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

  -- The cohort's reservation rule(s) themselves (any block) -- the configured "exist
  -- condition" the learner matches; lets the UI show condition + learner status.
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
END $$;

-- 20260622130000_auto_allocate_candidates_gender_scope.sql
-- Auto-allocation preview: gender-scope the candidate pool to the block's type.
--
-- The candidate list was institution-scoped only, so a Boys block previewed every
-- hosteller of the institution — including girls, who then resolved to their own
-- girls-typed room category and surfaced with the misleading verdict
--   "Rooms they may occupy in this block are a different room category … fix the
--    reservation rooms or the Category-Eligibility band"
-- (a girls-Classic student can never match a boys block — nothing to fix in the
-- rules). That made operators think their physical-room rules were broken.
--
-- Fix: filter the cohort to learners whose gender matches the block's hostel_type
-- ('boys'/'girls'). NULL/blank gender, or a non-gendered block type, keeps the
-- student visible so data-incomplete rows (e.g. "No login profile") still surface.
-- The allocator (fn_auto_allocate_classic) already gates beds by gender, so the
-- placed result is unchanged — this only cleans up the preview/validation table.
--
-- Pure re-create of the 6-arg preview RPC; only the cohort CTE changed.

CREATE OR REPLACE FUNCTION public.fn_auto_allocate_candidates(p_block_id uuid, p_strict boolean DEFAULT false, p_floor integer DEFAULT NULL::integer, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_semester_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(learner_id uuid, full_name text, email text, institution_name text, program_name text, semester_name text, gender text, has_profile boolean, gender_ok boolean, not_allocated boolean, physical_rule_ok boolean, bed_available boolean, academic_year_id uuid, academic_year_name text, academic_bill_count integer, current_year_bill_count integer, bill_other_year_name text, current_year_fee numeric, resolved_room_category_id uuid, resolved_room_category_name text, resolved_mess_category_id uuid, resolved_mess_category_name text, bill_state text, stage text, verdict text, exclusion_reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH blk AS (
    SELECT hostel_type::text AS t FROM hostel_blocks WHERE id = p_block_id
  ),
  cohort AS (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id,
           lp.academic_year_id, lp.first_name, lp.last_name,
           room_elig.cats AS room_cats, mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    CROSS JOIN blk
    LEFT JOIN profiles gp ON gp.learner_id = lp.id
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)) room_elig ON true
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_mess_categories(lp.id)) mess_elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      AND lp.institution_id IN (SELECT institution_id FROM hostel_block_institutions WHERE block_id=p_block_id)
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
      -- Gender-scope to the block type (Boys block → only male learners, etc.).
      -- NULL/blank gender or a non-gendered block keeps the student visible.
      AND (blk.t IS NULL OR blk.t NOT IN ('boys','girls')
           OR gp.gender IS NULL OR btrim(gp.gender) = ''
           OR (blk.t = 'boys'  AND lower(btrim(gp.gender)) IN ('male','m'))
           OR (blk.t = 'girls' AND lower(btrim(gp.gender)) IN ('female','f')))
  ),
  base AS (
    SELECT
      c.id AS learner_id,
      COALESCE(p.full_name,
               NULLIF(btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
               p.email, '—') AS full_name,
      p.email, inst.name AS institution_name, prog.program_name, sem.semester_name,
      lower(trim(p.gender)) AS gender,
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
        SELECT 1 FROM hostel_rooms rm
        JOIN hostel_categories hc ON hc.id = rm.category_id
        WHERE rm.block_id=p_block_id AND rm.room_purpose='student'
          AND (p_floor IS NULL OR rm.floor = p_floor)
          AND rm.category_id = ANY(c.room_cats)
          AND (hc.type IS NULL
               OR (hc.type='boys'  AND lower(trim(p.gender)) IN ('male','m'))
               OR (hc.type='girls' AND lower(trim(p.gender)) IN ('female','f')))
          AND fn_room_serves_institution(rm.id, c.institution_id)
          AND fn_learner_strictly_eligible_for_room(c.id, rm.id, p_strict)
      ) AS physical_rule_ok,
      EXISTS (
        SELECT 1 FROM hostel_rooms rm
        WHERE rm.block_id=p_block_id AND rm.room_purpose='student'
          AND (p_floor IS NULL OR rm.floor = p_floor)
          AND NOT (rm.category_id = ANY(c.room_cats))
          AND fn_room_serves_institution(rm.id, c.institution_id)
          AND fn_learner_strictly_eligible_for_room(c.id, rm.id, p_strict)
      ) AS physical_ok_other_category,
      EXISTS (
        SELECT 1 FROM hostel_beds bd JOIN hostel_rooms r ON r.id=bd.room_id
        JOIN hostel_categories hc ON hc.id = r.category_id
        WHERE r.block_id=p_block_id AND r.room_purpose='student' AND bd.status='available'
          AND (p_floor IS NULL OR r.floor = p_floor)
          AND r.category_id = ANY(c.room_cats)
          AND (hc.type IS NULL
               OR (hc.type='boys'  AND lower(trim(p.gender)) IN ('male','m'))
               OR (hc.type='girls' AND lower(trim(p.gender)) IN ('female','f')))
          AND fn_room_serves_institution(r.id, c.institution_id)
          AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=bd.id AND a.status IN ('active','pending_approval'))
          AND fn_learner_strictly_eligible_for_room(c.id, r.id, p_strict)
      ) AS bed_available
    FROM cohort c
    LEFT JOIN profiles p ON p.learner_id = c.id
    LEFT JOIN institutions inst ON inst.id = c.institution_id
    LEFT JOIN programs prog ON prog.id = c.program_id
    LEFT JOIN semesters sem ON sem.id = c.semester_id
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
    s.learner_id, s.full_name, s.email, s.institution_name, s.program_name, s.semester_name, s.gender,
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
      WHEN NOT s.physical_rule_ok AND s.physical_ok_other_category THEN
        'Rooms they may occupy in this block are a different room category than their eligible '
        || COALESCE(s.resolved_room_category_name, 'category')
        || ' — fix the reservation rooms or the Category-Eligibility band'
      WHEN NOT s.physical_rule_ok THEN
        CASE WHEN p_strict
          THEN 'No physical-room rule in this block reserves a room for this cohort (strict mode)'
          ELSE 'No room they can occupy in their category — rooms here are reserved for other cohorts, or this cohort''s reserved rooms are in another block'
        END
      WHEN NOT s.bed_available THEN 'Their category rooms are full — no free bed'
      ELSE NULL
    END AS exclusion_reason
  FROM scored s
  ORDER BY s.full_name;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid, boolean, integer, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(uuid, boolean, integer, uuid, uuid, uuid) TO authenticated, service_role;

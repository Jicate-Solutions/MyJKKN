-- ============================================================================
-- Campus Living — Auto-Allocate is scoped by HOSTEL TYPE, not by block/floor
-- ============================================================================
--
-- The operator used to pick Block + Floor + Hostel Year before running
-- auto-allocation. All three are redundant:
--
--   * BLOCK / FLOOR — the physical-room rules (hostel_room_eligibility_rules)
--     already decide which rooms a cohort may enter, and with Strict on
--     (the page default) fn_learner_strictly_eligible_for_room admits a learner
--     ONLY into a room whose active rule covers their cohort. Measured
--     2026-08-04: 702 of 703 active hostel learners are pinned by at least one
--     active rule, and the girls blocks are 100% rule-covered (44/44, 37/37,
--     50/50). Asking the operator to also name the block just risks them
--     picking one the rules will reject.
--
--   * HOSTEL YEAR — hostel_years has a single is_current row; there is nothing
--     to choose. p_hostel_year_id now defaults to it.
--
-- So the selection collapses to: Type (boys/girls) -> Institution -> Program ->
-- Semester, where the last three are optional cohort narrowing.
--
-- Consequences, deliberate:
--   1. ONE batch now spans every block of the chosen type
--      (hostel_allocation_batches.block_id = NULL — already nullable; the
--      batches list/detail already render `block_name ?? '—'`, and each
--      allocation row still carries its own block). Previously "All blocks"
--      created one batch per block, which meant N approvals for one run.
--   2. fn_auto_allocate_candidates gains target_block_name — the block the
--      learner's first free eligible bed sits in. The operator no longer
--      chooses the block, so the preview has to SHOW it.
--   3. Fill order across blocks is deterministic: preferred room category
--      first (array_position over the resolved category list), then block name,
--      floor, room number, bed number.
--   4. Cohort gender is now filtered in fn_auto_allocate_classic too. It used
--      to be enforced only at bed level via hostel_categories.type; candidates
--      filtered it in the cohort. Doing both keeps preview == generate.
--
-- All three functions need DROP + CREATE (parameter lists change, and
-- CREATE OR REPLACE cannot drop/add parameters — it would create an OVERLOAD,
-- leaving the old signature callable). DROP discards grants, so every one is
-- re-issued at the end of its section.
-- ============================================================================


-- ── 1. Capacity summary for the chosen type ────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_auto_allocate_preview(uuid, integer);

CREATE FUNCTION public.fn_auto_allocate_preview(
  p_hostel_type text,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(cohort_eligible integer, no_profile integer, already_allocated integer,
              available_beds integer, rules_set boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH blocks AS (
    SELECT id FROM hostel_blocks WHERE hostel_type::text = p_hostel_type
  ),
  cohort AS (
    SELECT lp.id, lp.institution_id,
           (SELECT array_agg(category_id) FROM fn_hostel_learner_room_categories(lp.id)) AS room_cats
    FROM learners_profiles lp
    LEFT JOIN profiles gp ON gp.learner_id = lp.id
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code='hostel')
      -- Only ACTIVE learners may be allocated a bed. Keep in lockstep with
      -- fn_auto_allocate_candidates / fn_auto_allocate_classic.
      AND lp.lifecycle_status = 'active'
      AND lp.institution_id IN (
            SELECT bi.institution_id FROM hostel_block_institutions bi
            WHERE bi.block_id IN (SELECT id FROM blocks))
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
      -- NULL / blank gender is kept so data-incomplete learners still surface
      -- (and so the no_profile counter below still sees them).
      AND (gp.gender IS NULL OR btrim(gp.gender) = ''
           OR (p_hostel_type = 'boys'  AND lower(btrim(gp.gender)) IN ('male','m'))
           OR (p_hostel_type = 'girls' AND lower(btrim(gp.gender)) IN ('female','f')))
  )
  SELECT
    (SELECT count(*)::int FROM cohort c JOIN profiles p ON p.learner_id=c.id
       WHERE c.room_cats IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM cohort c WHERE c.room_cats IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.learner_id=c.id)),
    (SELECT count(*)::int FROM cohort c JOIN profiles p ON p.learner_id=c.id
       WHERE c.room_cats IS NOT NULL AND EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))),
    (SELECT count(*)::int FROM hostel_beds b JOIN hostel_rooms r ON r.id=b.room_id
       WHERE r.block_id IN (SELECT id FROM blocks) AND r.room_purpose='student' AND b.status='available'
         AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))),
    EXISTS (SELECT 1 FROM hostel_room_eligibility_rules WHERE block_id IN (SELECT id FROM blocks) AND is_active);
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_preview(text, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_preview(text, uuid, uuid, uuid) TO authenticated, service_role;


-- ── 2. Per-learner candidate verdicts for the chosen type ──────────────────
DROP FUNCTION IF EXISTS public.fn_auto_allocate_candidates(uuid, boolean, integer, uuid, uuid, uuid);

CREATE FUNCTION public.fn_auto_allocate_candidates(
  p_hostel_type text,
  p_strict boolean DEFAULT true,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  learner_id uuid, full_name text, email text, institution_name text,
  program_name text, semester_name text, gender text,
  has_profile boolean, gender_ok boolean, not_allocated boolean,
  physical_rule_ok boolean, bed_available boolean, target_block_name text,
  academic_year_id uuid, academic_year_name text,
  admission_academic_year_id uuid, admission_academic_year_name text,
  band_academic_year_id uuid, band_academic_year_name text, band_fee numeric,
  academic_bill_count integer, current_year_bill_count integer,
  bill_other_year_name text, current_year_fee numeric,
  resolved_room_category_id uuid, resolved_room_category_name text,
  resolved_mess_category_id uuid, resolved_mess_category_name text,
  bill_state text, stage text, verdict text, exclusion_reason text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH blocks AS (
    SELECT id FROM hostel_blocks WHERE hostel_type::text = p_hostel_type
  ),
  cohort AS (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id,
           lp.program_id, lp.semester_id, lp.academic_year_id,
           lp.first_name, lp.last_name,
           room_elig.cats AS room_cats, mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    LEFT JOIN profiles gp ON gp.learner_id = lp.id
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)) room_elig ON true
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_mess_categories(lp.id)) mess_elig ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      AND lp.lifecycle_status = 'active'
      AND lp.institution_id IN (
            SELECT bi.institution_id FROM hostel_block_institutions bi
            WHERE bi.block_id IN (SELECT id FROM blocks))
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
      AND (gp.gender IS NULL OR btrim(gp.gender) = ''
           OR (p_hostel_type = 'boys'  AND lower(btrim(gp.gender)) IN ('male','m'))
           OR (p_hostel_type = 'girls' AND lower(btrim(gp.gender)) IN ('female','f')))
      AND NOT EXISTS (
        SELECT 1 FROM hostel_allocations ha2
        JOIN profiles pr2 ON pr2.learner_id = lp.id
        WHERE ha2.learner_id = pr2.id
          AND ha2.status IN ('active', 'pending_approval')
      )
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
      adm.ay_id AS admission_academic_year_id,
      aay.academic_year_name::text AS admission_academic_year_name,
      bf.academic_year_id AS band_academic_year_id,
      bf.academic_year_name AS band_academic_year_name,
      bf.fee AS band_fee,
      c.room_cats[1] AS resolved_room_category_id,
      rc.name AS resolved_room_category_name, rc.type AS resolved_room_category_type,
      c.mess_cats[1] AS resolved_mess_category_id, mc.name AS resolved_mess_category_name,
      (SELECT count(*)::int FROM billing_student_bills b
         WHERE b.student_id = c.id AND b.fee_source = 'academic'
           AND b.status NOT IN ('cancelled','superseded')) AS academic_bill_count,
      (SELECT count(*)::int FROM billing_student_bills b
         WHERE b.student_id = c.id AND b.fee_source = 'academic'
           AND b.status NOT IN ('cancelled','superseded')
           AND b.academic_year_id = c.academic_year_id) AS current_year_bill_count,
      (SELECT ay2.academic_year_name
         FROM billing_student_bills b JOIN academic_years ay2 ON ay2.id = b.academic_year_id
        WHERE b.student_id = c.id AND b.fee_source = 'academic'
          AND b.status NOT IN ('cancelled','superseded')
          AND b.academic_year_id IS NOT NULL
          AND b.academic_year_id IS DISTINCT FROM c.academic_year_id
        ORDER BY b.created_at DESC LIMIT 1) AS bill_other_year_name,
      -- Diagnostic only: what the OLD current-year rule would have read.
      fn_learner_current_year_academic_fee(c.id) AS current_year_fee,
      true AS not_allocated,
      -- Can they enter ANY room of their resolved category, in any block of this
      -- type that serves their institution? (Was: any room of one chosen block.)
      EXISTS (
        SELECT 1 FROM hostel_rooms rm
        JOIN hostel_categories hc ON hc.id = rm.category_id
        WHERE rm.block_id IN (SELECT id FROM blocks) AND rm.room_purpose = 'student'
          AND rm.category_id = ANY(c.room_cats)
          AND (hc.type IS NULL
               OR (hc.type = 'boys'  AND lower(trim(p.gender)) IN ('male','m'))
               OR (hc.type = 'girls' AND lower(trim(p.gender)) IN ('female','f')))
          AND fn_room_serves_institution(rm.id, c.institution_id)
          AND fn_learner_strictly_eligible_for_room(c.id, rm.id, p_strict)
      ) AS physical_rule_ok,
      EXISTS (
        SELECT 1 FROM hostel_rooms rm
        WHERE rm.block_id IN (SELECT id FROM blocks) AND rm.room_purpose = 'student'
          AND NOT (rm.category_id = ANY(c.room_cats))
          AND fn_room_serves_institution(rm.id, c.institution_id)
          AND fn_learner_strictly_eligible_for_room(c.id, rm.id, p_strict)
      ) AS physical_ok_other_category,
      -- tgt is the bed fn_auto_allocate_classic would actually give them:
      -- SAME ordering, so target_block_name is a real prediction, not a guess.
      (tgt.block_name IS NOT NULL) AS bed_available,
      tgt.block_name AS target_block_name
    FROM cohort c
    LEFT JOIN profiles p       ON p.learner_id = c.id
    LEFT JOIN institutions inst ON inst.id = c.institution_id
    LEFT JOIN programs prog     ON prog.id = c.program_id
    LEFT JOIN semesters sem     ON sem.id = c.semester_id
    LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
    LEFT JOIN LATERAL (SELECT fn_learner_admission_academic_year(c.id) AS ay_id) adm ON true
    LEFT JOIN academic_years aay ON aay.id = adm.ay_id
    LEFT JOIN LATERAL fn_learner_band_academic_fee(c.id) bf ON true
    LEFT JOIN hostel_categories rc ON rc.id = c.room_cats[1]
    LEFT JOIN mess_categories   mc ON mc.id = c.mess_cats[1]
    LEFT JOIN LATERAL (
      SELECT hb.name AS block_name
      FROM hostel_beds bd
      JOIN hostel_rooms r  ON r.id = bd.room_id
      JOIN hostel_blocks hb ON hb.id = r.block_id
      JOIN hostel_categories hc ON hc.id = r.category_id
      WHERE hb.hostel_type::text = p_hostel_type
        AND r.room_purpose = 'student'
        AND bd.status = 'available'
        AND r.category_id = ANY(c.room_cats)
        AND (hc.type IS NULL
             OR (hc.type = 'boys'  AND lower(trim(p.gender)) IN ('male','m'))
             OR (hc.type = 'girls' AND lower(trim(p.gender)) IN ('female','f')))
        AND fn_room_serves_institution(r.id, c.institution_id)
        AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                        WHERE a.bed_id = bd.id AND a.status IN ('active','pending_approval'))
        AND fn_learner_strictly_eligible_for_room(c.id, r.id, p_strict)
      ORDER BY array_position(c.room_cats, r.category_id), hb.name, r.floor, r.room_number, bd.bed_number
      LIMIT 1
    ) tgt ON true
  ),
  scored AS (
    SELECT b.*,
      (b.resolved_room_category_type IS NULL
        OR (b.resolved_room_category_type = 'boys'  AND b.gender IN ('male','m'))
        OR (b.resolved_room_category_type = 'girls' AND b.gender IN ('female','f'))) AS gender_ok
    FROM base b
  )
  SELECT
    s.learner_id, s.full_name, s.email, s.institution_name, s.program_name, s.semester_name,
    s.gender, s.has_profile, s.gender_ok, s.not_allocated, s.physical_rule_ok,
    s.bed_available, s.target_block_name,
    s.academic_year_id, s.academic_year_name,
    s.admission_academic_year_id, s.admission_academic_year_name,
    s.band_academic_year_id, s.band_academic_year_name, s.band_fee,
    s.academic_bill_count, s.current_year_bill_count, s.bill_other_year_name, s.current_year_fee,
    s.resolved_room_category_id, s.resolved_room_category_name,
    s.resolved_mess_category_id, s.resolved_mess_category_name,
    CASE
      WHEN s.band_fee IS NOT NULL
       AND s.band_academic_year_id IS NOT DISTINCT FROM s.admission_academic_year_id THEN 'matched'
      WHEN s.band_fee IS NOT NULL          THEN 'different_year'
      WHEN s.academic_bill_count > 0       THEN 'untagged'
      ELSE 'none'
    END AS bill_state,
    CASE
      WHEN s.band_fee  IS NULL THEN 'prerequisite'
      WHEN s.room_cats IS NULL THEN 'prerequisite'
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.physical_rule_ok OR NOT s.bed_available
                               THEN 'eligibility'
      ELSE 'ok'
    END AS stage,
    CASE
      WHEN s.band_fee  IS NULL THEN 'out'
      WHEN s.room_cats IS NULL THEN 'out'
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.physical_rule_ok OR NOT s.bed_available
                               THEN 'out'
      ELSE 'in'
    END AS verdict,
    CASE
      WHEN s.band_fee IS NULL THEN
        CASE
          WHEN s.academic_bill_count = 0 THEN
            'No academic bill for this student — nothing to read a fee band from'
          ELSE
            'Academic bills exist but none is usable: either untagged to an academic year, or the tagged year totals ₹0'
        END
      WHEN s.room_cats IS NULL THEN
        'No Category-Eligibility band covers ₹'
        || to_char(s.band_fee, 'FM999,999,999')
        || ' (read from ' || COALESCE(s.band_academic_year_name, 'their admission year') || ')'
        || ' for this program / quota — add or widen a band'
      WHEN NOT s.has_profile   THEN 'No login profile'
      WHEN NOT s.gender_ok     THEN 'Gender does not match the resolved room category'
      WHEN NOT s.physical_rule_ok AND s.physical_ok_other_category THEN
        'Rooms they may occupy are a different room category than their eligible '
        || COALESCE(s.resolved_room_category_name, 'category')
        || ' — fix the reservation rooms or the Category-Eligibility band'
      WHEN NOT s.physical_rule_ok THEN
        CASE WHEN p_strict
          THEN 'No physical-room rule reserves a room for this cohort in any ' || p_hostel_type || ' block (strict mode)'
          ELSE 'No room they can occupy in their category — every room is reserved for other cohorts'
        END
      WHEN NOT s.bed_available THEN 'Their category rooms are full — no free bed in any ' || p_hostel_type || ' block'
      ELSE NULL
    END AS exclusion_reason
  FROM scored s
  ORDER BY s.full_name;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(text, boolean, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_candidates(text, boolean, uuid, uuid, uuid) TO authenticated, service_role;


-- ── 3. Generate — one batch spanning every block of the type ───────────────
DROP FUNCTION IF EXISTS public.fn_auto_allocate_classic(uuid, uuid, boolean, integer, uuid, uuid, uuid);

CREATE FUNCTION public.fn_auto_allocate_classic(
  p_hostel_type text,
  p_hostel_year_id uuid DEFAULT NULL::uuid,
  p_strict boolean DEFAULT true,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch uuid; v_tier uuid; v_actor uuid := auth.uid();
  v_alloc int := 0; v_skip int := 0;
  v_year uuid; v_ay uuid;
  cand record; v_bed uuid; v_room uuid; v_block uuid; v_mess uuid;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('campus_living.allocations.create')) THEN
    RAISE EXCEPTION 'Not authorized to run auto-allocation';
  END IF;

  IF p_hostel_type IS NULL OR p_hostel_type NOT IN ('boys','girls') THEN
    RAISE EXCEPTION 'Hostel type must be boys or girls';
  END IF;

  -- hostel_years carries exactly one is_current row; the picker was noise.
  v_year := COALESCE(p_hostel_year_id, (SELECT id FROM hostel_years WHERE is_current LIMIT 1));
  IF v_year IS NULL THEN
    RAISE EXCEPTION 'No current hostel year is set — mark one under Campus Living → Settings → Hostel Years';
  END IF;

  SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1; END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

  -- block_id NULL: this batch spans every block of the type. Each allocation
  -- row still records the block it landed in.
  INSERT INTO hostel_allocation_batches (block_id, category_id, hostel_year_id, status, created_by)
  VALUES (NULL, NULL, v_year, 'pending_approval', v_actor)
  RETURNING id INTO v_batch;

  FOR cand IN
    SELECT lp.id AS lp_id, p.id AS profile_id, lp.semester_id AS sem_id,
           lp.academic_year_id AS ay_id, lp.institution_id AS inst,
           lower(trim(p.gender)) AS gender,
           room_elig.cats AS room_cats, mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    JOIN profiles p ON p.learner_id = lp.id
    JOIN institutions inst_t ON inst_t.id = lp.institution_id
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)) room_elig ON true
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_mess_categories(lp.id)) mess_elig ON true
    -- Is this learner's institution served by ANY block of the type, and is it
    -- the primary institution of one? bool_or over zero rows => NULL => filtered.
    LEFT JOIN LATERAL (
      SELECT bool_or(hbi.is_primary) AS is_primary
      FROM hostel_block_institutions hbi
      JOIN hostel_blocks hb ON hb.id = hbi.block_id
      WHERE hb.hostel_type::text = p_hostel_type
        AND hbi.institution_id = lp.institution_id
    ) prim ON true
    LEFT JOIN LATERAL (
      SELECT min(array_position(r.semester_ids, lp.semester_id)) AS rank
      FROM hostel_room_eligibility_rules r
      JOIN hostel_blocks hb ON hb.id = r.block_id
      WHERE r.is_active
        AND hb.hostel_type::text = p_hostel_type
        AND r.institution_id = lp.institution_id
        AND (r.degree_id     IS NULL OR r.degree_id     = lp.degree_id)
        AND (r.department_id IS NULL OR r.department_id = lp.department_id)
        AND (r.program_id    IS NULL OR r.program_id    = lp.program_id)
        AND cardinality(r.semester_ids) > 1
        AND lp.semester_id = ANY(r.semester_ids)
    ) sem_fill ON true
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      AND lp.lifecycle_status = 'active'
      AND room_elig.cats IS NOT NULL
      AND prim.is_primary IS NOT NULL
      -- Cohort-level gender filter, mirroring fn_auto_allocate_candidates so
      -- preview == generate (bed-level hostel_categories.type still applies).
      AND (p.gender IS NULL OR btrim(p.gender) = ''
           OR (p_hostel_type = 'boys'  AND lower(btrim(p.gender)) IN ('male','m'))
           OR (p_hostel_type = 'girls' AND lower(btrim(p.gender)) IN ('female','f')))
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
    ORDER BY COALESCE(sem_fill.rank, 1),
             prim.is_primary DESC,
             lower(coalesce(inst_t.name,'')),
             lower(coalesce(lp.first_name,'')), lower(coalesce(lp.last_name,'')), lp.id
  LOOP
    v_ay := COALESCE(cand.ay_id, (SELECT id FROM academic_years WHERE institution_id=cand.inst AND is_active ORDER BY start_date DESC LIMIT 1));
    IF v_ay IS NULL THEN v_skip := v_skip + 1; CONTINUE; END IF;

    v_bed := NULL; v_room := NULL; v_block := NULL;
    -- Same ORDER BY as fn_auto_allocate_candidates' target_block_name lateral.
    SELECT b.id, r.id, r.block_id INTO v_bed, v_room, v_block
    FROM hostel_beds b
    JOIN hostel_rooms r ON r.id=b.room_id
    JOIN hostel_blocks hb ON hb.id = r.block_id
    JOIN hostel_categories hc ON hc.id = r.category_id
    WHERE hb.hostel_type::text = p_hostel_type
      AND r.room_purpose='student' AND b.status='available'
      AND r.category_id = ANY(cand.room_cats)
      AND (hc.type IS NULL
           OR (hc.type='boys'  AND cand.gender IN ('male','m'))
           OR (hc.type='girls' AND cand.gender IN ('female','f')))
      AND fn_room_serves_institution(r.id, cand.inst)
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
      AND fn_learner_strictly_eligible_for_room(cand.lp_id, r.id, p_strict)
    ORDER BY array_position(cand.room_cats, r.category_id), hb.name, r.floor, r.room_number, b.bed_number
    LIMIT 1;

    IF v_bed IS NULL THEN v_skip := v_skip + 1; CONTINUE; END IF;

    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
      allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      tier_id, batch_id, allocated_by, warden_id
    ) VALUES (
      cand.inst, cand.profile_id, v_block, v_room, v_bed, v_ay, cand.sem_id,
      'fresh', CURRENT_DATE, 'pending_approval', '', '', '',
      v_tier, v_batch, v_actor,
      (SELECT user_id FROM user_block_access WHERE block_id=v_block AND revoked_at IS NULL LIMIT 1)
    );

    v_mess := CASE WHEN cand.mess_cats IS NOT NULL THEN cand.mess_cats[1] ELSE NULL END;
    UPDATE learners_profiles
      SET hostel_category_id = (SELECT category_id FROM hostel_rooms WHERE id = v_room),
          mess_category_id   = COALESCE(v_mess, mess_category_id),
          updated_at = now()
      WHERE id = cand.lp_id;

    v_alloc := v_alloc + 1;
  END LOOP;

  UPDATE hostel_allocation_batches
    SET allocated_count = v_alloc, skipped_count = v_skip,
        notes = format('%s allocated across all %s blocks (%s physical mode; rules-driven category + mess; block and room decided by the physical-room rules). %s skipped (no free bed they can occupy / reserved rooms hold no space for them / gender / no academic year). Strict: learners with no rule-resolved room category are excluded. Cohort: lifecycle_status = active only.',
                       v_alloc, p_hostel_type,
                       CASE WHEN p_strict THEN 'STRICT — only cohorts matching a physical rule' ELSE 'open — rule-free rooms shared' END,
                       v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_auto_allocate_classic(text, uuid, boolean, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_auto_allocate_classic(text, uuid, boolean, uuid, uuid, uuid) TO authenticated, service_role;

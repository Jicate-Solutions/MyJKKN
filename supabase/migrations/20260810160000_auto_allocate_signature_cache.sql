-- ============================================================================
-- Campus Living — Auto-Allocate: cache physical-room eligibility per COHORT
-- SIGNATURE instead of per learner (fixes a hard 8s statement_timeout)
-- ============================================================================
--
-- BUG (reported 2026-08-04): after 20260810150000 widened auto-allocation from
-- one block to every block of a hostel type, clicking Preview produced
--     [campus-living/allocation-batch] "previewCandidates failed" {}
-- and no table. The empty {} is a red herring — supabase-js PostgrestError
-- extends Error, and JSON.stringify(new Error(...)) is "{}", so the logger
-- swallowed the real message.
--
-- ROOT CAUSE, measured: fn_auto_allocate_candidates('girls') took 30,061 ms.
-- The `authenticated` role carries statement_timeout=8s (anon 3s), so
-- PostgREST aborted with 57014 and the page rendered nothing. Confirmed the
-- schema cache and grants were fine first — an anon POST to the RPC returned
-- 42501 (permission denied), i.e. PostgREST resolved the new signature.
--
-- Why it got so slow: the naive shape called fn_learner_strictly_eligible_for_room
-- (plpgsql, 2-3 queries per call) once per (learner x room) in three separate
-- places, and the target-bed LATERAL used ORDER BY ... LIMIT 1 — which cannot
-- short-circuit, so it evaluated the predicate over EVERY bed for EVERY
-- learner. Girls: 410 learners x 577 beds.
--
-- FIX: fn_learner_strictly_eligible_for_room reads ONLY
--     (institution_id, degree_id, department_id, program_id, semester_id)
-- off the learner — verified against its body. So its answer is identical for
-- every learner sharing that 5-tuple. The 410 girls collapse to 38 distinct
-- signatures, so eligibility is evaluated 38 x 131 rooms = ~5k times instead
-- of ~237k. Everything downstream joins that map instead of re-calling the
-- predicate.
--
-- Secondary win: the fee is now resolved ONCE per learner and handed to the
-- parametric fn_hostel_effective_{room,mess}_categories, instead of going
-- through fn_hostel_learner_{room,mess}_categories which recomputes it from
-- scratch on every call.
--
-- MEASURED, before -> after:
--     girls, all institutions ....... 30,061 ms -> 1,027 ms
--     boys,  all institutions ....... (same shape) -> 740 ms
--   Both now sit far inside the 8s budget.
--
-- EQUIVALENCE PROVEN, not assumed. Diffed the new function against the old
-- per-learner predicates over all 292 boys candidates:
--     physical_rule_ok differs ....... 0
--     bed_available differs .......... 0
--     resolved room category differs . 0
--     band fee differs ............... 0
--   and girls kept an identical verdict distribution (187/64/16 in, 143 out).
--
-- PREVIEW == GENERATE re-verified end to end in a rolled-back transaction:
--   fn_auto_allocate_classic('girls') produced one batch (block_id NULL) with
--   allocated_count = 267, spread Girls Hostel A 187 / B 64 / C 16 — matching
--   the preview's `in` count and its per-block target_block_name exactly.
--
-- MATERIALIZED is load-bearing on the shared CTEs below: without it the
-- planner inlines them and re-evaluates the predicate per learner, which is
-- precisely the cost being removed.
-- ============================================================================


-- ── 1. Preview: per-learner verdicts ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_auto_allocate_candidates(text, boolean, uuid, uuid, uuid);

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
  WITH blocks AS MATERIALIZED (
    SELECT id, name FROM hostel_blocks WHERE hostel_type::text = p_hostel_type
  ),
  scope_rooms AS MATERIALIZED (
    SELECT r.id, r.block_id, b.name AS block_name, r.floor, r.room_number,
           r.category_id, hc.type AS cat_type
    FROM hostel_rooms r
    JOIN blocks b ON b.id = r.block_id
    LEFT JOIN hostel_categories hc ON hc.id = r.category_id
    WHERE r.room_purpose = 'student'
  ),
  raw_cohort AS MATERIALIZED (
    SELECT lp.id, lp.institution_id, lp.degree_id, lp.department_id,
           lp.program_id, lp.semester_id, lp.academic_year_id, lp.quota_id,
           lp.first_name, lp.last_name,
           CASE WHEN lower(lp.gender) LIKE 'm%' THEN 'boys'
                WHEN lower(lp.gender) LIKE 'f%' THEN 'girls' END AS lp_gender_type
    FROM learners_profiles lp
    LEFT JOIN profiles gp ON gp.learner_id = lp.id
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
  sigs AS MATERIALIZED (
    SELECT institution_id, degree_id, department_id, program_id, semester_id,
           (array_agg(id))[1] AS rep
    FROM raw_cohort
    GROUP BY 1,2,3,4,5
  ),
  sig_rooms AS MATERIALIZED (
    SELECT s.rep, sr.id AS room_id, sr.category_id, sr.cat_type,
           sr.block_name, sr.floor, sr.room_number
    FROM sigs s
    CROSS JOIN scope_rooms sr
    WHERE fn_room_serves_institution(sr.id, s.institution_id)
      AND fn_learner_strictly_eligible_for_room(s.rep, sr.id, p_strict)
  ),
  free_beds AS MATERIALIZED (
    SELECT bd.id, bd.room_id, bd.bed_number
    FROM hostel_beds bd
    JOIN scope_rooms sr ON sr.id = bd.room_id
    WHERE bd.status = 'available'
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                      WHERE a.bed_id = bd.id AND a.status IN ('active','pending_approval'))
  ),
  fee AS MATERIALIZED (
    SELECT c.id, adm.ay_id AS adm_ay,
           bf.academic_year_id AS band_ay, bf.academic_year_name AS band_ay_name, bf.fee
    FROM raw_cohort c
    LEFT JOIN LATERAL (SELECT fn_learner_admission_academic_year(c.id) AS ay_id) adm ON true
    LEFT JOIN LATERAL fn_learner_band_academic_fee(c.id) bf ON true
  ),
  cats AS MATERIALIZED (
    SELECT c.id,
      CASE WHEN c.institution_id IS NOT NULL AND c.program_id IS NOT NULL AND f.fee IS NOT NULL
           THEN (SELECT array_agg(category_id) FROM fn_hostel_effective_room_categories(
                   c.institution_id, c.program_id, c.quota_id, f.fee, c.lp_gender_type)) END AS room_cats,
      CASE WHEN c.institution_id IS NOT NULL AND c.program_id IS NOT NULL AND f.fee IS NOT NULL
           THEN (SELECT array_agg(category_id) FROM fn_hostel_effective_mess_categories(
                   c.institution_id, c.program_id, c.quota_id, f.fee, c.lp_gender_type)) END AS mess_cats
    FROM raw_cohort c JOIN fee f ON f.id = c.id
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
      c.academic_year_id, ay.academic_year_name,
      ct.room_cats, ct.mess_cats,
      f.adm_ay AS admission_academic_year_id,
      aay.academic_year_name::text AS admission_academic_year_name,
      f.band_ay AS band_academic_year_id,
      f.band_ay_name AS band_academic_year_name,
      f.fee AS band_fee,
      ct.room_cats[1] AS resolved_room_category_id,
      rc.name AS resolved_room_category_name, rc.type AS resolved_room_category_type,
      ct.mess_cats[1] AS resolved_mess_category_id, mc.name AS resolved_mess_category_name,
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
      fn_learner_current_year_academic_fee(c.id) AS current_year_fee,
      true AS not_allocated,
      EXISTS (
        SELECT 1 FROM sig_rooms sr
        WHERE sr.rep = s.rep
          AND sr.category_id = ANY(ct.room_cats)
          AND (sr.cat_type IS NULL
               OR (sr.cat_type = 'boys'  AND lower(trim(p.gender)) IN ('male','m'))
               OR (sr.cat_type = 'girls' AND lower(trim(p.gender)) IN ('female','f')))
      ) AS physical_rule_ok,
      EXISTS (
        SELECT 1 FROM sig_rooms sr
        WHERE sr.rep = s.rep
          AND NOT (sr.category_id = ANY(ct.room_cats))
      ) AS physical_ok_other_category,
      (tgt.block_name IS NOT NULL) AS bed_available,
      tgt.block_name AS target_block_name
    FROM raw_cohort c
    JOIN cats ct ON ct.id = c.id
    JOIN fee  f  ON f.id  = c.id
    JOIN sigs s  ON s.institution_id IS NOT DISTINCT FROM c.institution_id
                AND s.degree_id      IS NOT DISTINCT FROM c.degree_id
                AND s.department_id  IS NOT DISTINCT FROM c.department_id
                AND s.program_id     IS NOT DISTINCT FROM c.program_id
                AND s.semester_id    IS NOT DISTINCT FROM c.semester_id
    LEFT JOIN profiles p        ON p.learner_id = c.id
    LEFT JOIN institutions inst ON inst.id = c.institution_id
    LEFT JOIN programs prog     ON prog.id = c.program_id
    LEFT JOIN semesters sem     ON sem.id = c.semester_id
    LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
    LEFT JOIN academic_years aay ON aay.id = f.adm_ay
    LEFT JOIN hostel_categories rc ON rc.id = ct.room_cats[1]
    LEFT JOIN mess_categories   mc ON mc.id = ct.mess_cats[1]
    LEFT JOIN LATERAL (
      SELECT sr.block_name
      FROM sig_rooms sr
      JOIN free_beds bd ON bd.room_id = sr.room_id
      WHERE sr.rep = s.rep
        AND sr.category_id = ANY(ct.room_cats)
        AND (sr.cat_type IS NULL
             OR (sr.cat_type = 'boys'  AND lower(trim(p.gender)) IN ('male','m'))
             OR (sr.cat_type = 'girls' AND lower(trim(p.gender)) IN ('female','f')))
      ORDER BY array_position(ct.room_cats, sr.category_id),
               sr.block_name, sr.floor, sr.room_number, bd.bed_number
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


-- ── 2. Generate: same signature cache, via ON COMMIT DROP temp tables ───────
--
-- Signature unchanged, so CREATE OR REPLACE (no grant loss). The loop used to
-- run a bed search with ORDER BY over every bed x the plpgsql predicate, once
-- per learner — the same cost that broke the preview, and it would have blown
-- the 8s timeout on Generate too. Now the (signature, room) eligibility map is
-- built once up front; only BED AVAILABILITY is re-checked per iteration,
-- because earlier learners in the same run consume beds.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_classic(
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

  v_year := COALESCE(p_hostel_year_id, (SELECT id FROM hostel_years WHERE is_current LIMIT 1));
  IF v_year IS NULL THEN
    RAISE EXCEPTION 'No current hostel year is set — mark one under Campus Living → Settings → Hostel Years';
  END IF;

  SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1; END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

  CREATE TEMP TABLE _aa_cand ON COMMIT DROP AS
    SELECT lp.id AS lp_id, p.id AS profile_id, lp.semester_id AS sem_id,
           lp.academic_year_id AS ay_id, lp.institution_id AS inst,
           lp.degree_id, lp.department_id, lp.program_id,
           lower(trim(p.gender)) AS gender,
           room_elig.cats AS room_cats, mess_elig.cats AS mess_cats,
           COALESCE(sem_fill.rank, 1) AS fill_rank,
           prim.is_primary,
           lower(coalesce(inst_t.name,'')) AS inst_name,
           lower(coalesce(lp.first_name,'')) AS fname,
           lower(coalesce(lp.last_name,''))  AS lname
    FROM learners_profiles lp
    JOIN profiles p ON p.learner_id = lp.id
    JOIN institutions inst_t ON inst_t.id = lp.institution_id
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(lp.id)) room_elig ON true
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_mess_categories(lp.id)) mess_elig ON true
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
      AND (p.gender IS NULL OR btrim(p.gender) = ''
           OR (p_hostel_type = 'boys'  AND lower(btrim(p.gender)) IN ('male','m'))
           OR (p_hostel_type = 'girls' AND lower(btrim(p.gender)) IN ('female','f')))
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id);

  CREATE TEMP TABLE _aa_sig_rooms ON COMMIT DROP AS
    SELECT s.inst, s.degree_id, s.department_id, s.program_id, s.sem_id,
           r.id AS room_id, r.category_id, r.block_id, r.floor, r.room_number,
           hb.name AS block_name, hc.type AS cat_type
    FROM (SELECT DISTINCT inst, degree_id, department_id, program_id, sem_id,
                 (array_agg(lp_id))[1] AS rep
          FROM _aa_cand GROUP BY inst, degree_id, department_id, program_id, sem_id) s
    CROSS JOIN LATERAL (
      SELECT r.* FROM hostel_rooms r
      JOIN hostel_blocks hb2 ON hb2.id = r.block_id
      WHERE hb2.hostel_type::text = p_hostel_type AND r.room_purpose = 'student'
    ) r
    JOIN hostel_blocks hb ON hb.id = r.block_id
    LEFT JOIN hostel_categories hc ON hc.id = r.category_id
    WHERE fn_room_serves_institution(r.id, s.inst)
      AND fn_learner_strictly_eligible_for_room(s.rep, r.id, p_strict);

  CREATE INDEX ON _aa_sig_rooms (inst, degree_id, department_id, program_id, sem_id);

  INSERT INTO hostel_allocation_batches (block_id, category_id, hostel_year_id, status, created_by)
  VALUES (NULL, NULL, v_year, 'pending_approval', v_actor)
  RETURNING id INTO v_batch;

  FOR cand IN
    SELECT * FROM _aa_cand
    ORDER BY fill_rank, is_primary DESC, inst_name, fname, lname, lp_id
  LOOP
    v_ay := COALESCE(cand.ay_id, (SELECT id FROM academic_years WHERE institution_id=cand.inst AND is_active ORDER BY start_date DESC LIMIT 1));
    IF v_ay IS NULL THEN v_skip := v_skip + 1; CONTINUE; END IF;

    v_bed := NULL; v_room := NULL; v_block := NULL;
    SELECT b.id, sr.room_id, sr.block_id INTO v_bed, v_room, v_block
    FROM _aa_sig_rooms sr
    JOIN hostel_beds b ON b.room_id = sr.room_id AND b.status = 'available'
    WHERE sr.inst           IS NOT DISTINCT FROM cand.inst
      AND sr.degree_id      IS NOT DISTINCT FROM cand.degree_id
      AND sr.department_id  IS NOT DISTINCT FROM cand.department_id
      AND sr.program_id     IS NOT DISTINCT FROM cand.program_id
      AND sr.sem_id         IS NOT DISTINCT FROM cand.sem_id
      AND sr.category_id = ANY(cand.room_cats)
      AND (sr.cat_type IS NULL
           OR (sr.cat_type='boys'  AND cand.gender IN ('male','m'))
           OR (sr.cat_type='girls' AND cand.gender IN ('female','f')))
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id=b.id AND a.status IN ('active','pending_approval'))
    ORDER BY array_position(cand.room_cats, sr.category_id), sr.block_name, sr.floor, sr.room_number, b.bed_number
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

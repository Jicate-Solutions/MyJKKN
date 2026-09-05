-- Campus Living auto-allocation: widen the cohort to active + reserved + admitted.
--
-- Companion to 20260905102440_cl_roster_widen_reserved_admitted.sql, which
-- widened v_learner_hostelites and fn_hostel_unallocated_candidates. Split into
-- its own migration deliberately: auto-allocation writes beds in bulk, so it
-- must be revertable on its own without pulling the roster back to active-only.
--
-- ROLLBACK: this migration and its companion both read
-- public.fn_cl_roster_statuses(). Narrowing the roster back is a ONE-LINE
-- change to that function -- no function bodies need to be touched again.
--
-- Each function below is its 2026-09-05 definition with a single predicate
-- swapped:
--     AND lp.lifecycle_status = 'active'
--  -> AND lp.lifecycle_status::text = ANY (public.fn_cl_roster_statuses())
-- Verified byte-for-byte against a pre-migration snapshot of
-- pg_get_functiondef(), so nothing else in the allocation logic moved.

-- ---------------------------------------------------------------------------
-- 1. The fn_auto_allocate_* family -- widen
-- ---------------------------------------------------------------------------
-- Each of these three carries its own copy of the lifecycle predicate. Leaving
-- them behind would mean a reserved learner shows in Residents and in
-- Unallocated but is silently skipped by every auto-allocation run.
--
-- SAFETY: the 48 learners with no profiles row cannot cause an FK violation
-- here. fn_auto_allocate_plan builds its pool with an INNER `JOIN profiles p`,
-- so they are dropped before any bed is considered. fn_auto_allocate_preview
-- and fn_auto_allocate_candidates LEFT JOIN and already report them --
-- preview via its `no_profile` counter, candidates via has_profile=false which
-- forces verdict='out' with exclusion_reason 'No login profile'.
--
-- Only the lifecycle line changes in each; everything else is the definition as
-- it stood on 2026-09-05 (verified byte-for-byte against a pre-migration
-- snapshot of pg_get_functiondef).

CREATE OR REPLACE FUNCTION public.fn_auto_allocate_preview(p_hostel_type text, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_semester_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cohort_eligible integer, no_profile integer, already_allocated integer, available_beds integer, rules_set boolean)
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
      AND lp.lifecycle_status::text = ANY (public.fn_cl_roster_statuses())
      AND lp.institution_id IN (
            SELECT bi.institution_id FROM hostel_block_institutions bi
            WHERE bi.block_id IN (SELECT id FROM blocks))
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
      AND (COALESCE(NULLIF(btrim(gp.gender), ''), NULLIF(btrim(lp.gender), '')) IS NULL
           OR (p_hostel_type = 'boys'
               AND lower(btrim(COALESCE(NULLIF(btrim(gp.gender), ''), lp.gender))) IN ('male','m'))
           OR (p_hostel_type = 'girls'
               AND lower(btrim(COALESCE(NULLIF(btrim(gp.gender), ''), lp.gender))) IN ('female','f')))
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

CREATE OR REPLACE FUNCTION public.fn_auto_allocate_plan(p_hostel_type text, p_strict boolean DEFAULT true, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_semester_id uuid DEFAULT NULL::uuid, p_allow_overflow boolean DEFAULT true)
 RETURNS TABLE(plan_seq integer, plan_lp_id uuid, plan_profile_id uuid, plan_institution_id uuid, plan_semester_id uuid, plan_academic_year_id uuid, plan_bed_id uuid, plan_room_id uuid, plan_block_id uuid, plan_block_name text, plan_room_category_id uuid, plan_mess_category_id uuid, plan_tier integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cand record;
  v_bed uuid; v_room uuid; v_block uuid; v_bname text; v_cat uuid;
  v_tier int; v_ay uuid; v_seq int := 0;
BEGIN
  IF p_hostel_type IS NULL OR p_hostel_type NOT IN ('boys','girls') THEN
    RAISE EXCEPTION 'Hostel type must be boys or girls';
  END IF;

  DROP TABLE IF EXISTS _aap_pool;
  DROP TABLE IF EXISTS _aap_cand;
  DROP TABLE IF EXISTS _aap_sig_rooms;
  DROP TABLE IF EXISTS _aap_overflow_rooms;
  DROP TABLE IF EXISTS _aap_taken;

  -- Stage 1: the cheap, index-friendly predicates only. Splitting this out of
  -- the candidate build is a pure performance change with no effect on the
  -- result set (one WHERE clause is order-independent), but it stops the four
  -- LATERALs below — two of which recompute a learner's academic fee from
  -- scratch — from being evaluated for every hostel learner of this gender
  -- rather than only for the handful who still need a bed.
  --
  -- The INNER `JOIN profiles p` here is also what makes widening the lifecycle
  -- filter safe: learners with no login profile (every reserved learner who has
  -- not activated) are dropped before any bed is considered, so
  -- hostel_allocations.learner_id -> profiles(id) can never be violated.
  CREATE TEMP TABLE _aap_pool ON COMMIT DROP AS
    SELECT lp.id AS lp_id, p.id AS profile_id, lp.semester_id AS sem_id,
           lp.academic_year_id AS ay_id, lp.institution_id AS inst,
           lp.degree_id, lp.department_id, lp.program_id,
           lower(btrim(COALESCE(NULLIF(btrim(p.gender), ''), lp.gender))) AS gender,
           lower(coalesce(inst_t.name,'')) AS inst_name,
           lower(coalesce(lp.first_name,'')) AS fname,
           lower(coalesce(lp.last_name,''))  AS lname
    FROM learners_profiles lp
    JOIN profiles p ON p.learner_id = lp.id
    JOIN institutions inst_t ON inst_t.id = lp.institution_id
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      AND lp.lifecycle_status::text = ANY (public.fn_cl_roster_statuses())
      AND (COALESCE(NULLIF(btrim(p.gender), ''), NULLIF(btrim(lp.gender), '')) IS NULL
           OR (p_hostel_type = 'boys'
               AND lower(btrim(COALESCE(NULLIF(btrim(p.gender), ''), lp.gender))) IN ('male','m'))
           OR (p_hostel_type = 'girls'
               AND lower(btrim(COALESCE(NULLIF(btrim(p.gender), ''), lp.gender))) IN ('female','f')))
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id);

  -- Stage 2: the expensive per-learner resolutions, now over the narrow pool.
  CREATE TEMP TABLE _aap_cand ON COMMIT DROP AS
    SELECT c.lp_id, c.profile_id, c.sem_id, c.ay_id, c.inst,
           c.degree_id, c.department_id, c.program_id, c.gender,
           room_elig.cats AS room_cats, mess_elig.cats AS mess_cats,
           COALESCE(sem_fill.rank, 1) AS fill_rank,
           prim.is_primary,
           c.inst_name, c.fname, c.lname
    FROM _aap_pool c
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_room_categories(c.lp_id)) room_elig ON true
    LEFT JOIN LATERAL (SELECT array_agg(category_id) AS cats FROM fn_hostel_learner_mess_categories(c.lp_id)) mess_elig ON true
    LEFT JOIN LATERAL (
      SELECT bool_or(hbi.is_primary) AS is_primary
      FROM hostel_block_institutions hbi
      JOIN hostel_blocks hb ON hb.id = hbi.block_id
      WHERE hb.hostel_type::text = p_hostel_type
        AND hbi.institution_id = c.inst
    ) prim ON true
    LEFT JOIN LATERAL (
      SELECT min(array_position(r.semester_ids, c.sem_id)) AS rank
      FROM hostel_room_eligibility_rules r
      JOIN hostel_blocks hb ON hb.id = r.block_id
      WHERE r.is_active
        AND hb.hostel_type::text = p_hostel_type
        AND r.institution_id = c.inst
        AND (r.degree_id     IS NULL OR r.degree_id     = c.degree_id)
        AND (r.department_id IS NULL OR r.department_id = c.department_id)
        AND (r.program_id    IS NULL OR r.program_id    = c.program_id)
        AND cardinality(r.semester_ids) > 1
        AND c.sem_id = ANY(r.semester_ids)
    ) sem_fill ON true
    WHERE room_elig.cats IS NOT NULL
      AND prim.is_primary IS NOT NULL;

  CREATE TEMP TABLE _aap_sig_rooms ON COMMIT DROP AS
    SELECT s.inst, s.degree_id, s.department_id, s.program_id, s.sem_id,
           r.id AS room_id, r.category_id, r.block_id, r.floor, r.room_number,
           hb.name AS block_name, hc.type AS cat_type
    FROM (SELECT DISTINCT c.inst, c.degree_id, c.department_id, c.program_id, c.sem_id,
                 (array_agg(c.lp_id))[1] AS rep
          FROM _aap_cand c
          GROUP BY c.inst, c.degree_id, c.department_id, c.program_id, c.sem_id) s
    CROSS JOIN LATERAL (
      SELECT r.* FROM hostel_rooms r
      JOIN hostel_blocks hb2 ON hb2.id = r.block_id
      WHERE hb2.hostel_type::text = p_hostel_type AND r.room_purpose = 'student'
    ) r
    JOIN hostel_blocks hb ON hb.id = r.block_id
    LEFT JOIN hostel_categories hc ON hc.id = r.category_id
    WHERE fn_room_serves_institution(r.id, s.inst)
      AND fn_learner_strictly_eligible_for_room(s.rep, r.id, p_strict);

  CREATE INDEX ON _aap_sig_rooms (inst, degree_id, department_id, program_id, sem_id);

  CREATE TEMP TABLE _aap_overflow_rooms ON COMMIT DROP AS
    SELECT i.inst, r.id AS room_id, r.category_id, r.block_id, r.floor, r.room_number,
           hb.name AS block_name, hc.type AS cat_type
    FROM (SELECT DISTINCT c.inst FROM _aap_cand c) i
    CROSS JOIN LATERAL (
      SELECT r.* FROM hostel_rooms r
      JOIN hostel_blocks hb2 ON hb2.id = r.block_id
      WHERE hb2.hostel_type::text = p_hostel_type AND r.room_purpose = 'student'
    ) r
    JOIN hostel_blocks hb ON hb.id = r.block_id
    LEFT JOIN hostel_categories hc ON hc.id = r.category_id
    WHERE p_allow_overflow
      AND fn_room_serves_institution(r.id, i.inst)
      AND NOT EXISTS (
        SELECT 1 FROM hostel_room_eligibility_rules re
        WHERE re.is_active AND re.block_id = r.block_id
          AND CASE
                WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr
                             WHERE rr.rule_id = re.id)
                  THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr
                               WHERE rr.rule_id = re.id AND rr.room_id = r.id)
                ELSE (re.floor IS NULL OR re.floor = r.floor)
              END
      );

  CREATE INDEX ON _aap_overflow_rooms (inst);

  CREATE TEMP TABLE _aap_taken (bed_id uuid PRIMARY KEY) ON COMMIT DROP;

  FOR cand IN
    SELECT c.* FROM _aap_cand c
    ORDER BY c.fill_rank, c.is_primary DESC, c.inst_name, c.fname, c.lname, c.lp_id
  LOOP
    v_seq := v_seq + 1;
    v_bed := NULL; v_room := NULL; v_block := NULL;
    v_bname := NULL; v_cat := NULL; v_tier := NULL;

    v_ay := COALESCE(cand.ay_id,
                     (SELECT id FROM academic_years
                       WHERE institution_id = cand.inst AND is_active
                       ORDER BY start_date DESC LIMIT 1));

    IF v_ay IS NOT NULL THEN
      SELECT b.id, x.room_id, x.block_id, x.block_name, x.category_id, x.tier
        INTO v_bed, v_room, v_block, v_bname, v_cat, v_tier
      FROM (
        SELECT sr.room_id, sr.category_id, sr.block_id, sr.block_name,
               sr.floor, sr.room_number, sr.cat_type, 1 AS tier
        FROM _aap_sig_rooms sr
        WHERE sr.inst           IS NOT DISTINCT FROM cand.inst
          AND sr.degree_id      IS NOT DISTINCT FROM cand.degree_id
          AND sr.department_id  IS NOT DISTINCT FROM cand.department_id
          AND sr.program_id     IS NOT DISTINCT FROM cand.program_id
          AND sr.sem_id         IS NOT DISTINCT FROM cand.sem_id
        UNION ALL
        SELECT o.room_id, o.category_id, o.block_id, o.block_name,
               o.floor, o.room_number, o.cat_type, 2
        FROM _aap_overflow_rooms o
        WHERE o.inst IS NOT DISTINCT FROM cand.inst
      ) x
      JOIN hostel_beds b ON b.room_id = x.room_id AND b.status = 'available'
      WHERE x.category_id = ANY(cand.room_cats)
        AND (x.cat_type IS NULL
             OR (x.cat_type='boys'  AND cand.gender IN ('male','m'))
             OR (x.cat_type='girls' AND cand.gender IN ('female','f')))
        AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                        WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
        AND NOT EXISTS (SELECT 1 FROM _aap_taken t WHERE t.bed_id = b.id)
      ORDER BY array_position(cand.room_cats, x.category_id), x.tier,
               x.block_name, x.floor, x.room_number, b.bed_number
      LIMIT 1;
    END IF;

    IF v_bed IS NOT NULL THEN
      INSERT INTO _aap_taken(bed_id) VALUES (v_bed);
    END IF;

    plan_seq              := v_seq;
    plan_lp_id            := cand.lp_id;
    plan_profile_id       := cand.profile_id;
    plan_institution_id   := cand.inst;
    plan_semester_id      := cand.sem_id;
    plan_academic_year_id := v_ay;
    plan_bed_id           := v_bed;
    plan_room_id          := v_room;
    plan_block_id         := v_block;
    plan_block_name       := v_bname;
    plan_room_category_id := v_cat;
    plan_mess_category_id := CASE WHEN cand.mess_cats IS NOT NULL THEN cand.mess_cats[1] END;
    plan_tier             := v_tier;
    RETURN NEXT;
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_auto_allocate_candidates(p_hostel_type text, p_strict boolean DEFAULT true, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_semester_id uuid DEFAULT NULL::uuid, p_allow_overflow boolean DEFAULT true)
 RETURNS TABLE(learner_id uuid, full_name text, roll_number text, email text, institution_name text, program_name text, semester_name text, gender text, has_profile boolean, gender_ok boolean, not_allocated boolean, physical_rule_ok boolean, overflow_room_ok boolean, placement_tier text, bed_available boolean, target_block_name text, academic_year_id uuid, academic_year_name text, admission_academic_year_id uuid, admission_academic_year_name text, band_academic_year_id uuid, band_academic_year_name text, band_fee numeric, academic_bill_count integer, current_year_bill_count integer, bill_other_year_name text, current_year_fee numeric, resolved_room_category_id uuid, resolved_room_category_name text, resolved_mess_category_id uuid, resolved_mess_category_name text, bill_state text, stage text, verdict text, exclusion_reason text)
 LANGUAGE sql
 SECURITY DEFINER
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
           NULLIF(btrim(lp.roll_number), '') AS roll_number,
           CASE WHEN lower(lp.gender) LIKE 'm%' THEN 'boys'
                WHEN lower(lp.gender) LIKE 'f%' THEN 'girls' END AS lp_gender_type,
           lower(btrim(COALESCE(NULLIF(btrim(gp.gender), ''), lp.gender))) AS eff_gender
    FROM learners_profiles lp
    LEFT JOIN profiles gp ON gp.learner_id = lp.id
    WHERE lp.accommodation_type_id IN (SELECT id FROM accommodation_types WHERE code = 'hostel')
      AND lp.lifecycle_status::text = ANY (public.fn_cl_roster_statuses())
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id)
      AND (COALESCE(NULLIF(btrim(gp.gender), ''), NULLIF(btrim(lp.gender), '')) IS NULL
           OR (p_hostel_type = 'boys'
               AND lower(btrim(COALESCE(NULLIF(btrim(gp.gender), ''), lp.gender))) IN ('male','m'))
           OR (p_hostel_type = 'girls'
               AND lower(btrim(COALESCE(NULLIF(btrim(gp.gender), ''), lp.gender))) IN ('female','f')))
      AND NOT EXISTS (
        SELECT 1 FROM hostel_allocations ha2
        JOIN profiles pr2 ON pr2.learner_id = lp.id
        WHERE ha2.learner_id = pr2.id
          AND ha2.status IN ('active', 'pending_approval')
      )
  ),
  placement AS MATERIALIZED (
    SELECT pl.plan_lp_id, pl.plan_bed_id, pl.plan_block_name, pl.plan_tier
    FROM fn_auto_allocate_plan(
           p_hostel_type, p_strict, p_institution_id,
           p_program_id, p_semester_id, p_allow_overflow) pl
  ),
  unruled_rooms AS MATERIALIZED (
    SELECT sr.id AS room_id, sr.category_id, sr.cat_type,
           sr.block_name, sr.floor, sr.room_number
    FROM scope_rooms sr
    WHERE NOT EXISTS (
      SELECT 1 FROM hostel_room_eligibility_rules re
      WHERE re.is_active AND re.block_id = sr.block_id
        AND CASE
              WHEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr
                           WHERE rr.rule_id = re.id)
                THEN EXISTS (SELECT 1 FROM hostel_room_eligibility_rule_rooms rr
                             WHERE rr.rule_id = re.id AND rr.room_id = sr.id)
              ELSE (re.floor IS NULL OR re.floor = sr.floor)
            END
    )
  ),
  overflow_rooms AS MATERIALIZED (
    SELECT i.institution_id, ur.room_id, ur.category_id, ur.cat_type,
           ur.block_name, ur.floor, ur.room_number
    FROM (SELECT DISTINCT institution_id FROM raw_cohort) i
    CROSS JOIN unruled_rooms ur
    WHERE p_allow_overflow
      AND fn_room_serves_institution(ur.room_id, i.institution_id)
  ),
  sigs AS MATERIALIZED (
    SELECT rc.institution_id, rc.degree_id, rc.department_id, rc.program_id,
           rc.semester_id, (array_agg(rc.id))[1] AS rep
    FROM raw_cohort rc
    WHERE EXISTS (SELECT 1 FROM hostel_block_institutions bi
                  WHERE bi.institution_id = rc.institution_id
                    AND bi.block_id IN (SELECT id FROM blocks))
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
      c.roll_number,
      p.email, inst.name AS institution_name, prog.program_name, sem.semester_name,
      c.eff_gender AS gender,
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
      EXISTS (SELECT 1 FROM hostel_block_institutions bi
              WHERE bi.institution_id = c.institution_id
                AND bi.block_id IN (SELECT id FROM blocks)) AS block_access_ok,
      EXISTS (
        SELECT 1 FROM sig_rooms sr
        WHERE sr.rep = s.rep
          AND sr.category_id = ANY(ct.room_cats)
          AND (sr.cat_type IS NULL
               OR (sr.cat_type = 'boys'  AND c.eff_gender IN ('male','m'))
               OR (sr.cat_type = 'girls' AND c.eff_gender IN ('female','f')))
      ) AS physical_rule_ok,
      EXISTS (
        SELECT 1 FROM sig_rooms sr
        WHERE sr.rep = s.rep
          AND NOT (sr.category_id = ANY(ct.room_cats))
      ) AS physical_ok_other_category,
      (SELECT count(*)::int
         FROM free_beds bd2
         JOIN scope_rooms sr2 ON sr2.id = bd2.room_id
        WHERE sr2.category_id = ANY(ct.room_cats)
          AND (sr2.cat_type IS NULL
               OR (sr2.cat_type = 'boys'  AND c.eff_gender IN ('male','m'))
               OR (sr2.cat_type = 'girls' AND c.eff_gender IN ('female','f')))
      ) AS category_free_beds_anywhere,
      EXISTS (
        SELECT 1 FROM overflow_rooms orm
        WHERE orm.institution_id = c.institution_id
          AND orm.category_id = ANY(ct.room_cats)
          AND (orm.cat_type IS NULL
               OR (orm.cat_type = 'boys'  AND c.eff_gender IN ('male','m'))
               OR (orm.cat_type = 'girls' AND c.eff_gender IN ('female','f')))
      ) AS overflow_room_ok,
      (pl.plan_bed_id IS NOT NULL) AS bed_available,
      pl.plan_block_name AS target_block_name,
      CASE pl.plan_tier WHEN 1 THEN 'rule' WHEN 2 THEN 'overflow' END AS placement_tier
    FROM raw_cohort c
    JOIN cats ct ON ct.id = c.id
    JOIN fee  f  ON f.id  = c.id
    LEFT JOIN sigs s ON s.institution_id IS NOT DISTINCT FROM c.institution_id
                    AND s.degree_id      IS NOT DISTINCT FROM c.degree_id
                    AND s.department_id  IS NOT DISTINCT FROM c.department_id
                    AND s.program_id     IS NOT DISTINCT FROM c.program_id
                    AND s.semester_id    IS NOT DISTINCT FROM c.semester_id
    LEFT JOIN placement pl      ON pl.plan_lp_id = c.id
    LEFT JOIN profiles p        ON p.learner_id = c.id
    LEFT JOIN institutions inst ON inst.id = c.institution_id
    LEFT JOIN programs prog     ON prog.id = c.program_id
    LEFT JOIN semesters sem     ON sem.id = c.semester_id
    LEFT JOIN academic_years ay ON ay.id = c.academic_year_id
    LEFT JOIN academic_years aay ON aay.id = f.adm_ay
    LEFT JOIN hostel_categories rc ON rc.id = ct.room_cats[1]
    LEFT JOIN mess_categories   mc ON mc.id = ct.mess_cats[1]
  ),
  scored AS (
    SELECT b.*,
      (b.gender IS NOT NULL
        AND (b.resolved_room_category_type IS NULL
          OR (b.resolved_room_category_type = 'boys'  AND b.gender IN ('male','m'))
          OR (b.resolved_room_category_type = 'girls' AND b.gender IN ('female','f')))) AS gender_ok
    FROM base b
  )
  SELECT
    s.learner_id, s.full_name, s.roll_number, s.email,
    s.institution_name, s.program_name, s.semester_name,
    s.gender, s.has_profile, s.gender_ok, s.not_allocated, s.physical_rule_ok,
    s.overflow_room_ok, s.placement_tier,
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
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.block_access_ok
        OR NOT (s.physical_rule_ok OR s.overflow_room_ok) OR NOT s.bed_available
                               THEN 'eligibility'
      ELSE 'ok'
    END AS stage,
    CASE
      WHEN s.band_fee  IS NULL THEN 'out'
      WHEN s.room_cats IS NULL THEN 'out'
      WHEN NOT s.has_profile OR NOT s.gender_ok OR NOT s.block_access_ok
        OR NOT (s.physical_rule_ok OR s.overflow_room_ok) OR NOT s.bed_available
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
      WHEN s.gender IS NULL    THEN
        'Gender is not set on this learner — set it on the learner profile, then re-run the preview'
      WHEN NOT s.gender_ok     THEN 'Gender does not match the resolved room category'
      WHEN NOT s.block_access_ok THEN
        COALESCE(s.institution_name, 'This learner''s institution')
        || ' is not linked to any ' || p_hostel_type || ' block — link it under'
        || ' Campus Living → Blocks → Institutions before this learner can be placed'
      WHEN NOT (s.physical_rule_ok OR s.overflow_room_ok) AND s.physical_ok_other_category THEN
        'Rooms they may occupy are a different room category than their eligible '
        || COALESCE(s.resolved_room_category_name, 'category')
        || ' — fix the reservation rooms or the Category-Eligibility band'
      WHEN NOT (s.physical_rule_ok OR s.overflow_room_ok) THEN
        CASE WHEN p_strict
          THEN 'No physical-room rule reserves a room for this cohort in any ' || p_hostel_type || ' block (strict mode)'
          ELSE 'No room they can occupy in their category — every room is reserved for other cohorts'
        END
      WHEN NOT s.bed_available THEN
        CASE
          WHEN s.category_free_beds_anywhere > 0 THEN
            COALESCE(s.resolved_room_category_name, 'Their category')
            || ': ' || s.category_free_beds_anywhere::text
            || ' free bed' || CASE WHEN s.category_free_beds_anywhere = 1 THEN '' ELSE 's' END
            || ' exist in the ' || p_hostel_type || ' blocks, but none is left for this learner'
            || ' — every one is either reserved for another cohort or already taken by an'
            || ' earlier learner in this same run'
            || CASE WHEN p_allow_overflow
                 THEN '. Add this cohort to a physical-room rule that covers free rooms,'
                      || ' or free more beds in the rooms they already reach'
                 ELSE ' (overflow is off, so unreserved rooms were not considered)'
               END
          ELSE
            COALESCE(s.resolved_room_category_name, 'Their category')
            || ' is exhausted in every ' || p_hostel_type
            || ' block — no free bed in any '
            || COALESCE(s.resolved_room_category_name, 'eligible')
            || ' room, reserved or unreserved'
        END
      ELSE NULL
    END AS exclusion_reason
  FROM scored s
  ORDER BY s.full_name;
$function$;

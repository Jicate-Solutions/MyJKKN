-- ============================================================================
-- Campus Living — Auto-Allocate: ONE planner, two consumers. The preview now
-- rations beds instead of counting reachability (2026-08-11)
-- ============================================================================
--
-- ── THE BUG ─────────────────────────────────────────────────────────────────
-- Reported: the girls preview showed 32 eligible / 13 excluded, and Generate
-- produced a batch of TWO.
--
-- Measured, batch 06fb2396-0792-45ee-b370-46a10674ba5e: exactly 2 allocations,
-- both BSC (Nursing), both in Room 5 of Girls Hostel A. Room 5 held 2 free
-- beds. All 32 "eligible" learners were Nursing girls pointing at THOSE SAME
-- TWO BEDS.
--
-- CAUSE. fn_auto_allocate_candidates computed
--
--     (tgt.block_name IS NOT NULL) AS bed_available
--
-- from a LEFT JOIN LATERAL (... ORDER BY ... LIMIT 1) against the `free_beds`
-- CTE — a snapshot taken once for the whole query. It is a PER-LEARNER
-- existence test: "is there a free bed in a room this learner can reach". It
-- never marks a bed as consumed, so N learners sharing one cohort all report
-- true off the same single bed.
--
-- fn_auto_allocate_classic runs that identical query inside a FOR ... LOOP, and
-- each INSERT removes the bed from the pool through
-- NOT EXISTS (... status IN ('active','pending_approval')). It answers a
-- different question: "is one still left when this learner's turn comes".
--
-- So `verdict = 'in'` never meant "will be placed". It meant "is not blocked by
-- category, gender, fee band or room rules" — and the operator read the count
-- as a placement forecast, which is exactly how it reads on the page.
--
-- This is the SECOND time the gap has been diagnosed (20260810210000 recorded
-- "42 flipped to in against 3 reachable beds") and the first time it is fixed
-- rather than documented.
--
-- ── THE FIX: delete one of the two implementations ─────────────────────────
-- The preview did not merely *approximate* the allocator — it carried a
-- hand-copied replica of its ORDER BY, kept in step by a comment reading "Same
-- ORDER BY as fn_auto_allocate_classic, so this stays a real prediction". Every
-- regression in this engine's history is a copy that drifted from its original
-- (v_has_covering, the gender resolution sweep, the strict predicate).
--
-- fn_auto_allocate_plan now owns the decision ENTIRELY: it builds the candidate
-- set, resolves the reachable rooms for both tiers, walks candidates in the
-- allocator's order and hands each the best bed NOT ALREADY TAKEN BY AN EARLIER
-- CANDIDATE IN THE SAME RUN. It returns one row per candidate — plan_bed_id
-- NULL for anyone it could not place.
--
--     fn_auto_allocate_classic     loops the plan and writes it
--     fn_auto_allocate_candidates  joins the plan and displays it
--
-- Neither one decides anything any more, so `verdict = 'in'` is now literally
-- "the planner assigned this learner bed X", and the preview count equals the
-- batch size by construction rather than by vigilance.
--
-- Within-run consumption is tracked in a temp table (_aap_taken) rather than by
-- re-querying hostel_allocations, because the planner writes nothing.
--
-- ── SECOND FIX: learners with no block for their gender were INVISIBLE ──────
-- raw_cohort filtered on
--
--     lp.institution_id IN (SELECT bi.institution_id FROM hostel_block_institutions ...)
--
-- inside the WHERE clause, so a learner whose college is linked to no block of
-- that hostel type was dropped from the result entirely — counted as neither
-- eligible nor excluded, and invisible on the page. Found on ABINAYA
-- (8aa1e1e0-…), JKKN College of Arts and Science (Aided), the 44th unallocated
-- girl: the preview reported 43 candidates and she was not one of them.
--
-- The filter becomes a reported flag (block_access_ok) with its own exclusion
-- branch. `sigs` still excludes those learners, so the expensive per-signature
-- CROSS JOIN against fn_learner_strictly_eligible_for_room does not grow; the
-- join from base to sigs is now LEFT, which leaves s.rep NULL and correctly
-- yields physical_rule_ok = false for them.
--
-- ── VOLATILITY ─────────────────────────────────────────────────────────────
-- The planner creates temp tables, so it is VOLATILE, and a STABLE function may
-- not sensibly call it — fn_auto_allocate_candidates therefore becomes VOLATILE
-- too. PostgREST already reaches both through POST /rpc (supabase-js .rpc()),
-- so no client change is required. Neither signature changes, so both are plain
-- CREATE OR REPLACE and the EXECUTE grants survive.
--
-- fn_auto_allocate_plan is granted to NOBODY: both callers are SECURITY DEFINER
-- owned by postgres and reach it as the owner. It bypasses the authorization
-- check in fn_auto_allocate_classic, so EXECUTE is revoked from PUBLIC, anon
-- and authenticated explicitly.
--
-- ── NOT FIXED HERE, REPORTED ───────────────────────────────────────────────
-- fn_auto_allocate_candidates is SECURITY DEFINER, granted to `authenticated`,
-- and carries NO authorization check of its own (fn_auto_allocate_classic
-- does). Any logged-in user can therefore list every unallocated learner's
-- name, email, gender, fee band and bill state. Gating it is a one-line change
-- but 67 of 89 active roles already hold campus_living.allocations.view, so the
-- real remedy is de-granting that key — an RBAC job with its own blast radius,
-- deliberately not bundled into an allocation fix.
-- ============================================================================


-- ── 1. The planner — the single source of placement truth ──────────────────
-- Output columns are prefixed plan_ so that none of them can collide with a
-- column name inside the bodies below; an ambiguous bare reference in plpgsql
-- is a runtime error, not a compile-time one.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_plan(
  p_hostel_type text,
  p_strict boolean DEFAULT true,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_allow_overflow boolean DEFAULT true
)
RETURNS TABLE(
  plan_seq integer,
  plan_lp_id uuid,
  plan_profile_id uuid,
  plan_institution_id uuid,
  plan_semester_id uuid,
  plan_academic_year_id uuid,
  plan_bed_id uuid,
  plan_room_id uuid,
  plan_block_id uuid,
  plan_block_name text,
  plan_room_category_id uuid,
  plan_mess_category_id uuid,
  plan_tier integer
)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
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

  -- Both consumers may run in one transaction; ON COMMIT DROP alone would then
  -- collide on the second call.
  DROP TABLE IF EXISTS _aap_pool;
  DROP TABLE IF EXISTS _aap_cand;
  DROP TABLE IF EXISTS _aap_sig_rooms;
  DROP TABLE IF EXISTS _aap_overflow_rooms;
  DROP TABLE IF EXISTS _aap_taken;

  -- Stage 1: the cheap, index-friendly predicates only. Splitting this out of
  -- fn_auto_allocate_classic's single-WHERE candidate build is a pure
  -- performance change — one WHERE clause is order-independent, so the result
  -- set is identical — but it stops the four LATERALs in stage 2, two of which
  -- recompute a learner's academic fee from scratch, from being evaluated for
  -- every hostel learner of this gender instead of only the handful who still
  -- need a bed. Measured on the girls run: 1,894 ms -> 399 ms, same 43 rows and
  -- the same 43 beds. Generate carried this cost too and gets the same win.
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
      AND lp.lifecycle_status = 'active'
      AND (COALESCE(NULLIF(btrim(p.gender), ''), NULLIF(btrim(lp.gender), '')) IS NULL
           OR (p_hostel_type = 'boys'
               AND lower(btrim(COALESCE(NULLIF(btrim(p.gender), ''), lp.gender))) IN ('male','m'))
           OR (p_hostel_type = 'girls'
               AND lower(btrim(COALESCE(NULLIF(btrim(p.gender), ''), lp.gender))) IN ('female','f')))
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.learner_id=p.id AND a.status IN ('active','pending_approval'))
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR lp.program_id     = p_program_id)
      AND (p_semester_id    IS NULL OR lp.semester_id    = p_semester_id);

  -- Stage 2: the expensive per-learner resolutions, over the narrow pool.
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

  -- Tier 1: rooms the cohort's own physical rule covers. The predicate reads
  -- only the 5-tuple off the learner, so it is evaluated once per distinct
  -- signature rather than once per learner (see 20260810160000).
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

  -- Tier 2: rooms NO active rule covers. The CASE is a verbatim copy of
  -- v_has_covering in fn_learner_strictly_eligible_for_room and MUST stay
  -- identical — if they drift, overflow hands out a bed the predicate says
  -- belongs to another cohort.
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

  -- The whole point of this function: beds consumed EARLIER IN THIS RUN.
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

    -- No academic year is a hard skip in the allocator; report it as unplaced
    -- rather than handing back a bed the writer would refuse.
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

REVOKE ALL ON FUNCTION public.fn_auto_allocate_plan(text, boolean, uuid, uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_auto_allocate_plan(text, boolean, uuid, uuid, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.fn_auto_allocate_plan(text, boolean, uuid, uuid, uuid, boolean) FROM authenticated;


-- ── 2. The allocator now only WRITES the plan ──────────────────────────────
-- Authorization, the hostel-year guard and the tier-policy lookup are unchanged
-- and still run before anything is planned. Signature unchanged.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_classic(
  p_hostel_type text,
  p_hostel_year_id uuid DEFAULT NULL::uuid,
  p_strict boolean DEFAULT true,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_allow_overflow boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch uuid; v_tier uuid; v_actor uuid := auth.uid();
  v_alloc int := 0; v_skip int := 0; v_overflow int := 0;
  v_year uuid; v_mess uuid; pl record;
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

  INSERT INTO hostel_allocation_batches (block_id, category_id, hostel_year_id, status, created_by)
  VALUES (NULL, NULL, v_year, 'pending_approval', v_actor)
  RETURNING id INTO v_batch;

  FOR pl IN
    SELECT * FROM fn_auto_allocate_plan(
      p_hostel_type, p_strict, p_institution_id, p_program_id, p_semester_id, p_allow_overflow)
  LOOP
    IF pl.plan_bed_id IS NULL THEN v_skip := v_skip + 1; CONTINUE; END IF;
    IF pl.plan_tier = 2 THEN v_overflow := v_overflow + 1; END IF;

    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
      allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      tier_id, batch_id, allocated_by, warden_id
    ) VALUES (
      pl.plan_institution_id, pl.plan_profile_id, pl.plan_block_id, pl.plan_room_id, pl.plan_bed_id,
      pl.plan_academic_year_id, pl.plan_semester_id,
      'fresh', CURRENT_DATE, 'pending_approval', '', '', '',
      v_tier, v_batch, v_actor,
      (SELECT user_id FROM user_block_access WHERE block_id = pl.plan_block_id AND revoked_at IS NULL LIMIT 1)
    );

    v_mess := pl.plan_mess_category_id;
    UPDATE learners_profiles
      SET hostel_category_id = pl.plan_room_category_id,
          mess_category_id   = COALESCE(v_mess, mess_category_id),
          updated_at = now()
      WHERE id = pl.plan_lp_id;

    v_alloc := v_alloc + 1;
  END LOOP;

  UPDATE hostel_allocation_batches
    SET allocated_count = v_alloc, skipped_count = v_skip,
        notes = format('%s allocated across all %s blocks (%s physical mode; rules-driven category + mess; block and room decided by the physical-room rules). %s of them overflowed into UNRESERVED rooms of their own category because every room reserved for their cohort was full (%s). %s skipped (no free bed they can occupy / reserved rooms hold no space for them / gender / no academic year). Strict: learners with no rule-resolved room category are excluded. Cohort: lifecycle_status = active only.',
                       v_alloc, p_hostel_type,
                       CASE WHEN p_strict THEN 'STRICT — only cohorts matching a physical rule' ELSE 'open — rule-free rooms shared' END,
                       v_overflow,
                       CASE WHEN p_allow_overflow THEN 'overflow ON; category never changed, no other cohort''s reserved room used' ELSE 'overflow OFF' END,
                       v_skip)
    WHERE id = v_batch;

  RETURN v_batch;
END
$function$;

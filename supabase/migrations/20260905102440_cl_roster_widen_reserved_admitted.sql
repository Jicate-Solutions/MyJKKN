-- Campus Living roster: widen from lifecycle_status='active' to
-- active + reserved + admitted.
--
-- WHY
-- ---
-- /campus-living/residents (Learners tab) showed only 754 of the 836 learners
-- flagged accommodation_type='hostel'. The 82 hidden rows are 64 `reserved` and
-- 18 `admitted` learners -- people who have paid enough to hold a seat but have
-- not crossed the fee threshold that promotes them to `active`. Wardens could
-- not see them, plan beds for them, or bill them.
--
-- HISTORY (read before narrowing this again)
-- ------------------------------------------
-- 20260608130000 widened this exact view to active+reserved+admitted;
-- 20260608150000 narrowed it back to active-only ~2h later ("revised
-- stakeholder call"). This migration deliberately reverses that. The safety
-- that was missing in June now lives in the SERVICE layer: every read defaults
-- to ['active'] (CL_DEFAULT_ROSTER_STATUSES in
-- lib/services/campus-living/roster-statuses.ts), so widening the view changes
-- what is AVAILABLE, never what is SHOWN by default.
--
-- THE ALLOCATION BLOCKER
-- ---------------------
-- hostel_allocations.learner_id REFERENCES profiles(id), and the login profile
-- is only created at the admitted->active activation step. 46 of the 64
-- reserved and 2 of the 18 admitted learners therefore have NO profiles row and
-- physically cannot hold a bed. Rather than let the UI discover this as a 23503,
-- the view now projects `has_login_profile` so the Allocate action can be
-- disabled with the real reason.
--
-- WHY A HELPER FUNCTION
-- --------------------
-- The `= 'active'` predicate was copy-pasted across 6 independent sites. Fixing
-- only the view produces a half-working feature: rows visible in Residents but
-- absent from Unallocated and from auto-allocation. fn_cl_roster_statuses() is
-- now the single source of truth for "who counts as a campus-living resident".

-- ---------------------------------------------------------------------------
-- 1. The single source of truth
-- ---------------------------------------------------------------------------
-- IMMUTABLE + a constant body means the planner inlines this, so there is no
-- per-row cost even inside the 15-join v_learner_hostelites.
CREATE OR REPLACE FUNCTION public.fn_cl_roster_statuses()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $$ SELECT ARRAY['active','reserved','admitted']::text[] $$;

COMMENT ON FUNCTION public.fn_cl_roster_statuses() IS
  'Lifecycle statuses that count as a Campus Living resident. Single source of '
  'truth for v_learner_hostelites, fn_hostel_unallocated_candidates, the '
  'fn_auto_allocate_* family and the hostel fee-category bulk functions. '
  'Mirrored in TypeScript as CL_ROSTER_STATUSES '
  '(lib/services/campus-living/roster-statuses.ts).';

-- ---------------------------------------------------------------------------
-- 2. v_learner_hostelites -- widen + project has_login_profile
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE, never DROP: a DROP takes the ACL with it, and
-- __tests__/ci/check-anon-exposure-live.test.ts asserts this view stays revoked
-- from anon/PUBLIC. Replace can only APPEND columns, which is why
-- has_login_profile goes last.
--
-- NOTE: ha.status='active' below is the LEFT JOIN condition for the current
-- block/room/bed display columns -- it is NOT a row filter. An unallocated
-- hosteler still appears, with current_block_id NULL. That is deliberate: the
-- Residents list must show the people who still need a bed.
CREATE OR REPLACE VIEW public.v_learner_hostelites AS
 SELECT lp.id,
    lp.first_name,
    lp.last_name,
    lp.roll_number,
    lp.student_email,
    lp.college_email,
    lp.gender,
    lp.institution_id,
    acc.code AS accommodation_type,
    lp.hostel_fee,
    lp.dayscholar_fee,
    lp.father_name,
    lp.mother_name,
    lp.admission_year_id,
    lp.degree_id,
    lp.department_id,
    lp.program_id,
    lp.semester_id,
    lp.section_id,
    lp.academic_year_id,
    pr.program_name,
    ay.year AS program_start_year,
    (ay.year::numeric + pr.program_duration_yrs)::integer AS program_end_year,
        CASE
            WHEN lp.admission_year_id IS NOT NULL AND ay.year IS NOT NULL THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - ay.year + 1, pr.program_duration_yrs::integer + 1))
            WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM b.start_date)::integer + 1, EXTRACT(year FROM b.end_date)::integer - EXTRACT(year FROM b.start_date)::integer + 1))
            WHEN lp.enquiry_date IS NOT NULL THEN GREATEST(1, EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM lp.enquiry_date)::integer + 1)
            ELSE NULL::integer
        END AS year_of_study,
    ha.block_id AS current_block_id,
    ha.room_id AS current_room_id,
    ha.bed_id AS current_bed_id,
    ha.id AS current_allocation_id,
    hb.name AS current_block_name,
    hb.code AS current_block_code,
    hr.room_number AS current_room_number,
    hbd.bed_number AS current_bed_number,
        CASE
            WHEN lp.admission_year_id IS NOT NULL AND ay.year IS NOT NULL THEN 'admission_year'::text
            WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN 'batch'::text
            WHEN lp.enquiry_date IS NOT NULL THEN 'enquiry'::text
            ELSE NULL::text
        END AS year_source,
    dg.degree_name,
    sm.semester_name,
    lp.lifecycle_status,
    acy.academic_year_name,
    lp.hostel_category_id,
    hc.name AS hostel_category_name,
    hc.type AS hostel_category_type,
    lp.mess_category_id,
    mc.name AS mess_category_name,
    lp.student_mobile,
    lp.father_mobile,
    lp.mother_mobile,
    -- APPENDED 2026-09-05. hostel_allocations.learner_id FKs profiles(id), and
    -- the login profile is only created at activation, so a reserved learner
    -- with no profiles row cannot be given a bed. Projecting it here lets the
    -- UI disable Allocate with the reason instead of surfacing a 23503.
    -- profiles.learner_id is 1:1, so this LEFT JOIN multiplies no rows.
    (palloc.id IS NOT NULL) AS has_login_profile
   FROM learners_profiles lp
     LEFT JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
     LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
     LEFT JOIN batches b ON b.id = lp.batch_id
     LEFT JOIN programs pr ON pr.id = lp.program_id
     LEFT JOIN profiles palloc ON palloc.learner_id = lp.id
     LEFT JOIN hostel_allocations ha ON ha.learner_id = palloc.id AND ha.status = 'active'::allocation_status_enum
     LEFT JOIN hostel_blocks hb ON hb.id = ha.block_id
     LEFT JOIN hostel_rooms hr ON hr.id = ha.room_id
     LEFT JOIN hostel_beds hbd ON hbd.id = ha.bed_id
     LEFT JOIN degrees dg ON dg.id = lp.degree_id
     LEFT JOIN semesters sm ON sm.id = lp.semester_id
     LEFT JOIN academic_years acy ON acy.id = lp.academic_year_id
     LEFT JOIN hostel_categories hc ON hc.id = lp.hostel_category_id
     LEFT JOIN mess_categories mc ON mc.id = lp.mess_category_id
  WHERE acc.code = 'hostel'::text
    AND lp.lifecycle_status::text = ANY (public.fn_cl_roster_statuses());

-- ---------------------------------------------------------------------------
-- 3. v_learner_hostelites_scoped -- the authorization boundary
-- ---------------------------------------------------------------------------
-- This view lists its columns EXPLICITLY rather than SELECT v.*, because
-- Postgres freezes a star at creation time (a previous migration had to
-- re-expand it for exactly this reason). So it must be replaced too, with
-- has_login_profile appended.
--
-- The WHERE is unchanged and remains the non-forgeable boundary: the base view
-- bypasses RLS, so every client-side read must hit THIS view, which re-derives
-- scope from auth.uid() server-side.
CREATE OR REPLACE VIEW public.v_learner_hostelites_scoped AS
 SELECT v.id,
    v.first_name,
    v.last_name,
    v.roll_number,
    v.student_email,
    v.college_email,
    v.gender,
    v.institution_id,
    v.accommodation_type,
    v.hostel_fee,
    v.dayscholar_fee,
    v.father_name,
    v.mother_name,
    v.admission_year_id,
    v.degree_id,
    v.department_id,
    v.program_id,
    v.semester_id,
    v.section_id,
    v.academic_year_id,
    v.program_name,
    v.program_start_year,
    v.program_end_year,
    v.year_of_study,
    v.current_block_id,
    v.current_room_id,
    v.current_bed_id,
    v.current_allocation_id,
    v.current_block_name,
    v.current_block_code,
    v.current_room_number,
    v.current_bed_number,
    v.year_source,
    v.degree_name,
    v.semester_name,
    v.lifecycle_status,
    v.academic_year_name,
    v.hostel_category_id,
    v.hostel_category_name,
    v.hostel_category_type,
    v.mess_category_id,
    v.mess_category_name,
    v.student_mobile,
    v.father_mobile,
    v.mother_mobile,
    v.has_login_profile
   FROM v_learner_hostelites v
  WHERE is_super_admin() OR
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM user_block_access uba
              WHERE uba.user_id = auth.uid() AND uba.revoked_at IS NULL)) THEN v.current_block_id IS NOT NULL AND (EXISTS ( SELECT 1
               FROM user_block_access uba
              WHERE uba.user_id = auth.uid() AND uba.revoked_at IS NULL AND uba.block_id = v.current_block_id))
            ELSE role_has_institution_access(v.institution_id)
        END;

-- ---------------------------------------------------------------------------
-- 4. fn_hostel_unallocated_candidates -- widen + surface lifecycle_status
-- ---------------------------------------------------------------------------
-- Without this, the 82 newly-visible learners would appear in Residents but
-- never in Allocations -> Unallocated, leaving no path to a bed.
--
-- The 48 with no login profile need NO new guard: this function already LEFT
-- JOINs profiles, computes has_profile, forces readiness='incomplete' and emits
-- 'No login profile' in missing_items. Widening the lifecycle filter is enough.
--
-- lifecycle_status is added to the return so the Unallocated list can badge a
-- reserved learner instead of showing an unexplained new name. That changes the
-- RETURNS TABLE signature, so CREATE OR REPLACE is refused and a DROP is
-- required -- and a DROP takes the ACL with it. The GRANTs at the end of this
-- block restore exactly what was there before (postgres, authenticated,
-- service_role; deliberately NOT anon).
DROP FUNCTION IF EXISTS public.fn_hostel_unallocated_candidates(uuid);

CREATE OR REPLACE FUNCTION public.fn_hostel_unallocated_candidates(p_institution_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(learner_id uuid, first_name text, last_name text, full_name text, email text, gender text, institution_id uuid, institution_name text, program_name text, semester_name text, academic_year_id uuid, academic_year_name text, lifecycle_status text, has_profile boolean, gender_set boolean, academic_year_set boolean, room_category_resolved boolean, mess_category_resolved boolean, resolved_room_category_name text, resolved_mess_category_name text, bill_state text, readiness text, missing_items text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT
      lp.id,
      lp.first_name,
      lp.last_name,
      lp.gender AS lp_gender,
      lp.institution_id,
      lp.program_id,
      lp.semester_id,
      lp.academic_year_id,
      lp.lifecycle_status,
      room_elig.cats AS room_cats,
      mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    LEFT JOIN LATERAL (
      SELECT array_agg(category_id) AS cats
      FROM fn_hostel_learner_room_categories(lp.id)
    ) room_elig ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(category_id) AS cats
      FROM fn_hostel_learner_mess_categories(lp.id)
    ) mess_elig ON true
    WHERE lp.accommodation_type_id IN (
            SELECT id FROM accommodation_types WHERE code = 'hostel'
          )
      AND lp.lifecycle_status::text = ANY (public.fn_cl_roster_statuses())
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND NOT EXISTS (
        SELECT 1
        FROM hostel_allocations ha2
        JOIN profiles pr2 ON pr2.learner_id = lp.id
        WHERE ha2.learner_id = pr2.id
          AND ha2.status IN ('active', 'pending_approval')
      )
  ),
  enriched AS (
    SELECT
      c.id                                                          AS learner_id,
      c.first_name,
      c.last_name,
      COALESCE(
        p.full_name,
        NULLIF(btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
        p.email
      )                                                             AS full_name,
      p.email,
      lower(btrim(COALESCE(NULLIF(btrim(p.gender), ''), c.lp_gender)))  AS gender,
      c.institution_id,
      inst.name                                                     AS institution_name,
      prog.program_name,
      sem.semester_name,
      c.academic_year_id,
      ay.academic_year_name,
      c.lifecycle_status::text                                      AS lifecycle_status,
      (p.id IS NOT NULL)                                            AS has_profile,
      (COALESCE(NULLIF(btrim(p.gender), ''), NULLIF(btrim(c.lp_gender), '')) IS NOT NULL) AS gender_set,
      (c.academic_year_id IS NOT NULL)                              AS academic_year_set,
      (c.room_cats IS NOT NULL)                                     AS room_category_resolved,
      (c.mess_cats IS NOT NULL)                                     AS mess_category_resolved,
      rc.name                                                       AS resolved_room_category_name,
      mc.name                                                       AS resolved_mess_category_name,
      CASE
        WHEN c.academic_year_id IS NULL THEN 'none'
        WHEN (
          SELECT count(*) FROM billing_student_bills b
          WHERE b.student_id = c.id
            AND b.fee_source = 'academic'
            AND b.status NOT IN ('cancelled','superseded')
            AND b.academic_year_id = c.academic_year_id
        ) > 0 THEN 'matched'
        WHEN EXISTS (
          SELECT 1 FROM billing_student_bills b
          WHERE b.student_id = c.id
            AND b.fee_source = 'academic'
            AND b.status NOT IN ('cancelled','superseded')
            AND b.academic_year_id IS NOT NULL
            AND b.academic_year_id IS DISTINCT FROM c.academic_year_id
        ) THEN 'different_year'
        WHEN EXISTS (
          SELECT 1 FROM billing_student_bills b
          WHERE b.student_id = c.id
            AND b.fee_source = 'academic'
            AND b.status NOT IN ('cancelled','superseded')
        ) THEN 'untagged'
        ELSE 'none'
      END                                                           AS bill_state,
      c.room_cats,
      c.mess_cats
    FROM candidates c
    LEFT JOIN profiles       p    ON p.learner_id   = c.id
    LEFT JOIN institutions   inst ON inst.id         = c.institution_id
    LEFT JOIN programs       prog ON prog.id         = c.program_id
    LEFT JOIN semesters      sem  ON sem.id          = c.semester_id
    LEFT JOIN academic_years ay   ON ay.id           = c.academic_year_id
    LEFT JOIN hostel_categories rc ON rc.id          = c.room_cats[1]
    LEFT JOIN mess_categories   mc ON mc.id          = c.mess_cats[1]
  )
  SELECT
    e.learner_id,
    e.first_name,
    e.last_name,
    e.full_name,
    e.email,
    e.gender,
    e.institution_id,
    e.institution_name,
    e.program_name,
    e.semester_name,
    e.academic_year_id,
    e.academic_year_name,
    e.lifecycle_status,
    e.has_profile,
    e.gender_set,
    e.academic_year_set,
    e.room_category_resolved,
    e.mess_category_resolved,
    e.resolved_room_category_name,
    e.resolved_mess_category_name,
    e.bill_state,
    CASE
      WHEN e.has_profile
        AND e.gender_set
        AND e.academic_year_set
        AND e.room_category_resolved
        AND e.bill_state = 'matched'
      THEN 'ready'
      ELSE 'incomplete'
    END                                                             AS readiness,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN NOT e.has_profile             THEN 'No login profile'                         END,
      CASE WHEN NOT e.gender_set              THEN 'Gender not set'                           END,
      CASE WHEN NOT e.academic_year_set       THEN 'Academic year not set'                    END,
      CASE WHEN NOT e.room_category_resolved  THEN 'No room-category eligibility rule'        END,
      CASE WHEN e.bill_state = 'none'         THEN 'No academic bill generated'               END,
      CASE WHEN e.bill_state = 'different_year' THEN 'Bill tagged to a different academic year' END,
      CASE WHEN e.bill_state = 'untagged'     THEN 'Academic bill not year-tagged'            END
    ], NULL)                                                        AS missing_items
  FROM enriched e
  ORDER BY
    (CASE
       WHEN e.has_profile AND e.gender_set AND e.academic_year_set
            AND e.room_category_resolved AND e.bill_state = 'matched'
       THEN 0 ELSE 1
     END),
    e.full_name;
$function$;

-- Restore the ACL the DROP removed. Captured from
-- information_schema.routine_privileges immediately before the drop.
--
-- The REVOKE is NOT optional and is easy to miss: CREATE FUNCTION grants
-- EXECUTE to PUBLIC by default, and PUBLIC includes `anon`. This function is
-- SECURITY DEFINER with no internal permission check -- it relies entirely on
-- its ACL -- so without the REVOKE an unauthenticated caller could enumerate
-- learner names and emails. The pre-drop ACL was exactly the three roles below
-- and no PUBLIC; verified after applying.
REVOKE ALL ON FUNCTION public.fn_hostel_unallocated_candidates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_hostel_unallocated_candidates(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_hostel_unallocated_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hostel_unallocated_candidates(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Hostel fee-category functions -- widen
-- ---------------------------------------------------------------------------
-- 60 of the 64 reserved and all 18 admitted learners already carry a
-- hostel_category_id, so leaving these on active-only would mean their
-- categories could never be re-synced from the fee bands.
--
-- Both keep their `has academic bill` requirement, which is the real gate here:
-- a learner with no academic bill still lands on reason='no_academic_bill' and
-- changes nothing.
CREATE OR REPLACE FUNCTION public.fn_apply_hostel_fee_categories_bulk(p_institution uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id      uuid;
  v_scanned int := 0;
  v_updated int := 0;
BEGIN
  -- auth.uid() IS NULL => service-role / migration backfill (allowed).
  IF auth.uid() IS NOT NULL
     AND NOT user_has_permission('campus_living.settings.edit') THEN
    RAISE EXCEPTION 'Not authorized to sync learner categories'
      USING ERRCODE = '42501';
  END IF;

  FOR v_id IN
    SELECT lp.id
    FROM learners_profiles lp
    JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
    WHERE acc.code = 'hostel'
      AND lp.lifecycle_status::text = ANY (public.fn_cl_roster_statuses())
      AND (p_institution IS NULL OR lp.institution_id = p_institution)
      AND EXISTS (
        SELECT 1
        FROM billing_student_bills b
        WHERE b.student_id = lp.id
          AND b.fee_source = 'academic'
          AND b.status NOT IN ('cancelled','superseded')
      )
  LOOP
    v_scanned := v_scanned + 1;
    IF public.fn_apply_hostel_fee_categories(v_id) THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('scanned', v_scanned, 'updated', v_updated);
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_preview_hostel_fee_categories(p_institution uuid DEFAULT NULL::uuid)
 RETURNS TABLE(learner_id uuid, learner_name text, roll_number text, institution_name text, program_name text, semester_name text, quota_name text, gender text, band_fee numeric, band_academic_year_name text, has_academic_bill boolean, is_allocated boolean, reason text, current_room text, new_room text, current_mess text, new_mess text, will_change boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_gender_type text; v_fee numeric; v_fee_year text; v_has_bill boolean; v_allocated boolean;
  v_room uuid; v_mess uuid; v_new_room uuid; v_new_mess uuid; v_reason text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT user_has_permission('campus_living.settings.edit') THEN
    RAISE EXCEPTION 'Not authorized to preview learner category sync'
      USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT lp.id AS lid,
           NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS lname,
           lp.roll_number AS lroll, lp.gender AS lgender,
           lp.hostel_category_id AS cur_room_id, lp.mess_category_id AS cur_mess_id,
           i.name AS inst_name, p.program_name AS prog_name,
           s.semester_name AS sem_name, q.name AS q_name
    FROM learners_profiles lp
    JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id AND acc.code = 'hostel'
    LEFT JOIN institutions i ON i.id = lp.institution_id
    LEFT JOIN programs p ON p.id = lp.program_id
    LEFT JOIN semesters s ON s.id = lp.semester_id
    LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE lp.lifecycle_status::text = ANY (public.fn_cl_roster_statuses())
      AND (p_institution IS NULL OR lp.institution_id = p_institution)
    ORDER BY i.name, p.program_name, lname
  LOOP
    v_gender_type := CASE WHEN lower(r.lgender) LIKE 'm%' THEN 'boys'
                          WHEN lower(r.lgender) LIKE 'f%' THEN 'girls' ELSE NULL END;
    v_has_bill := EXISTS (
      SELECT 1 FROM billing_student_bills b
      WHERE b.student_id = r.lid AND b.fee_source = 'academic'
        AND b.status NOT IN ('cancelled','superseded'));

    v_fee := NULL; v_fee_year := NULL;
    SELECT bf.fee, bf.academic_year_name INTO v_fee, v_fee_year
    FROM fn_learner_band_academic_fee(r.lid) bf;

    v_allocated := EXISTS (
      SELECT 1 FROM hostel_allocations ha
      JOIN profiles pr ON pr.id = ha.learner_id
      WHERE pr.learner_id = r.lid AND ha.status = 'active');

    v_room := NULL; v_mess := NULL;

    IF v_has_bill THEN
      SELECT gv.id INTO v_room
      FROM fn_hostel_learner_room_categories(r.lid) rr
      JOIN hostel_categories bc ON bc.id = rr.category_id
      JOIN hostel_categories gv ON gv.name = bc.name
                               AND gv.type = v_gender_type AND gv.is_active
      LIMIT 1;

      SELECT gv.id INTO v_mess
      FROM fn_hostel_learner_mess_categories(r.lid) mm
      JOIN mess_categories bc ON bc.id = mm.category_id
      JOIN mess_categories gv ON gv.name = bc.name
                             AND gv.type = v_gender_type AND gv.is_active
      LIMIT 1;

      IF v_room IS NOT NULL OR v_mess IS NOT NULL THEN
        v_reason := 'band_match';
      ELSIF v_fee IS NULL THEN
        v_reason := 'classic_default_fee_unknown';
      ELSE
        v_reason := 'classic_default_no_band';
      END IF;

      IF v_room IS NULL AND v_gender_type IS NOT NULL THEN
        SELECT hc.id INTO v_room FROM hostel_categories hc
        WHERE hc.name = 'Classic Room' AND hc.type = v_gender_type AND hc.is_active
        ORDER BY hc.sort_order LIMIT 1;
      END IF;
      IF v_mess IS NULL AND v_gender_type IS NOT NULL THEN
        SELECT mc.id INTO v_mess FROM mess_categories mc
        WHERE mc.name = 'Classic' AND mc.type = v_gender_type AND mc.is_active
        ORDER BY mc.sort_order LIMIT 1;
      END IF;
    ELSE
      v_reason := 'no_academic_bill';
    END IF;

    v_new_room := CASE WHEN v_allocated THEN r.cur_room_id
                       ELSE COALESCE(v_room, r.cur_room_id) END;
    v_new_mess := COALESCE(v_mess, r.cur_mess_id);

    learner_id              := r.lid;
    learner_name            := r.lname;
    roll_number             := r.lroll;
    institution_name        := r.inst_name;
    program_name            := r.prog_name;
    semester_name           := r.sem_name;
    quota_name              := r.q_name;
    gender                  := r.lgender;
    band_fee                := v_fee;
    band_academic_year_name := v_fee_year;
    has_academic_bill       := v_has_bill;
    is_allocated            := v_allocated;
    reason                  := v_reason;
    current_room            := (SELECT hc.name FROM hostel_categories hc WHERE hc.id = r.cur_room_id);
    new_room                := (SELECT hc.name FROM hostel_categories hc WHERE hc.id = v_new_room);
    current_mess            := (SELECT mc.name FROM mess_categories mc WHERE mc.id = r.cur_mess_id);
    new_mess                := (SELECT mc.name FROM mess_categories mc WHERE mc.id = v_new_mess);
    will_change             := (v_new_room IS DISTINCT FROM r.cur_room_id)
                            OR (v_new_mess IS DISTINCT FROM r.cur_mess_id);
    RETURN NEXT;
  END LOOP;
END
$function$;

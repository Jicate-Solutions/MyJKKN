-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  SUPERSEDED — DO NOT APPLY / DO NOT REPLAY THIS FILE.                     ║
-- ║  Replaced by 20260909010000_induction_peer_mentor_band_second_year_and_-  ║
-- ║  above.sql, which is what is live.                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- IT NEVER APPLIED. Verified against production 2026-08-21: pg_proc held zero
-- rows for public.fn_induction_peer_mentor_year, and the deployed
-- fn_induction_assignable_peer_mentors was still the 20260818100000 body with
-- the `ceil(sem.semester_order::numeric / 2)` band. It could not have applied as
-- written: it declares p_duration_yrs as `integer` and then calls the function
-- with programs.program_duration_yrs, which is numeric(3,1). numeric -> integer
-- is an assignment cast, not an implicit one, so the call did not resolve and
-- the file errored out. Its header claims production measurements; those were
-- taken, but the migration that was supposed to act on them never landed.
--
-- IT IS NOW ACTIVELY DANGEROUS, which it was not before. 20260909010000 created
-- fn_induction_peer_mentor_year with a `numeric` duration parameter — the type
-- this file was missing. So the resolution failure that used to make this file
-- abort harmlessly no longer happens. Replaying it today would SUCCEED, and in
-- succeeding would:
--   1. add a second, integer-duration overload of fn_induction_peer_mentor_year,
--      making the call site ambiguous; and
--   2. recreate BOTH picker functions with the old capped band
--      `BETWEEN 2 AND LEAST(3, duration)` — silently reverting the live rule
--      back to "2nd and 3rd year only" and re-emptying the picker for JKKN
--      Dental (500 eligible), Nursing (229) and Allied Health (240).
--
-- A fresh `db reset` is safe: 20260909010000 sorts after this file and drops the
-- integer overload before recreating everything. The danger is an out-of-order
-- manual run of THIS file alone — in the SQL Editor, or by someone working
-- through the migration list by hand. Do not do that.
--
-- Everything below is kept verbatim as history. The reasoning about
-- semester_order being untrustworthy is correct and was carried into
-- 20260909010000; only the band and the parameter type changed.
--
-- ── original header follows ─────────────────────────────────────────────────
--
-- 20260901020000_induction_peer_mentor_year_band_from_admission_year.sql
-- Senior Peer Mentor picker — the year band stops trusting semesters.semester_order.
--
-- THE BUG, as reported: searching a real student in "Appoint a Senior Peer
-- Mentor" (JKKN College of Allied Health Sciences, "Manos24cct@jkkn.ac.in")
-- returned "No eligible student matches". The search WAS matching college_email
-- already (20260901010000 added that) — the row was being thrown away one
-- predicate later, by the year band:
--
--     ceil(sem.semester_order::numeric / 2) BETWEEN 2 AND LEAST(3, duration)
--
-- That formula assumes `semesters` rows are per-semester and ordered 1..N. Half
-- of them are not. Measured 2026-08-19 on production data: of 430 semester rows,
-- 184 carry semester_order = 1, and they are named "1 Year", "2 Year", "3 Year",
-- "4 Year", "TERM" — the year-based programmes (Dental, Nursing, Allied Health,
-- and every school). For those learners ceil(1/2) = 1 for EVERYBODY, so the band
-- 2..3 matched nobody and three colleges had a permanently empty picker:
--
--     college                              eligible before   eligible after
--     JKKN Dental College and Hospital                   0              234
--     JKKN College of Allied Health Sci.                 0              139
--     JKKN College of Nursing and Research               0              114
--
-- The learner in the report is a case in point: BSC (CCT), 4-year programme,
-- admitted 2024-2025, sitting on the semester row named "2 Year" whose
-- semester_order is 1. Third year by every other page in this app; year 1, and
-- therefore invisible, to this one.
--
-- THE FIX. Derive the year the way the rest of the app already does — from the
-- admission year (fn_learner_year_of_study, which the billing year-of-study
-- cards and v_learner_hostelites use), capped by programme length. Only 5 active
-- learners in the whole database have no admission_year_id, so this is the
-- best-populated signal available; semester_order stays as the last fallback for
-- them. A student who reads as "3rd year" on a billing report can no longer read
-- as "1st year" here.
--
-- INHERITED CAVEAT, on purpose. Like fn_learner_year_of_study, the year rolls on
-- 1 January rather than at the June/July academic boundary, so between January
-- and the new academic year a learner reads one year ahead. Keeping the same
-- arithmetic keeps this picker in step with the billing and hostel views; fixing
-- it here alone would only create a second, disagreeing definition of "year".
--
-- enquiry_date is deliberately NOT in the fallback chain even though
-- fn_learner_year_of_study uses it: migrated rows carry a sentinel enquiry_date,
-- which would silently label a whole cohort as the same year.
--
-- WHAT ELSE MOVES. 211 learners LOSE eligibility, all of them 2020-2023
-- admissions whose semester tag lags a promotion — e.g. a 2023-admitted BPHARM
-- still tagged "Semester VI" reads as year 3 by semester maths but is in year 4
-- of a 4-year programme in 2026-27. Excluding them is the stated policy (2nd and
-- 3rd year only), not a regression.
--
-- The `semesters` JOIN also drops to LEFT: the semester tag is now display and
-- filter material, not the source of eligibility, so a learner with no semester
-- set is no longer silently unappointable.
--
-- STALE OVERLOAD, removed. 20260901010000 (dated ahead of 20260818100000, so it
-- applies last) re-created the OLD 2-argument fn_induction_assignable_peer_mentors
-- alongside the 8-argument filtered one. Verified on production 2026-08-19: both
-- signatures answer. PostgREST picks between overloads by argument names, so the
-- dialog reaches the 8-arg version today, but any caller sending only
-- {p_event_id, p_query} silently gets the unfiltered 25-row version instead.
-- This file is numbered to sort after 20260901010000 so it also wins on a fresh
-- `db reset`, and drops the 2-arg one for good.
--
-- ONE MORE THING THE SAME SEARCH SHOWED. The digits-only mobile fallback ran on
-- every query, so an email query was stripped to its digits and matched on those:
-- "Manos24cct@jkkn.ac.in" became "24" and pulled in every learner whose mobile
-- contains 24. It now fires only for a phone-shaped query (no letters, no '@',
-- 5+ digits), which is the case it was written for.
--
-- Nothing else changes: the auth gate, the fresher and already-a-mentor
-- exclusions, lifecycle_status = 'active', the must-have-a-login-in-this-college
-- JOIN, the cascading filters, the search predicate, the clamped limit and the
-- total_matches window are all carried over verbatim from 20260818100000.

DROP FUNCTION IF EXISTS public.fn_induction_assignable_peer_mentors(uuid, text);


-- ── One definition of "which year is this learner in" ────────────────────────
-- Scalars in, year out: no lookups, so it can be dropped into a WHERE clause and
-- a SELECT list of a query that already joined these tables, and both callers
-- below are guaranteed to agree. STABLE, not IMMUTABLE — it reads CURRENT_DATE.
-- Mirrors fn_learner_year_of_study's shape (cap at duration + 1 so a finished
-- learner is visibly past the end rather than pinned to the final year).
CREATE OR REPLACE FUNCTION public.fn_induction_peer_mentor_year(
  p_admission_year integer,   -- admission_years.year
  p_batch_start    date,      -- batches.start_date
  p_semester_order integer,   -- semesters.semester_order  (last resort)
  p_duration_yrs   integer    -- programs.program_duration_yrs
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_admission_year IS NOT NULL THEN
      GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - p_admission_year + 1,
                        coalesce(p_duration_yrs, 99) + 1))
    WHEN p_batch_start IS NOT NULL THEN
      GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM p_batch_start)::integer + 1,
                        coalesce(p_duration_yrs, 99) + 1))
    WHEN p_semester_order IS NOT NULL THEN
      ceil(p_semester_order::numeric / 2)::integer
    ELSE NULL::integer
  END;
$function$;

COMMENT ON FUNCTION public.fn_induction_peer_mentor_year(integer, date, integer, integer) IS
  'Year of study for the Senior Peer Mentor picker: admission year first (semesters.semester_order is 1 for every learner on year-based programmes and cannot be trusted), batch start next, semester order last.';

REVOKE ALL   ON FUNCTION public.fn_induction_peer_mentor_year(integer, date, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_peer_mentor_year(integer, date, integer, integer) TO authenticated;


-- ── The picker ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_assignable_peer_mentors(
  p_event_id      uuid,
  p_query         text    DEFAULT NULL,
  p_degree_id     uuid    DEFAULT NULL,
  p_department_id uuid    DEFAULT NULL,
  p_program_id    uuid    DEFAULT NULL,
  p_semester_id   uuid    DEFAULT NULL,
  p_section_id    uuid    DEFAULT NULL,
  p_limit         integer DEFAULT 50
)
RETURNS TABLE(
  learner_id      uuid,
  full_name       text,
  register_number text,
  program_name    text,
  department_name text,
  section_name    text,
  year_of_study   integer,
  college_email   text,
  student_email   text,
  student_mobile  text,
  total_matches   bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst   uuid;
  v_like   text;    -- '%value%' for the text columns (ILIKE = case-insensitive)
  v_digits text;    -- digits-only form of the query, for mobile matching
  v_phone  boolean; -- is the query phone-SHAPED? (see below)
  v_limit  integer;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_assignable_peer_mentors: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_assignable_peer_mentors: not authorized';
  END IF;

  v_like   := '%' || btrim(coalesce(p_query, '')) || '%';
  v_digits := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  -- The digits-only branch exists so "98765 43210" / "+91-98765-43210" still find
  -- a stored "9876543210". Applied to ANY query it does harm: typing the email
  -- "Manos24cct@jkkn.ac.in" strips to "24", which matched every learner whose
  -- mobile contains 24 — measured 2026-08-19, one search returned 9 rows of which
  -- 8 were that noise. So it fires only for a phone-SHAPED query: no letters, no
  -- '@', and enough digits to be a number rather than a fragment.
  v_phone  := length(v_digits) >= 5 AND coalesce(p_query, '') !~ '[A-Za-z@]';
  -- Clamp: a caller asking for 100k rows gets 500. The UI pages by filtering.
  v_limit  := LEAST(GREATEST(coalesce(p_limit, 50), 1), 500);

  RETURN QUERY
  WITH base AS (
    SELECT DISTINCT
           lp.id AS lid,   -- DISTINCT: a learner with >1 profile in the college appears once (review #1694)
           btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text AS nm,
           lp.register_number::text                              AS reg,
           coalesce(prg.display_name, prg.program_name)::text     AS prog,
           dept.department_name::text                             AS dept_nm,
           sec.section_name::text                                 AS sec_nm,
           public.fn_induction_peer_mentor_year(ay.year, bt.start_date,
                                                sem.semester_order, prg.program_duration_yrs) AS yr,
           lp.college_email::text                                 AS c_email,
           lp.student_email::text                                 AS s_email,
           lp.student_mobile::text                                AS s_mobile
    FROM public.learners_profiles lp
    -- must have a login in THIS college (so they can actually use the mentor page)
    JOIN public.profiles  p   ON p.learner_id = lp.id AND p.institution_id = v_inst
    -- INNER: programme length is what the year band is measured against.
    JOIN public.programs  prg ON prg.id = lp.program_id
    -- LEFT, all four: display, filter and fallback material only. An INNER join
    -- on `semesters` is what used to make a missing/odd semester tag mean
    -- "ineligible" — the failure this migration exists to stop.
    LEFT JOIN public.semesters       sem  ON sem.id  = lp.semester_id
    LEFT JOIN public.admission_years ay   ON ay.id   = lp.admission_year_id
    LEFT JOIN public.batches         bt   ON bt.id   = lp.batch_id
    LEFT JOIN public.departments     dept ON dept.id = lp.department_id
    LEFT JOIN public.sections        sec  ON sec.id  = lp.section_id
    WHERE lp.lifecycle_status = 'active'   -- graduated / inactive / exited cannot mentor
      AND NOT EXISTS (  -- not a fresher being inducted here
            SELECT 1 FROM public.induction_enrollment ie
            WHERE ie.event_id = p_event_id AND ie.learner_id = lp.id)
      AND NOT EXISTS (  -- not already an active mentor on this event
            SELECT 1 FROM public.induction_feedback_volunteers v
            WHERE v.event_id = p_event_id AND v.learner_id = lp.id AND v.is_active)
      -- Eligibility band: 2nd year up to the mentor year (3rd, or final year of a 2-yr PG).
      AND prg.program_duration_yrs IS NOT NULL
      AND prg.program_duration_yrs >= 2          -- programme must HAVE a senior year
      AND public.fn_induction_peer_mentor_year(ay.year, bt.start_date,
                                               sem.semester_order, prg.program_duration_yrs)
          BETWEEN 2 AND LEAST(3, prg.program_duration_yrs)
      -- Cascading filters. NULL means "Any" and is ignored, so the six of them
      -- compose without needing a branch per combination.
      AND (p_degree_id     IS NULL OR lp.degree_id     = p_degree_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_program_id    IS NULL OR lp.program_id    = p_program_id)
      AND (p_semester_id   IS NULL OR lp.semester_id   = p_semester_id)
      AND (p_section_id    IS NULL OR lp.section_id    = p_section_id)
      AND (
        p_query IS NULL OR btrim(p_query) = ''
        OR btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')) ILIKE v_like
        OR lp.register_number                ILIKE v_like
        OR lp.roll_number                    ILIKE v_like
        OR lp.college_email                  ILIKE v_like
        OR lp.student_email                  ILIKE v_like
        OR lp.student_mobile                 ILIKE v_like
        OR coalesce(prg.display_name, prg.program_name) ILIKE v_like
        -- digits-only mobile match: admin types "98765 43210" / "+91 98765 43210"
        OR (v_phone AND regexp_replace(coalesce(lp.student_mobile,''), '\D', '', 'g')
                        LIKE '%' || v_digits || '%')
      )
  )
  SELECT b.lid, b.nm, b.reg, b.prog, b.dept_nm, b.sec_nm, b.yr,
         b.c_email, b.s_email, b.s_mobile,
         count(*) OVER () AS total_matches
  FROM base b
  ORDER BY b.yr DESC, b.nm    -- most senior first, then by name
  LIMIT v_limit;
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_assignable_peer_mentors(uuid, text, uuid, uuid, uuid, uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_assignable_peer_mentors(uuid, text, uuid, uuid, uuid, uuid, uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_assignable_peer_mentors(uuid, text, uuid, uuid, uuid, uuid, uuid, integer) TO authenticated;


-- ── Filter options for the picker's cascading dropdowns ──────────────────────
-- Same eligibility rules as the search above minus the filters, so a filter
-- value can never match zero people. Only the year band and the semesters JOIN
-- move; the payload shape is unchanged.
CREATE OR REPLACE FUNCTION public.fn_induction_peer_mentor_filter_options(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst     uuid;
  v_result   jsonb;
  v_no_login integer;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_peer_mentor_filter_options: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_peer_mentor_filter_options: not authorized';
  END IF;

  WITH elig AS (
    SELECT DISTINCT lp.id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id, lp.section_id
    FROM public.learners_profiles lp
    JOIN public.profiles  p   ON p.learner_id = lp.id AND p.institution_id = v_inst
    JOIN public.programs  prg ON prg.id = lp.program_id
    LEFT JOIN public.semesters       sem ON sem.id = lp.semester_id
    LEFT JOIN public.admission_years ay  ON ay.id  = lp.admission_year_id
    LEFT JOIN public.batches         b   ON b.id   = lp.batch_id
    WHERE lp.lifecycle_status = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.induction_enrollment ie
                      WHERE ie.event_id = p_event_id AND ie.learner_id = lp.id)
      AND NOT EXISTS (SELECT 1 FROM public.induction_feedback_volunteers v
                      WHERE v.event_id = p_event_id AND v.learner_id = lp.id AND v.is_active)
      AND prg.program_duration_yrs IS NOT NULL
      AND prg.program_duration_yrs >= 2
      AND public.fn_induction_peer_mentor_year(ay.year, b.start_date,
                                               sem.semester_order, prg.program_duration_yrs)
          BETWEEN 2 AND LEAST(3, prg.program_duration_yrs)
  )
  SELECT jsonb_build_object(
    'institution', (SELECT jsonb_build_object('id', i.id, 'name', i.name)
                    FROM public.institutions i WHERE i.id = v_inst),
    'eligible_total', (SELECT count(*) FROM elig),
    'degrees', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', coalesce(d.display_name, d.degree_name))
             ORDER BY coalesce(d.display_name, d.degree_name))
      FROM public.degrees d WHERE d.id IN (SELECT degree_id FROM elig WHERE degree_id IS NOT NULL)), '[]'::jsonb),
    'departments', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', dp.id, 'degree_id', dp.degree_id,
                                          'name', coalesce(dp.display_name, dp.department_name))
             ORDER BY coalesce(dp.display_name, dp.department_name))
      FROM public.departments dp WHERE dp.id IN (SELECT department_id FROM elig WHERE department_id IS NOT NULL)), '[]'::jsonb),
    'programs', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'degree_id', pr.degree_id, 'department_id', pr.department_id,
                                          'name', coalesce(pr.display_name, pr.program_name))
             ORDER BY coalesce(pr.display_name, pr.program_name))
      FROM public.programs pr WHERE pr.id IN (SELECT program_id FROM elig WHERE program_id IS NOT NULL)), '[]'::jsonb),
    'semesters', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'degree_id', s.degree_id, 'department_id', s.department_id,
                                          'program_id', s.program_id, 'name', s.semester_name,
                                          'semester_order', s.semester_order)
             ORDER BY s.semester_order, s.semester_name)
      FROM public.semesters s WHERE s.id IN (SELECT semester_id FROM elig WHERE semester_id IS NOT NULL)), '[]'::jsonb),
    'sections', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', sc.id, 'degree_id', sc.degree_id, 'department_id', sc.department_id,
                                          'program_id', sc.program_id, 'semester_id', sc.semester_id,
                                          'name', sc.section_name)
             ORDER BY sc.section_name)
      FROM public.sections sc WHERE sc.id IN (SELECT section_id FROM elig WHERE section_id IS NOT NULL)), '[]'::jsonb)
  ) INTO v_result;

  -- Learners who clear the YEAR BAND but have no login in this college, so the
  -- picker can never offer them. Reported, not hidden: it is a fixable data gap
  -- (create their account), not a statement that they are ineligible.
  SELECT count(DISTINCT lp.id) INTO v_no_login
  FROM public.learners_profiles lp
  JOIN public.programs prg ON prg.id = lp.program_id
  LEFT JOIN public.semesters       sem ON sem.id = lp.semester_id
  LEFT JOIN public.admission_years ay  ON ay.id  = lp.admission_year_id
  LEFT JOIN public.batches         b   ON b.id   = lp.batch_id
  WHERE lp.institution_id = v_inst
    AND lp.lifecycle_status = 'active'
    AND prg.program_duration_yrs IS NOT NULL
    AND prg.program_duration_yrs >= 2
    AND public.fn_induction_peer_mentor_year(ay.year, b.start_date,
                                             sem.semester_order, prg.program_duration_yrs)
        BETWEEN 2 AND LEAST(3, prg.program_duration_yrs)
    AND NOT EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.learner_id = lp.id AND p.institution_id = v_inst);

  RETURN v_result || jsonb_build_object('without_login', v_no_login);
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_peer_mentor_filter_options(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_peer_mentor_filter_options(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_peer_mentor_filter_options(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

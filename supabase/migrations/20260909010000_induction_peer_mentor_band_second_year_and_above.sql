-- 20260909010000_induction_peer_mentor_band_second_year_and_above.sql
-- Senior Peer Mentor picker — every student past their first year is eligible.
--
-- THE REPORT. An admin filtered the picker to the "4 Year" semester and got back
-- only students badged "Year 2", and three colleges show nobody at all.
--
-- WHAT IS ACTUALLY LIVE (read off production 2026-08-21, not off this repo).
-- The deployed fn_induction_assignable_peer_mentors is the 20260818100000
-- version. Its band is:
--
--     AND sem.semester_order IS NOT NULL
--     AND ceil(sem.semester_order::numeric / 2) BETWEEN 2 AND LEAST(3, duration)
--
-- 20260901020000 — which was supposed to replace exactly this with admission-year
-- arithmetic — WAS NEVER APPLIED. public.fn_induction_peer_mentor_year does not
-- exist in the database (pg_proc has zero rows for that name). It could not have
-- applied as written: it declares p_duration_yrs as `integer` and then calls
-- itself with programs.program_duration_yrs, which is numeric(3,1). numeric ->
-- integer is an assignment cast, not an implicit one, so the call does not
-- resolve and the whole file errors out. That type mismatch is fixed here by
-- declaring the parameter numeric, which is what the column actually is.
--
-- TWO BUGS, ONE BAND. Both had to move for "everyone except first-years":
--
--   1. THE CAP AT 3 excluded 4th- and 5th-year students by rule.
--
--   2. ceil(semester_order / 2) IS NOT A YEAR for half this database. On
--      year-based programmes (Dental, Nursing, Allied Health, and the schools)
--      the `semesters` rows are named "1 Year".."4 Year" and semester_order
--      holds the YEAR, not the semester. Halving it turns a 4th-year into
--      "Year 2" — precisely the mixture that was reported — and where
--      semester_order is 1 for the whole college, ceil(1/2) = 1 and the picker
--      is permanently empty. The `sem.semester_order IS NOT NULL` guard made a
--      missing semester tag mean "ineligible" on top of that.
--
-- Measured on production 2026-08-21, active learners with a login in their own
-- college on a 2+ year programme. "band only" = lifting the cap to 3 alone;
-- "this migration" = lifting the cap AND deriving the year from admission year:
--
--     college                                    live   band only   this migration
--     JKKN College of Allied Health Sciences        0           0              240
--     JKKN College of Arts and Science (Aided)    308         308              320
--     JKKN College of Arts and Science (Self)     736         736              780
--     JKKN College of Engineering and Technology  595         775              786
--     JKKN College of Nursing and Research          0           0              229
--     JKKN College of Pharmacy                    304         401              559
--     JKKN Dental College and Hospital              0           0              500
--
-- Lifting the cap alone leaves three colleges at zero, so it does not deliver
-- "every college, everyone except first-years". Both halves are required.
--
-- THE YEAR. Derived the way the rest of the app already does it — from the
-- admission year (mirroring fn_learner_year_of_study, which the billing
-- year-of-study cards and v_learner_hostelites use), then batch start, then
-- semester_order as a last resort for the handful of learners with neither. A
-- student who reads "3rd year" on a billing report can no longer read "1st
-- year" here. enquiry_date is deliberately NOT in the chain: migrated rows carry
-- a sentinel enquiry_date that would label a whole cohort the same year.
--
-- INHERITED CAVEAT, on purpose. Like fn_learner_year_of_study, the year rolls on
-- 1 January rather than at the June/July academic boundary, so between January
-- and the new academic year a learner reads one year ahead. Kept identical so
-- this picker agrees with the billing and hostel views; a second, disagreeing
-- definition of "year" would be worse than the skew.
--
-- NO UPPER BOUND ON THE BAND, for that reason. A cap at `duration` would look
-- tidier but would silently empty the picker of final-years every January, when
-- they compute as duration + 1. Learners who have genuinely finished are
-- excluded by lifecycle_status <> 'active', the guard designed for it.
--
-- WHAT STILL EXCLUDES SOMEONE, unchanged: lifecycle_status <> 'active';
-- enrolled as a fresher on THIS event; already an active mentor on this event;
-- no login in this college; program_duration_yrs NULL or < 2 (that last one is
-- now load-bearing — without an upper bound, a finished 1-year learner would
-- otherwise read as year 2).
--
-- The auth gate, the search predicate, the cascading filters, the clamped limit,
-- the total_matches window and both payload shapes are carried over verbatim
-- from what is live.

-- The repo's unapplied 20260901020000 declares this with an integer duration. If
-- that file is ever replayed it would add a second overload and make the call
-- ambiguous, so any such overload is removed first.
DROP FUNCTION IF EXISTS public.fn_induction_peer_mentor_year(integer, date, integer, integer);

-- ── One definition of "which year is this learner in" ────────────────────────
-- Scalars in, year out: no lookups, so it drops into both a WHERE clause and a
-- SELECT list of a query that already joined these tables, and the two callers
-- below are guaranteed to agree. STABLE, not IMMUTABLE — it reads CURRENT_DATE.
-- p_duration_yrs is numeric because programs.program_duration_yrs is
-- numeric(3,1); declaring it integer is what stopped 20260901020000 applying.
CREATE OR REPLACE FUNCTION public.fn_induction_peer_mentor_year(
  p_admission_year integer,   -- admission_years.year
  p_batch_start    date,      -- batches.start_date
  p_semester_order integer,   -- semesters.semester_order  (last resort)
  p_duration_yrs   numeric    -- programs.program_duration_yrs
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_admission_year IS NOT NULL THEN
      GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - p_admission_year + 1,
                        floor(coalesce(p_duration_yrs, 99))::integer + 1))
    WHEN p_batch_start IS NOT NULL THEN
      GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM p_batch_start)::integer + 1,
                        floor(coalesce(p_duration_yrs, 99))::integer + 1))
    WHEN p_semester_order IS NOT NULL THEN
      ceil(p_semester_order::numeric / 2)::integer
    ELSE NULL::integer
  END;
$function$;

COMMENT ON FUNCTION public.fn_induction_peer_mentor_year(integer, date, integer, numeric) IS
  'Year of study for the Senior Peer Mentor picker: admission year first (semesters.semester_order holds the YEAR on year-based programmes and is 1 for entire colleges, so it cannot be halved into a year), batch start next, semester order last.';

REVOKE ALL   ON FUNCTION public.fn_induction_peer_mentor_year(integer, date, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_peer_mentor_year(integer, date, integer, numeric) TO authenticated;


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
  -- Fires only for a phone-SHAPED query: no letters, no '@', and enough digits to
  -- be a number rather than a fragment. Applied to any query it strips an email
  -- to its digits and matches on those.
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
           prg.program_duration_yrs                               AS dur,
           lp.college_email::text                                 AS c_email,
           lp.student_email::text                                 AS s_email,
           lp.student_mobile::text                                AS s_mobile
    FROM public.learners_profiles lp
    -- must have a login in THIS college (so they can actually use the mentor page)
    JOIN public.profiles  p   ON p.learner_id = lp.id AND p.institution_id = v_inst
    -- INNER: programme length is what the year is measured against.
    JOIN public.programs  prg ON prg.id = lp.program_id
    -- LEFT, all five: display, filter and fallback material only. An INNER join on
    -- `semesters` is what made a missing or year-based semester tag mean
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
      -- Eligibility band: 2nd year and above. No upper bound — see the header.
      AND prg.program_duration_yrs IS NOT NULL
      AND prg.program_duration_yrs >= 2          -- programme must HAVE a senior year
      AND public.fn_induction_peer_mentor_year(ay.year, bt.start_date,
                                               sem.semester_order, prg.program_duration_yrs) >= 2
      -- Cascading filters. NULL means "Any" and is ignored, so the five of them
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
  -- Current students first, most senior of them at the top; learners whose year
  -- has run past their programme length sink to the bottom. They are still
  -- listed and still searchable — they are only DE-PRIORITISED, because they are
  -- overwhelmingly a lifecycle-status lag (a finished learner still flagged
  -- 'active'), and sorting them first put stale records at the top of the list:
  -- 125 of 559 at Pharmacy, 58 of 229 at Nursing, measured 2026-08-21. Hiding
  -- them outright is the wrong trade — see the header on the January year-roll.
  ORDER BY (b.yr > b.dur) ASC, b.yr DESC, b.nm
  LIMIT v_limit;
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_assignable_peer_mentors(uuid, text, uuid, uuid, uuid, uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_assignable_peer_mentors(uuid, text, uuid, uuid, uuid, uuid, uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_assignable_peer_mentors(uuid, text, uuid, uuid, uuid, uuid, uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.fn_induction_assignable_peer_mentors(uuid, text, uuid, uuid, uuid, uuid, uuid, integer) IS
  'Senior Peer Mentor picker. Eligible = active learner of the event''s college, 2nd year or above (no upper bound), on a programme of 2+ years, with a login in that college, not a fresher on this event and not already a mentor on it.';


-- ── Filter options for the picker's cascading dropdowns ──────────────────────
-- Same eligibility rules as the search above minus the filters, so a filter value
-- can never match zero people. The band has to move here too, or a final-year
-- section would be reachable by typing a name but absent from the Section list.
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
                                               sem.semester_order, prg.program_duration_yrs) >= 2
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
                                             sem.semester_order, prg.program_duration_yrs) >= 2
    AND NOT EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.learner_id = lp.id AND p.institution_id = v_inst);

  RETURN v_result || jsonb_build_object('without_login', v_no_login);
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_peer_mentor_filter_options(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_peer_mentor_filter_options(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_peer_mentor_filter_options(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

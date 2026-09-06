-- Senior Peer Mentor picker — cascading filters, an honest cap, active-only.
--
-- THREE PROBLEMS, one rewrite.
--
-- 1. THE LIST WAS TRUNCATED, NOT FILTERED. `LIMIT 25` with no total and no
--    filters. Measured 2026-08-18 on the Engineering induction: 739 learners
--    are eligible and 25 could ever be seen. "It is not showing all the
--    learners" was exactly right — and unrecoverable, because the only way to
--    reach the 26th was to guess enough of their name to type it. The rewrite
--    takes degree / department / programme / semester / section filters, raises
--    the cap, and RETURNS THE TOTAL so the UI can say how many it is hiding
--    instead of implying there are no more.
--
-- 2. GRADUATED LEARNERS WERE APPOINTABLE. No lifecycle filter at all: of those
--    739, 79 were graduated, 64 inactive and 1 exited. A graduated learner
--    cannot mentor a fresher through the year and is separately gated out of
--    login. Now `lifecycle_status = 'active'`.
--
-- 3. NO WAY TO SEE WHY SOMEONE WAS MISSING. The profiles join is deliberate — a
--    mentor needs a login to use the mentor page — but it silently removed 336
--    of that college's learners. fn_induction_peer_mentor_filter_options now
--    reports that count so the dialog can name it as a data gap to fix rather
--    than leaving it to read as "not eligible".
--
-- INSTITUTION IS NOT A PARAMETER, on purpose. It is resolved from the event
-- (induction_programs.institution_id) exactly as before. A mentor must share a
-- college with their mentees, so letting the caller pass one would either be
-- ignored or be a cross-college hole. The dialog shows it locked, which mirrors
-- this: the field is displayed, never sent.
--
-- DROP + CREATE, not CREATE OR REPLACE: the signature changes, and adding
-- defaulted parameters to a live function creates an OVERLOAD rather than
-- replacing it — PostgREST then picks between them by argument names and the
-- old 25-row version keeps answering. This module already needed
-- 20260630220200_induction_drop_legacy_rpc_overloads.sql once for that. DROP
-- discards EXECUTE grants, so they are re-granted explicitly below.

DROP FUNCTION IF EXISTS public.fn_induction_assignable_peer_mentors(uuid, text);

CREATE FUNCTION public.fn_induction_assignable_peer_mentors(
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
  -- Repeated on every row (count(*) OVER ()). One round trip instead of a
  -- second COUNT rpc that could disagree with the page it labels.
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
           ceil(sem.semester_order::numeric / 2)::integer         AS yr,
           lp.college_email::text                                 AS c_email,
           lp.student_email::text                                 AS s_email,
           lp.student_mobile::text                                AS s_mobile
    FROM public.learners_profiles lp
    -- must have a login in THIS college (so they can actually use the mentor page)
    JOIN public.profiles  p   ON p.learner_id = lp.id AND p.institution_id = v_inst
    -- 1:1 on PKs, so these joins can't multiply rows; they also enforce
    -- "programme length + semester known", exactly as the original did.
    JOIN public.programs  prg ON prg.id = lp.program_id
    JOIN public.semesters sem ON sem.id = lp.semester_id
    -- LEFT: these are display + filter only. An INNER join here would silently
    -- drop a learner whose department or section is unset, which is the failure
    -- mode this whole migration exists to stop.
    LEFT JOIN public.departments dept ON dept.id = lp.department_id
    LEFT JOIN public.sections    sec  ON sec.id  = lp.section_id
    WHERE lp.lifecycle_status = 'active'   -- graduated / inactive / exited cannot mentor
      AND NOT EXISTS (  -- not a fresher being inducted here
            SELECT 1 FROM public.induction_enrollment ie
            WHERE ie.event_id = p_event_id AND ie.learner_id = lp.id)
      AND NOT EXISTS (  -- not already an active mentor on this event
            SELECT 1 FROM public.induction_feedback_volunteers v
            WHERE v.event_id = p_event_id AND v.learner_id = lp.id AND v.is_active)
      -- Eligibility band: 2nd year up to the mentor year (3rd, or final year of a 2-yr PG).
      AND sem.semester_order IS NOT NULL
      AND prg.program_duration_yrs IS NOT NULL
      AND prg.program_duration_yrs >= 2          -- programme must HAVE a senior year
      AND ceil(sem.semester_order::numeric / 2)
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
        OR (v_digits <> '' AND regexp_replace(coalesce(lp.student_mobile,''), '\D', '', 'g')
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
-- One call, one jsonb payload. Every list is derived from the learners who are
-- ACTUALLY ELIGIBLE for this induction, not from the institution's full
-- catalogue — so a filter value can never match zero people, which is the rule
-- the rest of this codebase's filter panels follow.
--
-- Each child carries its parent ids, so the client cascades in memory without a
-- round trip per level. The hierarchy is fully denormalized on `sections` and
-- `semesters` already, which is what makes that cheap.
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

  -- Eligible learners, by the same rules as the search above minus the filters.
  WITH elig AS (
    SELECT DISTINCT lp.id, lp.degree_id, lp.department_id, lp.program_id, lp.semester_id, lp.section_id
    FROM public.learners_profiles lp
    JOIN public.profiles  p   ON p.learner_id = lp.id AND p.institution_id = v_inst
    JOIN public.programs  prg ON prg.id = lp.program_id
    JOIN public.semesters sem ON sem.id = lp.semester_id
    WHERE lp.lifecycle_status = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.induction_enrollment ie
                      WHERE ie.event_id = p_event_id AND ie.learner_id = lp.id)
      AND NOT EXISTS (SELECT 1 FROM public.induction_feedback_volunteers v
                      WHERE v.event_id = p_event_id AND v.learner_id = lp.id AND v.is_active)
      AND sem.semester_order IS NOT NULL
      AND prg.program_duration_yrs IS NOT NULL
      AND prg.program_duration_yrs >= 2
      AND ceil(sem.semester_order::numeric / 2) BETWEEN 2 AND LEAST(3, prg.program_duration_yrs)
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
  JOIN public.programs  prg ON prg.id = lp.program_id
  JOIN public.semesters sem ON sem.id = lp.semester_id
  WHERE lp.institution_id = v_inst
    AND lp.lifecycle_status = 'active'
    AND sem.semester_order IS NOT NULL
    AND prg.program_duration_yrs IS NOT NULL
    AND prg.program_duration_yrs >= 2
    AND ceil(sem.semester_order::numeric / 2) BETWEEN 2 AND LEAST(3, prg.program_duration_yrs)
    AND NOT EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.learner_id = lp.id AND p.institution_id = v_inst);

  RETURN v_result || jsonb_build_object('without_login', v_no_login);
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_peer_mentor_filter_options(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_peer_mentor_filter_options(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_induction_peer_mentor_filter_options(uuid) TO authenticated;

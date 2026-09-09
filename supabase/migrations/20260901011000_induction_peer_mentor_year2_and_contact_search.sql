-- 20260901010000_induction_peer_mentor_year2_and_contact_search.sql
-- Senior Peer Mentor — widen eligibility to 2nd year + richer search/display.
--
-- WHAT CHANGES (vs 20260706143000 / 20260730140000):
--
-- 1. ELIGIBILITY — 2nd-year students may now be appointed.
--      before: ceil(semester_order/2) =        LEAST(3, program_duration_yrs)   -- exactly the mentor year
--      after : ceil(semester_order/2) BETWEEN 2 AND LEAST(3, program_duration_yrs)
--    The LEAST(3, …) cap is unchanged, so a 2-year PG still tops out at its final
--    year (2) and a 4-year UG still tops out at 3 — we simply open the band down
--    to year 2. program_duration_yrs >= 2 is kept, so a 1-year programme (whose
--    only year IS the freshers) still yields nobody. Year 1 is still excluded:
--    a fresher can never mentor a fresher. Missing length / semester → excluded.
--
-- 2. SEARCH — p_query now also matches college email, student email and mobile
--    (plus roll number and programme name), all as case-insensitive %value%.
--    Mobile additionally matches digits-only, so "98765 43210" / "+91-98765..."
--    typed by the admin still finds a stored "9876543210".
--
-- 3. RETURNS — adds program_name, year_of_study, college_email, student_email,
--    student_mobile so the Appoint dialog can show who it is actually appointing.
--    Changing OUT params means CREATE OR REPLACE is impossible → DROP first.
--    Both consumers (feedback-volunteers-section.tsx, [id]/mentors/page.tsx) are
--    updated in the same change; nothing else calls this RPC.
--
-- Auth gate, the fresher exclusion, the already-a-mentor exclusion, the
-- must-have-a-login-in-this-college JOIN and DISTINCT are all carried over
-- verbatim from 20260730140000 (coordinator gate included).

DROP FUNCTION IF EXISTS public.fn_induction_assignable_peer_mentors(uuid, text);

CREATE FUNCTION public.fn_induction_assignable_peer_mentors(
  p_event_id uuid, p_query text DEFAULT NULL::text
)
RETURNS TABLE (
  learner_id     uuid,
  full_name      text,
  register_number text,
  program_name   text,
  year_of_study  integer,
  college_email  text,
  student_email  text,
  student_mobile text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst   UUID;
  v_like   TEXT;   -- '%value%' for the text columns (ILIKE = case-insensitive)
  v_digits TEXT;   -- digits-only form of the query, for mobile matching
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

  RETURN QUERY
  SELECT DISTINCT
         lp.id,   -- DISTINCT: a learner with >1 profile in the college appears once (review #1694)
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         coalesce(prg.display_name, prg.program_name)::text,
         ceil(sem.semester_order::numeric / 2)::integer,
         lp.college_email::text,
         lp.student_email::text,
         lp.student_mobile::text
  FROM public.learners_profiles lp
  -- must have a login in THIS college (so they can actually use the mentor page)
  JOIN public.profiles  p   ON p.learner_id = lp.id AND p.institution_id = v_inst
  -- 1:1 on PKs, so these joins can't multiply rows; they also enforce
  -- "programme length + semester known", exactly as the old EXISTS did.
  JOIN public.programs  prg ON prg.id = lp.program_id
  JOIN public.semesters sem ON sem.id = lp.semester_id
  WHERE NOT EXISTS (  -- not a fresher being inducted here
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
  ORDER BY 5 DESC, 2   -- most senior first, then by name
  LIMIT 25;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_assignable_peer_mentors(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_assignable_peer_mentors(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- 20260706143000_induction_peer_mentor_eligibility.sql
-- Senior Peer Mentor — P2 eligibility rule (enforce strictly).
--
-- Only students in the MENTOR YEAR-BAND may be appointed:
--   mentor_year = LEAST(3, program_duration_yrs)   -- 3rd year, or final year for a 2-yr PG
--   student is eligible iff  ceil(semester_order / 2) = mentor_year
-- Plus program_duration_yrs >= 2 so a 1-year programme (whose only year IS the
-- freshers — e.g. school grades) never yields a mentor. Missing length / semester →
-- excluded (Director is filling durations in; "nobody until the length is filled").
--
-- Same RETURNS signature as the shipped RPC (20260701094000) so this is a safe
-- CREATE OR REPLACE — no DROP, no consumer change. Only the WHERE gains the filter.
CREATE OR REPLACE FUNCTION public.fn_induction_assignable_peer_mentors(p_event_id uuid, p_query text DEFAULT NULL::text)
 RETURNS TABLE(learner_id uuid, full_name text, register_number text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_assignable_peer_mentors: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_assignable_peer_mentors: not authorized';
  END IF;

  RETURN QUERY
  SELECT DISTINCT lp.id,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text
  FROM public.learners_profiles lp
  JOIN public.profiles p ON p.learner_id = lp.id AND p.institution_id = v_inst
  WHERE NOT EXISTS (  -- not a fresher being inducted here
          SELECT 1 FROM public.induction_enrollment ie
          WHERE ie.event_id = p_event_id AND ie.learner_id = lp.id)
    AND NOT EXISTS (  -- not already an active mentor on this event
          SELECT 1 FROM public.induction_feedback_volunteers v
          WHERE v.event_id = p_event_id AND v.learner_id = lp.id AND v.is_active)
    -- P2 eligibility: mentor year-band only (3rd year, or final year of a 2-yr PG).
    AND EXISTS (
          SELECT 1 FROM public.semesters sem
          JOIN public.programs prg ON prg.id = lp.program_id
          WHERE sem.id = lp.semester_id
            AND sem.semester_order IS NOT NULL
            AND prg.program_duration_yrs IS NOT NULL
            AND prg.program_duration_yrs >= 2     -- programme must HAVE a senior year
            AND ceil(sem.semester_order::numeric / 2) = LEAST(3, prg.program_duration_yrs))
    AND (
      p_query IS NULL OR p_query = ''
      OR btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')) ILIKE '%' || p_query || '%'
      OR lp.register_number ILIKE '%' || p_query || '%'
    )
  ORDER BY 2
  LIMIT 25;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_assignable_peer_mentors(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_assignable_peer_mentors(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

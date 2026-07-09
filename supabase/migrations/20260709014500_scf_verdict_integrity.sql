-- =============================================================================
-- VERDICT INTEGRITY — "what if the facilitator bluffed?" (Director interview,
-- 2026-07-09 07:00: contradiction → ALERT LEADERSHIP; repeat pattern →
-- LEADERSHIP-ONLY track record; the facilitator never sees a score kept on them)
--
-- A verdict is testimony, not evidence: the measured outcome_lift (computed by
-- fn_scf_measure_suggestion_outcomes from the WHOLE class's next-session
-- ratings) is the independent witness. These two read fns surface where the
-- two disagree — derived state only, nothing new is written anywhere.
--
-- Agreement semantics (documented for the track record):
--   • not_tried            → excluded (no claim of effect was made)
--   • tried_helped   + lift > 0  → AGREED
--   • tried_helped   + lift <= 0 → CONTRADICTED  (the alert)
--   • tried_no_change + any lift → AGREED (claiming "no change" while numbers
--     rose is honest modesty, not a bluff — never flagged)
--   • verdict present, outcome not yet measured → counted in verdicts, not in
--     measured (the measurer needs a later class to exist)
--
-- Leadership gate mirrors fn_scf_leadership_concerns: super sees all; every
-- other allowed role is bounded to their own institution.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_verdict_track_record(p_from date, p_to date)
 RETURNS TABLE(faculty_email text, institution_id uuid, verdicts integer, measured integer, agreed integer, contradicted integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_verdict_track_record: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_verdict_track_record: not authorized';
  END IF;

  RETURN QUERY
  SELECT s.faculty_email,
         s.institution_id,
         count(*)::int AS verdicts,
         count(*) FILTER (WHERE s.outcome_lift IS NOT NULL)::int AS measured,
         count(*) FILTER (WHERE s.outcome_lift IS NOT NULL AND NOT
           (s.human_verdict = 'tried_helped' AND s.outcome_lift <= 0))::int AS agreed,
         count(*) FILTER (WHERE s.outcome_lift IS NOT NULL
           AND s.human_verdict = 'tried_helped' AND s.outcome_lift <= 0)::int AS contradicted
  FROM public.scf_ai_suggestions s
  WHERE s.domain = 'session_feedback'
    AND s.human_verdict IS NOT NULL
    AND s.human_verdict <> 'not_tried'        -- no effect claimed → nothing to check
    AND s.human_verdict_at::date BETWEEN p_from AND p_to
    AND (v_super OR s.institution_id = v_inst)
  GROUP BY s.faculty_email, s.institution_id
  ORDER BY contradicted DESC, verdicts DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_verdict_track_record(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_verdict_track_record(date, date) TO authenticated;


CREATE OR REPLACE FUNCTION public.fn_scf_verdict_contradictions(p_from date, p_to date)
 RETURNS TABLE(course_code text, faculty_email text, human_verdict text, verdict_on date, input_avg_understood numeric, outcome_lift numeric, window_from date, window_to date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_verdict_contradictions: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_verdict_contradictions: not authorized';
  END IF;

  RETURN QUERY
  SELECT s.course_code, s.faculty_email, s.human_verdict,
         s.human_verdict_at::date AS verdict_on,
         s.input_avg_understood, s.outcome_lift, s.window_from, s.window_to
  FROM public.scf_ai_suggestions s
  WHERE s.domain = 'session_feedback'
    AND s.human_verdict = 'tried_helped'
    AND s.outcome_lift IS NOT NULL
    AND s.outcome_lift <= 0
    AND s.human_verdict_at::date BETWEEN p_from AND p_to
    AND (v_super OR s.institution_id = v_inst)
  ORDER BY s.human_verdict_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_verdict_contradictions(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_verdict_contradictions(date, date) TO authenticated;

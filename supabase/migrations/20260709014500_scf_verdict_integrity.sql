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
-- Leadership gate: super sees all; every other allowed role is bounded to
-- their own institution. Deliberately NARROWER than fn_scf_leadership_concerns
-- (see the role-gate disposition below).
--
-- Deep-review 2026-07-09 dispositions, rounds 1+2 (panels have no cross-round
-- memory — read this before re-flagging):
--   • Role gate (r1 MEDIUM → r2 MEDIUM): these are PER-INDIVIDUAL integrity
--     scorecards, not class-level escalations, so the gate is DELIBERATELY
--     NARROWER than fn_scf_leadership_concerns: hod/coordinator (teaching-
--     eligible roles) are EXCLUDED. Allowed: super/administrator/
--     institution_admin/dean/principal only.
--   • Own-row exclusion (r1 MEDIUM, consensus): a non-super caller NEVER
--     receives rows keyed to their own login email — "the facilitator never
--     sees a score kept on them" even if a dean/principal teaches.
--     profiles.email is the login (institution) email, the same identity
--     session_feedback.faculty_email carries post-#1888 heal; scf_ai_suggestions
--     has NO faculty FK column, so email IS the join identity here (r2 LOW) —
--     and a NULL caller email FAILS CLOSED (returns nothing) rather than open.
--   • k>=3 outcome floor (r2 MEDIUM, consensus): BOTH fns apply the identical
--     COALESCE(outcome_responses,0) >= 3 floor so the track record and the
--     alert list count the same measured rows; sub-floor rows read as
--     awaiting-measurement.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_verdict_track_record(p_from date, p_to date)
 RETURNS TABLE(faculty_email text, institution_id uuid, verdicts integer, measured integer, agreed integer, contradicted integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean; v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_verdict_track_record: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','principal']) OR p.is_super_admin = true),
         lower(p.email)
    INTO v_inst, v_super, v_allowed, v_email
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_verdict_track_record: not authorized';
  END IF;

  RETURN QUERY
  SELECT s.faculty_email,
         s.institution_id,
         count(*)::int AS verdicts,
         -- k>=3 floor on EVERY measured bucket (deep-review r2 MEDIUM, consensus):
         -- must match fn_scf_verdict_contradictions exactly, or the card can show
         -- a "contradicted" mark built on 1-2 noisy answers that the alert list
         -- deliberately suppresses. Sub-floor rows read as awaiting-measurement.
         count(*) FILTER (WHERE s.outcome_lift IS NOT NULL
           AND COALESCE(s.outcome_responses, 0) >= 3)::int AS measured,
         -- agreed is computed POSITIVELY (deep-review r2 LOW): an unexpected
         -- future verdict value lands in NEITHER bucket (an honest visible gap)
         -- instead of silently counting as a matched claim.
         count(*) FILTER (WHERE s.outcome_lift IS NOT NULL
           AND COALESCE(s.outcome_responses, 0) >= 3
           AND ((s.human_verdict = 'tried_helped' AND s.outcome_lift > 0)
                OR s.human_verdict = 'tried_no_change'))::int AS agreed,
         count(*) FILTER (WHERE s.outcome_lift IS NOT NULL
           AND COALESCE(s.outcome_responses, 0) >= 3
           AND s.human_verdict = 'tried_helped' AND s.outcome_lift <= 0)::int AS contradicted
  FROM public.scf_ai_suggestions s
  WHERE s.domain = 'session_feedback'
    AND s.human_verdict IS NOT NULL
    AND s.human_verdict <> 'not_tried'        -- no effect claimed → nothing to check
    -- IST local date (deep-review LOW): verdicts land near midnight IST; a raw
    -- ::date is UTC and shifts evening verdicts to the previous day.
    AND (s.human_verdict_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to
    AND (v_super OR s.institution_id = v_inst)
    -- Own-row exclusion — see header disposition. Supers (Director lane) see
    -- all; a NULL caller email FAILS CLOSED (no rows) rather than fail-open.
    AND (v_super OR (v_email IS NOT NULL AND lower(s.faculty_email) IS DISTINCT FROM v_email))
  GROUP BY s.faculty_email, s.institution_id
  ORDER BY contradicted DESC, verdicts DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_verdict_track_record(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_verdict_track_record(date, date) TO authenticated;


-- Return-shape change vs the first-applied version (deep-review 2026-07-09):
--   + id            — stable per-suggestion key; without it two same-day
--                     same-verdict rows collapse under React's list key and an
--                     alert silently disappears (MEDIUM, consensus).
--   − input_avg_understood, − outcome_lift — row-level class numerics removed
--                     (LOW): the only consumer (Claims-vs-numbers card) never
--                     displayed them, and returning them relied on the upstream
--                     measurer's k-floor to avoid tiny-class averages leaking.
--                     The alert is qualitative by design ("worth a conversation,
--                     not a conclusion").
-- DROP first: CREATE OR REPLACE cannot change a RETURNS TABLE shape, and the
-- prior shape is already live on prod (pre-applied for the visual proof).
DROP FUNCTION IF EXISTS public.fn_scf_verdict_contradictions(date, date);

CREATE FUNCTION public.fn_scf_verdict_contradictions(p_from date, p_to date)
 RETURNS TABLE(id uuid, course_code text, faculty_email text, human_verdict text, verdict_on date, window_from date, window_to date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean; v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_verdict_contradictions: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','principal']) OR p.is_super_admin = true),
         lower(p.email)
    INTO v_inst, v_super, v_allowed, v_email
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_verdict_contradictions: not authorized';
  END IF;

  RETURN QUERY
  SELECT s.id, s.course_code, s.faculty_email, s.human_verdict,
         (s.human_verdict_at AT TIME ZONE 'Asia/Kolkata')::date AS verdict_on,   -- IST, matches track_record's window
         s.window_from, s.window_to
  FROM public.scf_ai_suggestions s
  WHERE s.domain = 'session_feedback'
    AND s.human_verdict = 'tried_helped'
    AND s.outcome_lift IS NOT NULL
    AND s.outcome_lift <= 0
    -- k>=3 floor on the OUTCOME class size (deep-review LOW): a "numbers say it
    -- didn't help" alert built on 1-2 next-session answers is noise, and this fn
    -- must not depend on the upstream measurer's floor staying in place.
    AND COALESCE(s.outcome_responses, 0) >= 3
    AND (s.human_verdict_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_from AND p_to
    AND (v_super OR s.institution_id = v_inst)
    -- Own-row exclusion — same invariant as fn_scf_verdict_track_record: even a
    -- teaching dean/principal never sees a contradiction row about themselves;
    -- NULL caller email fails closed.
    AND (v_super OR (v_email IS NOT NULL AND lower(s.faculty_email) IS DISTINCT FROM v_email))
  ORDER BY s.human_verdict_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_verdict_contradictions(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_verdict_contradictions(date, date) TO authenticated;

-- Migration: 20260722210000_ai_pulse_switchable_cycles.sql
-- Updated: 2026-07-22 — AI Pulse learner week-switcher: hide empty weeks.
--
-- The learner week-switcher (PR #2267) listed EVERY ai_pulse cycle, so a learner
-- could browse back into weeks that have no Domain Starter for them and hit a
-- blank prompt area (live: 7 of 8 browsable weeks were empty).
--
-- This read-only helper returns only cycles the learner actually has a starter
-- in. It mirrors fn_ai_pulse_my_domain_starters exactly — same DARK kill-switch
-- gate (domain_starter_enabled) and the same fn_ai_pulse_learner_topics join —
-- so "empty week" is judged PER LEARNER, and the switcher never offers a dead-end.
--
-- Verified in prod 2026-07-22: a covered B.Pharm learner resolves to 1 cycle
-- (2026-07-23), not the 8 the unfiltered switcher showed; anon has no EXECUTE.

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_switchable_cycles(p_limit int DEFAULT 12)
RETURNS TABLE(cycle_id uuid, name text, start_date timestamptz, end_date timestamptz, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_learner uuid;
BEGIN
  -- DARK gate: invisible to learners until the kill switch is on (mirrors read fn).
  IF NOT COALESCE((SELECT (value_jsonb#>>'{}')::boolean FROM ai_pulse_policies
                   WHERE config_key = 'domain_starter_enabled' AND is_active), false) THEN
    RETURN;
  END IF;

  SELECT learner_id INTO v_learner FROM profiles WHERE id = auth.uid();
  IF v_learner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT e.id, e.name, e.start_date, e.end_date, e.status
  FROM startup_events e
  WHERE e.config->>'kind' = 'ai_pulse'
    AND e.status <> 'cancelled'
    AND EXISTS (
      SELECT 1
      FROM public.fn_ai_pulse_learner_topics(v_learner) t
      JOIN ai_pulse_domain_starters d
        ON d.topic_type = t.topic_type
       AND d.topic_id   = t.topic_id
       AND d.cycle_id   = e.id
      WHERE d.final_prompt IS NOT NULL)
  ORDER BY e.start_date DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1);
END; $function$;

-- Lock from anon (Supabase's default ALTER DEFAULT PRIVILEGES grants EXECUTE to anon).
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_switchable_cycles(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_switchable_cycles(int) TO authenticated;

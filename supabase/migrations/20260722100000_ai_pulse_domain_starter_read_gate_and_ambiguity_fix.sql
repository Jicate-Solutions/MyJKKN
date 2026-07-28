-- Migration: 20260722100000_ai_pulse_domain_starter_read_gate_and_ambiguity_fix.sql
-- Updated: 2026-07-22 — AI Pulse Domain Starter go-live cleanup.
--
-- Lands two things into main that were previously only applied to prod out-of-band:
--
-- 1) READ KILL-SWITCH GATE. The learner read fn must return nothing until the
--    policy `domain_starter_enabled` is true. The gate was applied to prod via a
--    migration (20260720093000) that never landed in main, so main's latest
--    definition (20260720073000) had NO gate — a replay from main would have
--    served the dark starters to learners.
--
-- 2) COLUMN-AMBIGUITY BUG FIX. RETURNS TABLE(... topic_type ...) makes `topic_type`
--    a PL/pgSQL output variable in scope for the whole body. The programme-fallback
--    subquery referenced it UNQUALIFIED:
--        NOT EXISTS (SELECT 1 FROM mine WHERE topic_type = 'course')
--    → ERROR 42702 (ambiguous: output variable vs mine.topic_type). This errored for
--    EVERY learner the moment the switch turned on — never caught because the read
--    path only runs with the switch on, which had never happened until go-live prep.
--    Fix: alias the CTE (mine m2) and qualify (m2.topic_type).
--
-- Verified in prod 2026-07-22 by impersonating a real BPHARM learner in a rolled-back
-- transaction: returns her English prompt, Tamil stripped (ta_review_status pending).

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_my_domain_starters(p_cycle_id uuid)
 RETURNS TABLE(starter_id uuid, topic_type text, topic_label text, final_prompt text, prompt_pack jsonb, tamil_available boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_learner uuid;
BEGIN
  -- DARK gate: invisible to learners until the kill switch is on.
  IF NOT COALESCE((SELECT (value_jsonb#>>'{}')::boolean FROM ai_pulse_policies
                   WHERE config_key = 'domain_starter_enabled' AND is_active), false) THEN
    RETURN;
  END IF;

  SELECT learner_id INTO v_learner FROM profiles WHERE id = auth.uid();
  IF v_learner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH mine AS (
    SELECT d.id, d.topic_type, d.topic_label, d.final_prompt, d.prompt_pack, d.ta_review_status
    FROM public.fn_ai_pulse_learner_topics(v_learner) t
    JOIN ai_pulse_domain_starters d
      ON d.topic_type = t.topic_type AND d.topic_id = t.topic_id AND d.cycle_id = p_cycle_id
    WHERE d.final_prompt IS NOT NULL
  )
  -- Tamil policy (Director, 2026-07-22): approval is NOT required. Tamil shows by
  -- default; a reviewer can still hide a bad one by setting ta_review_status='rejected'.
  SELECT m.id, m.topic_type, m.topic_label, m.final_prompt,
         CASE WHEN m.ta_review_status = 'rejected' THEN (m.prompt_pack - 'ta')
              ELSE m.prompt_pack END,
         (m.ta_review_status <> 'rejected') AS tamil_available
  FROM mine m
  WHERE m.topic_type = 'course'                                        -- finest grain: course prompt
     OR NOT EXISTS (SELECT 1 FROM mine m2 WHERE m2.topic_type = 'course'); -- else programme fallback
END; $function$;

-- Lock from anon (Supabase's default ALTER DEFAULT PRIVILEGES grants EXECUTE to anon).
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) TO authenticated;

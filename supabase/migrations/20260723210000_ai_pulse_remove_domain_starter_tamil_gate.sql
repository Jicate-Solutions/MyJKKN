-- ============================================================================
-- AI Pulse — remove the domain-starter Tamil review gate entirely.
-- ============================================================================
-- Director decision (2026-07-23): the manual Tamil review gate is retired. Tamil
-- is published as generated whenever the pack carries a 'ta' block; the
-- self-correcting loop (copy-rate + learner reports + auto-revert) governs
-- quality instead of a pre-publish champion review. Supersedes the 2026-07-22
-- "approval-not-required-but-reviewer-can-reject" policy in
-- 20260722100000_ai_pulse_domain_starter_read_gate_and_ambiguity_fix.sql.
--
-- Effect: fn_ai_pulse_my_domain_starters no longer inspects ta_review_status.
-- tamil_available now reflects "the pack has Tamil", not a review status. The
-- ta_review_status column is left in place (vestigial; harmless) and the
-- champion Tamil-approval UI + its RPCs are retired separately in this PR.
--
-- Behaviour-preserving on apply: with zero 'rejected' rows today, every pack
-- that already displayed continues to display; only the (now-removed) ability to
-- hide a pack via ta_review_status='rejected' changes.
-- ============================================================================

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
    SELECT d.id, d.topic_type, d.topic_label, d.final_prompt, d.prompt_pack
    FROM public.fn_ai_pulse_learner_topics(v_learner) t
    JOIN ai_pulse_domain_starters d
      ON d.topic_type = t.topic_type AND d.topic_id = t.topic_id AND d.cycle_id = p_cycle_id
    WHERE d.final_prompt IS NOT NULL
  )
  -- Tamil review gate REMOVED (Director, 2026-07-23). Tamil shows whenever the
  -- pack has a 'ta' block; the loop's own signals correct any bad Tamil.
  SELECT m.id, m.topic_type, m.topic_label, m.final_prompt,
         m.prompt_pack,
         (m.prompt_pack ? 'ta') AS tamil_available
  FROM mine m
  WHERE m.topic_type = 'course'                                        -- finest grain: course prompt
     OR NOT EXISTS (SELECT 1 FROM mine m2 WHERE m2.topic_type = 'course'); -- else programme fallback
END; $function$;

-- Lock from anon (Supabase's default ALTER DEFAULT PRIVILEGES grants EXECUTE to anon).
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) TO authenticated;

-- ============================================================================
-- Updated: 2026-07-20 - AI Pulse Domain Starter helper reads (dark) for PR-C.
-- Coordinator-owned so parallel UI agents build against a complete substrate.
--   * fn_ai_pulse_domain_starters_pending_tamil — admin list for the Tamil
--     native-review surface (aggregate content only; admin-gated).
--   * fn_ai_pulse_domain_starter_notify_targets — one row per attendee whose
--     finest topic HAS a starter this cycle (the notification's recipient list).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_domain_starters_pending_tamil(p_cycle_id uuid DEFAULT NULL)
RETURNS TABLE (starter_id uuid, cycle_id uuid, topic_type text, topic_label text, prompt_pack jsonb, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('aiPulse:cycles.manage')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT d.id, d.cycle_id, d.topic_type, d.topic_label, d.prompt_pack, d.created_at
  FROM ai_pulse_domain_starters d
  WHERE d.ta_review_status = 'pending' AND (d.prompt_pack ? 'ta')
    AND (p_cycle_id IS NULL OR d.cycle_id = p_cycle_id)
  ORDER BY d.created_at DESC;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starters_pending_tamil(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starters_pending_tamil(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_domain_starter_notify_targets(p_cycle_id uuid)
RETURNS TABLE (profile_id uuid, topic_label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  WITH att AS (
    SELECT DISTINCT p.id AS profile_id, p.learner_id
    FROM ai_pulse_live_attendance a JOIN profiles p ON p.id = a.profile_id
    WHERE a.event_id = p_cycle_id AND a.day_type = 'live_session' AND p.learner_id IS NOT NULL
  )
  SELECT att.profile_id,
         (array_agg(d.topic_label ORDER BY (t.topic_type = 'course') DESC))[1] AS topic_label
  FROM att
  CROSS JOIN LATERAL public.fn_ai_pulse_learner_topics(att.learner_id) t
  JOIN ai_pulse_domain_starters d
    ON d.topic_type = t.topic_type AND d.topic_id = t.topic_id AND d.cycle_id = p_cycle_id
  GROUP BY att.profile_id;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_notify_targets(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_notify_targets(uuid) TO service_role;

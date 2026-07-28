-- ============================================================================
-- Updated: 2026-07-19 - AI Pulse Domain Starter: prompt PACK (still PR-A, dark).
--
-- Director (2026-07-19): "include all 4" -> each subject's starter is a PACK of
-- three job-modes (build-and-publish / skill-drill / career-portfolio), each in
-- English + Tamil. PR-A's single final_prompt cannot carry that, so we add a
-- structured prompt_pack jsonb:
--     { "en": {"build":..,"skill":..,"career":..},
--       "ta": {"build":..,"skill":..,"career":..} }
--
-- NON-LATIN SAFETY (rules #24/#25): AI-generated Tamil corrupts in ways a non-
-- Tamil reader can't see, so it MUST NOT auto-publish unreviewed. English
-- auto-publishes (loop stays auto); Tamil is generated + held ta_review_status
-- 'pending' and the learner read STRIPS the 'ta' branch until it is 'approved'.
-- final_prompt is kept as the primary single string (= en.build) for the
-- notification line + any simple surface.
-- Still DARK: kill switch domain_starter_enabled=false; no cron; no UI.
-- ============================================================================

ALTER TABLE public.ai_pulse_domain_starters
  ADD COLUMN IF NOT EXISTS prompt_pack     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ta_review_status text NOT NULL DEFAULT 'pending'
    CHECK (ta_review_status IN ('pending','approved','rejected'));


-- ---------------------------------------------------------------------------
-- Record: now stores the pack; final_prompt derives from en.build (fallback to
-- generated_prompt). Cron writer -> service_role. (Idempotent upsert, unchanged key.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_record_domain_starter(p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_id uuid; v_pack jsonb := COALESCE(p_payload->'prompt_pack','{}'::jsonb);
BEGIN
  INSERT INTO ai_pulse_domain_starters
    (cycle_id, topic_type, topic_id, topic_label, institution_id, learner_count,
     generated_prompt, final_prompt, prompt_pack, model, prior_context)
  VALUES
    ((p_payload->>'cycle_id')::uuid,
     p_payload->>'topic_type',
     (p_payload->>'topic_id')::uuid,
     p_payload->>'topic_label',
     NULLIF(p_payload->>'institution_id','')::uuid,
     COALESCE((p_payload->>'learner_count')::int, 0),
     p_payload->>'generated_prompt',
     COALESCE(v_pack->'en'->>'build', p_payload->>'final_prompt', p_payload->>'generated_prompt'),
     v_pack,
     p_payload->>'model',
     COALESCE(p_payload->'prior_context','{}'::jsonb))
  ON CONFLICT (cycle_id, topic_type, topic_id) DO UPDATE
    SET generated_prompt = EXCLUDED.generated_prompt,
        final_prompt     = EXCLUDED.final_prompt,
        prompt_pack      = EXCLUDED.prompt_pack,
        model            = EXCLUDED.model,
        learner_count    = EXCLUDED.learner_count,
        prior_context    = EXCLUDED.prior_context,
        updated_at       = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_record_domain_starter(jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_record_domain_starter(jsonb) TO service_role;


-- ---------------------------------------------------------------------------
-- Learner read: return the pack. Tamil branch is STRIPPED unless approved
-- (non-Latin safety). Return-type changes -> DROP then CREATE.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_ai_pulse_my_domain_starters(uuid);
CREATE FUNCTION public.fn_ai_pulse_my_domain_starters(p_cycle_id uuid)
RETURNS TABLE (starter_id uuid, topic_type text, topic_label text,
               final_prompt text, prompt_pack jsonb, tamil_available boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_learner uuid;
BEGIN
  SELECT learner_id INTO v_learner FROM profiles WHERE id = auth.uid();
  IF v_learner IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT d.id, d.topic_type, d.topic_label, d.final_prompt,
         CASE WHEN d.ta_review_status = 'approved' THEN d.prompt_pack
              ELSE (d.prompt_pack - 'ta') END,            -- strip Tamil unless approved
         (d.ta_review_status = 'approved') AS tamil_available
  FROM public.fn_ai_pulse_learner_topics(v_learner) t
  JOIN ai_pulse_domain_starters d
    ON d.topic_type = t.topic_type AND d.topic_id = t.topic_id AND d.cycle_id = p_cycle_id
  WHERE d.final_prompt IS NOT NULL;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- Tamil native-review setter (for the review surface built in a later PR).
-- Admin / aiPulse:cycles.manage only. authenticated + internal gate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_domain_starter_ta_review(p_starter_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('aiPulse:cycles.manage')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_status NOT IN ('pending','approved','rejected') THEN RAISE EXCEPTION 'bad status'; END IF;
  UPDATE ai_pulse_domain_starters SET ta_review_status = p_status, updated_at = now()
  WHERE id = p_starter_id;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_ta_review(uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_ta_review(uuid,text) TO authenticated;

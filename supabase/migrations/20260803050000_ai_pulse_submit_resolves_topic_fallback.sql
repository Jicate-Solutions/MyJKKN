-- 20260803050000_ai_pulse_submit_resolves_topic_fallback.sql
-- Created: 2026-07-26 — Fix: prompt builds were landing with topic_id = NULL, so
-- prompt-graduation produced ZERO output even with prompt_graduation_enabled = true.
--
-- Root cause: fn_ai_pulse_submit_prompt_build ACCEPTS topic_type/topic_id in its
-- payload, but the builder UI never passed them, so every build was topicless. The
-- graduate fn (fn_ai_pulse_graduate_prompt_builds) requires topic_type IS NOT NULL
-- AND topic_id IS NOT NULL, and the shared-library read (fn_ai_pulse_topic_graduated_prompts)
-- shelves graduated prompts BY topic — a topicless build has no shelf to land on and
-- can never surface, no matter how high its grade.
--
-- Fix (belt): submit now resolves the learner's OWN finest topic server-side when the
-- payload omits it. This makes a topicless build impossible for ANY caller, not just
-- the current UI — the resolution no longer depends on a UI layer remembering to pass
-- the param. The builder UI is also updated to pass the resolved topic (suspenders +
-- learner-visible "files under" label), but this migration alone closes the gap.
--
-- Trust surface unchanged: v_learner comes from auth.uid() (the caller's own profile),
-- and fn_ai_pulse_learner_topics is called with that same self-derived id — a learner
-- can only ever tag a build with their own topic (no confused-deputy). That resolver
-- returns course grains first (finest) then programme, so LIMIT 1 = the finest topic
-- the learner actually has, with programme as the guaranteed floor.

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_submit_prompt_build(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_learner    uuid;
  v_inst       uuid;
  v_id         uuid;
  v_topic_type text;
  v_topic_id   uuid;
BEGIN
  IF NOT COALESCE((SELECT (value_jsonb#>>'{}')::boolean FROM ai_pulse_policies
                   WHERE config_key = 'prompt_build_enabled' AND is_active), false) THEN
    RAISE EXCEPTION 'prompt_build_disabled';
  END IF;
  SELECT learner_id, institution_id INTO v_learner, v_inst FROM profiles WHERE id = auth.uid();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'not_a_learner'; END IF;
  IF COALESCE(trim(p_payload->>'assembled_prompt'),'') = '' THEN RAISE EXCEPTION 'empty_prompt'; END IF;

  -- Prefer an explicit topic from the payload (the builder UI now passes it); if the
  -- caller omits either field, resolve the learner's own finest topic here. This is the
  -- belt that stops a build ever landing topicless again (which silently starved graduation).
  v_topic_type := NULLIF(p_payload->>'topic_type','');
  v_topic_id   := NULLIF(p_payload->>'topic_id','')::uuid;
  IF v_topic_type IS NULL OR v_topic_id IS NULL THEN
    SELECT t.topic_type, t.topic_id
      INTO v_topic_type, v_topic_id
    FROM public.fn_ai_pulse_learner_topics(v_learner) t
    LIMIT 1;  -- finest first (course over programme); programme is the guaranteed floor
  END IF;

  INSERT INTO ai_pulse_prompt_builds
    (learner_id, cycle_id, starter_id, topic_type, topic_id, institution_id, parts, assembled_prompt)
  VALUES
    (v_learner,
     NULLIF(p_payload->>'cycle_id','')::uuid,
     NULLIF(p_payload->>'starter_id','')::uuid,
     v_topic_type,
     v_topic_id,
     v_inst,
     COALESCE(p_payload->'parts','{}'::jsonb),
     p_payload->>'assembled_prompt')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

-- secdef-anon-revoke gate treats CREATE OR REPLACE as a NEW function → re-assert the lock.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_submit_prompt_build(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_submit_prompt_build(jsonb) TO authenticated;

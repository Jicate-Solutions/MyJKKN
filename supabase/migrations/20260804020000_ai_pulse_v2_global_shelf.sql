-- ============================================================================
-- 2026-08-04 - AI Pulse Star-Prompt Library v2 (PR A2): shared "All JKKN" shelf
-- ----------------------------------------------------------------------------
-- Decision #3 (Director interview 2026-07-26): a learner with NO programme (and
-- no course) resolves to NO topic today, so their prompt-builds land topicless
-- and can never graduate into a shared library. Fix by filing those builds on a
-- shared global shelf (the "All JKKN" shelf) that EVERY learner also sees — a
-- campus-wide safety-net shelf keyed on a sentinel topic.
--
-- Two function changes, no schema change, no .tsx change:
--   1. fn_ai_pulse_submit_prompt_build(jsonb): add a FINAL fallback so a build
--      that still has no topic after the learner-topic resolver lands on the
--      global sentinel instead of NULL. Precedence unchanged: explicit payload
--      topic wins, then the learner's finest resolved topic, then the global
--      sentinel floor.
--   2. fn_ai_pulse_my_topics(): append one extra row for EVERY learner —
--      ('global', <sentinel>, 'All JKKN') — appended LAST so the finest real
--      topic stays at index [0] (the builder card stamps builds with [0]); the
--      shared-library-service loop then queries the global shelf for everyone.
--
-- Global sentinel topic: type='global', id='00000000-0000-0000-0000-000000000000'.
-- The sentinel id is non-NULL, so a global-shelf build clears the graduate gate's
-- `topic_type IS NOT NULL AND topic_id IS NOT NULL` requirement.
--
-- DARK-SAFE: this only changes WHERE a topicless build files and adds one topic
-- row. The library card still renders nothing unless graduated peer prompts
-- exist for a topic (graduation is off in production today).
--
-- Part of the Star-Prompt Library v2 wave (spec:
-- specs/ai-pulse-star-library-v2-2026-07-26.md).
-- ============================================================================

-- ── 1. Submit path: global-sentinel fallback for topicless builds ───────────
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_submit_prompt_build(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- v2 global shelf (#3): a learner with no programme/course resolves NO topic
  -- above, leaving the build topicless — which can never graduate. File those
  -- builds on the shared "All JKKN" global shelf (sentinel topic) so every
  -- learner's prompt has a shelf to land on. Precedence: explicit payload topic
  -- wins, then the learner's finest resolved topic, then this global sentinel.
  IF v_topic_type IS NULL OR v_topic_id IS NULL THEN
    v_topic_type := 'global';
    v_topic_id   := '00000000-0000-0000-0000-000000000000'::uuid;
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

-- Re-assert anon lock (the CI gate treats CREATE OR REPLACE as a new function).
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_submit_prompt_build(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_submit_prompt_build(jsonb) TO authenticated;

-- ── 2. Topic resolver: append the shared "All JKKN" shelf for every learner ──
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_my_topics()
RETURNS TABLE (topic_type text, topic_id uuid, topic_label text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_learner uuid;
BEGIN
  -- Self-scoped ONLY: the current learner comes from the session, never from a
  -- parameter (confused-deputy guard — the caller cannot ask for anyone else).
  SELECT pr.learner_id INTO v_learner FROM profiles pr WHERE pr.id = auth.uid();
  IF v_learner IS NULL THEN
    RETURN; -- not a learner (or unauthenticated) -> no topics -> card hides
  END IF;

  RETURN QUERY
  SELECT t.topic_type, t.topic_id, t.topic_label
  FROM public.fn_ai_pulse_learner_topics(v_learner) t;

  -- v2 global shelf (#3): EVERY learner also sees the shared "All JKKN" shelf,
  -- in addition to their subject shelf. Appended LAST so the finest real topic
  -- stays at index [0] for the builder card (which stamps a build with [0]); the
  -- shared-library-service loop iterates ALL rows, so it queries the global
  -- shelf too. A no-programme learner gets ONLY this row -> their build files on
  -- the global shelf and can finally graduate.
  RETURN QUERY
  SELECT 'global'::text,
         '00000000-0000-0000-0000-000000000000'::uuid,
         'All JKKN'::text;
END; $fn$;

-- Lock from anon; the public anon key ships in every browser bundle. Learner
-- reads use the authenticated session client.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_topics() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_topics() TO authenticated;

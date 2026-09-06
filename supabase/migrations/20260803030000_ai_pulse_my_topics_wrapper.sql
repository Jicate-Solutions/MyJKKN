-- ============================================================================
-- 2026-08-03 - AI Pulse: self-scoped "my topics" wrapper for the Prompt library
-- ----------------------------------------------------------------------------
-- The learner-facing Prompt library card (shared-library-card.tsx) shows the
-- best GRADUATED peer prompts on the topics THIS learner studies. Until now it
-- sourced those topics from the learner's OWN prompt-builds
-- (fn_ai_pulse_my_prompt_builds), so a learner who has never built a prompt
-- resolved zero topics and saw nothing — even when peers had graduated prompts
-- on their course/programme.
--
-- fn_ai_pulse_learner_topics(learner_id) already derives a learner's finest
-- course/programme topics, but it is service-role-only (cron/notify use), so a
-- browser/authenticated client cannot call it, and it takes a caller-supplied
-- learner_id (unsafe to expose directly — a confused-deputy hole).
--
-- This thin SECURITY DEFINER wrapper closes both gaps: it derives the CURRENT
-- learner from the session (auth.uid() -> profiles.learner_id), NEVER accepts a
-- caller-supplied id, and internally calls fn_ai_pulse_learner_topics for that
-- learner — returning only (topic_type, topic_id, topic_label). Being SECURITY
-- DEFINER (owner postgres) lets it call the service-role-only inner function.
--
-- DARK-SAFE: this only changes WHICH topics feed the library read. The card
-- still renders nothing unless fn_ai_pulse_topic_graduated_prompts returns
-- graduated peer prompts (off in production today) — byte-identical UI.
-- ============================================================================

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
END; $fn$;

-- Lock from anon; the public anon key ships in every browser bundle. Learner
-- reads use the authenticated session client.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_topics() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_topics() TO authenticated;

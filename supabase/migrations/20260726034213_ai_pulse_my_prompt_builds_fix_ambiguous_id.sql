-- Migration: 20260726034213_ai_pulse_my_prompt_builds_fix_ambiguous_id.sql
-- Created: 2026-07-26 — Fix a latent 42702 in fn_ai_pulse_my_prompt_builds.
--
-- Bug: the function is RETURNS TABLE(id uuid, ...). Those OUT columns are
-- in-scope PL/pgSQL variables, so the unqualified `id` in
--     SELECT learner_id INTO v_learner FROM profiles WHERE id = auth.uid()
-- is ambiguous (OUT-param `id` vs profiles.id) and raises
--     42702: column reference "id" is ambiguous
-- on EVERY call. It has been dormant because its only caller — the my-pulse
-- prompt-builder card's useMyBuilds — is behind the dark prompt_build gate and
-- swallows the error into React Query's error state (nothing rendered).
--
-- The sibling fn_ai_pulse_topic_graduated_prompts already hit and fixed this
-- exact shadowing ("RETURNS TABLE(id …) shadows an unqualified `id`, so
-- qualify."). This applies the same one-line fix here: alias profiles and
-- qualify the column. Signature, grants, ordering and results are otherwise
-- unchanged — today it returns 0 rows for every learner (no builds exist while
-- prompt_build is dark), so this is behaviour-neutral now and simply lets the
-- prompt-builder card AND the new shared-library card work once the loop is on.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_my_prompt_builds(p_cycle_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, cycle_id uuid, topic_type text, topic_id uuid, parts jsonb,
              assembled_prompt text, grade jsonb, grade_status text, created_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_learner uuid;
BEGIN
  -- Alias profiles: the RETURNS TABLE(id …) OUT column shadows an unqualified
  -- `id`, so qualify it (mirrors fn_ai_pulse_topic_graduated_prompts).
  SELECT pr.learner_id INTO v_learner FROM profiles pr WHERE pr.id = auth.uid();
  IF v_learner IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT b.id, b.cycle_id, b.topic_type, b.topic_id, b.parts,
         b.assembled_prompt, b.grade, b.grade_status, b.created_at
  FROM ai_pulse_prompt_builds b
  WHERE b.learner_id = v_learner AND (p_cycle_id IS NULL OR b.cycle_id = p_cycle_id)
  ORDER BY b.created_at DESC LIMIT 50;
END; $function$;

-- Re-assert the anon lock (CREATE OR REPLACE is treated as a new function by the
-- secdef-anon gate; the standing rule is to re-state REVOKE + GRANT).
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_prompt_builds(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_prompt_builds(uuid) TO authenticated;

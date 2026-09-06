-- =====================================================================
-- AI Pulse — Learner-prompt graduation (decision #20)
-- Created: 2026-07-23 - Best learner builds graduate into the shared library.
-- =====================================================================
-- The build-from-parts loop lets a learner assemble a prompt and get an AI
-- checklist grade (ai_pulse_prompt_builds.grade = {has_role,has_context,has_task,
-- has_format, score:0-100, tips[]}). Decision #20: the best builds "graduate" so
-- strong learner prompts become part of the shared library — the compounding
-- half of the moat (staff seed + learners grow it).
--
-- DESIGN NOTE (grain): ai_pulse_domain_starters is UNIQUE(cycle_id,topic_type,
-- topic_id) — one AI starter per topic per cycle — so a graduated learner prompt
-- CANNOT be inserted there as a competing row (it would collide with that cycle's
-- generated starter, and two learners graduating for one topic would collide with
-- each other). So a graduated build is simply the build row with graduated_at
-- stamped; the shared-library surface reads graduated builds per topic. Feeding
-- graduated prompts forward into the AI generation prompt is a deliberate,
-- documented follow-up (it would edit the generation cron, which another open PR
-- already touches — kept separate to avoid a shared-file conflict).
--
-- OPEN DECISION surfaced to the Director (spec §8, line 106): decision #20's bar
-- is "high usage + passed checklist", but a learner build has NO usage signal
-- (ai_pulse_prompt_builds has no copies/reuse column, and the usage-event table
-- is keyed to library starters, not builds). So v1 grades on the CHECKLIST SCORE
-- only (grade.score >= prompt_graduation_min_score). The usage axis activates
-- once builds gain a reuse signal; the Director sets the definition pre-go-live.
--
-- DARK by default: gated behind policy 'prompt_graduation_enabled' (default
-- false). Nothing graduates and nothing surfaces to a learner until it is
-- flipped. Also inert in practice today: 0 builds exist (the builder UI is dark).
--
-- SECDEF: the graduate RPC is CRON/system-only -> service_role (never
-- authenticated: memory feedback_cron_only_secdef_rpcs_service_role_not_authenticated).
-- The topic-read RPC is learner-facing -> authenticated. Both anon-locked.

-- 1. Config rows (house rule: every switch = a policy row).
INSERT INTO ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type)
VALUES
  ('prompt_graduation_enabled',
   'AI Pulse: graduate top learner prompts',
   'When on, the graduation cron promotes learner builds that pass the checklist bar into the shared library (surfaced to peers on the same topic). Dark by default.',
   'false'::jsonb, 'bool'),
  ('prompt_graduation_min_score',
   'AI Pulse: graduation checklist score bar (0-100)',
   'A learner build must score at least this on the AI checklist (grade.score) to graduate. Usage axis is deferred until builds gain a reuse signal.',
   '80'::jsonb, 'int')
ON CONFLICT (config_key) DO NOTHING;

-- 2. Graduation marker on the build (NULL = not graduated).
ALTER TABLE ai_pulse_prompt_builds ADD COLUMN IF NOT EXISTS graduated_at timestamptz;
COMMENT ON COLUMN ai_pulse_prompt_builds.graduated_at IS
  'When this build graduated into the shared library (decision #20). NULL = not graduated.';

-- 3. Graduate RPC — CRON/system only. Stamp graduated_at on builds that pass the
--    checklist bar. Idempotent (only ungraduated rows), dark-gated, returns count.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_graduate_prompt_builds(p_cycle_id uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
  v_min numeric;
  v_count integer;
BEGIN
  SELECT COALESCE((value_jsonb)::boolean, false) INTO v_enabled
  FROM ai_pulse_policies WHERE config_key = 'prompt_graduation_enabled' AND is_active LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN 0;  -- dark: defense-in-depth even if the cron calls us
  END IF;

  SELECT COALESCE((value_jsonb)::numeric, 80) INTO v_min
  FROM ai_pulse_policies WHERE config_key = 'prompt_graduation_min_score' AND is_active LIMIT 1;
  v_min := COALESCE(v_min, 80);

  WITH upd AS (
    UPDATE ai_pulse_prompt_builds b
    SET graduated_at = now(), updated_at = now()
    WHERE b.graduated_at IS NULL
      AND b.grade_status = 'graded'
      AND b.topic_type IS NOT NULL
      AND b.topic_id IS NOT NULL
      AND COALESCE((b.grade->>'score')::numeric, 0) >= v_min
      AND (p_cycle_id IS NULL OR b.cycle_id = p_cycle_id)
    RETURNING 1
  )
  SELECT count(*)::int INTO v_count FROM upd;
  RETURN v_count;
END; $function$;

-- CRON/system only: revoke authenticated too (Supabase default-privileges grants
-- EXECUTE to authenticated on every new fn). A learner-callable graduate RPC would
-- let anyone trigger promotion — cross-tenant risk. service_role is the only caller.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_graduate_prompt_builds(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_graduate_prompt_builds(uuid) TO service_role;

-- 4. Shared-library surface — learner-facing read. Returns the top graduated
--    peer prompts for a topic (anonymized: prompt + score only, no author PII),
--    strictly scoped to the caller's own institution (multi-tenant safety).
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_topic_graduated_prompts(
  p_topic_type text,
  p_topic_id uuid,
  p_limit integer DEFAULT 3
)
 RETURNS TABLE(id uuid, assembled_prompt text, score numeric, graduated_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner uuid;
  v_inst uuid;
BEGIN
  -- Alias profiles: RETURNS TABLE(id …) shadows an unqualified `id`, so qualify.
  SELECT p.learner_id, p.institution_id INTO v_learner, v_inst
  FROM profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN
    RETURN;  -- learners only
  END IF;

  RETURN QUERY
  SELECT b.id,
         b.assembled_prompt,
         (b.grade->>'score')::numeric AS score,
         b.graduated_at
  FROM ai_pulse_prompt_builds b
  WHERE b.graduated_at IS NOT NULL
    AND b.topic_type = p_topic_type
    AND b.topic_id = p_topic_id
    AND b.institution_id = v_inst          -- strict same-institution scope
  ORDER BY (b.grade->>'score')::numeric DESC NULLS LAST, b.graduated_at DESC
  LIMIT COALESCE(NULLIF(p_limit, 0), 3);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_topic_graduated_prompts(text, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_topic_graduated_prompts(text, uuid, integer) TO authenticated;

-- =====================================================================
-- AI Pulse — Star-Prompt Library v2: ₹0 AI safety-check gate (moderation #1)
-- Created: 2026-08-04 - Judge a peer prompt's APPROPRIATENESS before the feed.
-- =====================================================================
-- WHY THIS EXISTS
-- ---------------
-- The classmates' feed (fn_ai_pulse_topic_peer_prompts) surfaces UNGRADED-quality
-- peer prompts campus-wide. The existing AI grader (ai_pulse.prompt_grade) scores
-- prompt CRAFT (role/context/task/format) — NOT content safety. At an institution
-- whose audience includes MINORS (LKG/CBSE learners), a well-structured but
-- inappropriate prompt can score >=60 and would otherwise surface. Director
-- moderation decision #1: a ₹0 AI safety helper judges APPROPRIATENESS, and a
-- prompt shows in the feed ONLY if it passes safety AND scores >=60. This is the
-- PRECONDITION to ever flipping prompt_classmates_feed_enabled on.
--
-- SHAPE MIRRORED: ai_pulse.prompt_grade (per-build judgement) + ai_pulse.prompt_dedup
-- (declarative job row + service-role record RPC + collect/submit cron). Same lane
-- (max), interactive=false, output_target='job.result', tool_set='none', glue
-- prompt_template '{{prompt}}', input_schema one textarea. provider/model_id left
-- unset (NULL) = provider-agnostic; the ₹0 Max box resolves the family model.
--
-- FLOW (mirrors the grade loop; cron = app/api/cron/aipulse-prompt-safety):
--   COLLECT: drain done ai_pulse.prompt_safety jobs, parse the appropriateness
--     verdict, record via fn_ai_pulse_record_prompt_safety (service_role).
--   SUBMIT: enqueue one safety job per feed-candidate build still
--     safety_status='pending' (graded 60-79, non-graduated, non-disqualified).
--
-- FAIL-CLOSED (load-bearing): the feed read requires safety_status='passed'.
-- 'pending' / 'failed' / 'error' / NULL all keep a prompt OUT of the feed. An
-- unchecked prompt, a model glitch, or a deleted verdict default to HIDDEN, never
-- SHOWN — the only safe default for a minors-facing feed.
--
-- DARK by default: the cron is gated behind policy 'prompt_safety_check_enabled'
-- (default false), so NOTHING is enqueued or checked until an admin flips it. And
-- because the feed itself is still dark (prompt_classmates_feed_enabled=false),
-- the READ change is inert today. GO-LIVE ORDER for the Director:
--   (1) flip prompt_safety_check_enabled=true, let the cron backfill verdicts,
--   (2) THEN flip prompt_classmates_feed_enabled=true. Flipping the feed first is
--   still safe (fail-closed: an unchecked feed is simply empty).
--
-- SECDEF: the record RPC is CRON/system-only → service_role (a learner-callable
-- record would let anyone mark their own prompt "safe" — self-attestation defeats
-- the gate). anon+authenticated revoked (the secdef-anon gate treats CREATE OR
-- REPLACE as a new function). The read fn re-asserts its anon lock.

-- ---------------------------------------------------------------------------
-- 1. Kill switch (house rule: every switch = a policy row). DARK.
-- ---------------------------------------------------------------------------
INSERT INTO ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type, is_active)
SELECT 'prompt_safety_check_enabled',
       'AI Pulse: safety-check peer prompts before the feed',
       'When on, a ₹0 AI-Max helper judges whether each feed-candidate learner prompt is APPROPRIATE (content safety, NOT craft) before it can appear in the campus-wide classmates feed. A prompt shows only if it passes this check AND scores >=60. Dark by default; flip this ON and let it backfill BEFORE flipping prompt_classmates_feed_enabled.',
       'false'::jsonb, 'bool', true
WHERE NOT EXISTS (SELECT 1 FROM ai_pulse_policies WHERE config_key = 'prompt_safety_check_enabled');

-- ---------------------------------------------------------------------------
-- 2. Safety verdict on the build. Mirrors the grade columns
--    (grade jsonb / grade_status / graded_at). NULL/'pending' = not yet checked.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_pulse_prompt_builds
  ADD COLUMN IF NOT EXISTS safety            jsonb,
  ADD COLUMN IF NOT EXISTS safety_status     text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS safety_checked_at timestamptz;

COMMENT ON COLUMN public.ai_pulse_prompt_builds.safety_status IS
  'AI Pulse content-safety verdict for the classmates feed (moderation #1). pending=not yet checked; passed=AI judged appropriate; failed=judged inappropriate; error=unparseable/failed check. The feed read (fn_ai_pulse_topic_peer_prompts) shows a prompt ONLY when this = passed (fail-closed). NOT about craft/score — that is grade_status.';
COMMENT ON COLUMN public.ai_pulse_prompt_builds.safety IS
  'AI Pulse safety-check detail from the ₹0 AI-Max job: {"appropriate": bool, "reasons": [...]}. Written by fn_ai_pulse_record_prompt_safety.';

-- Named CHECK so the allowed set is documented at the schema level (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_pulse_prompt_builds_safety_status_chk') THEN
    ALTER TABLE public.ai_pulse_prompt_builds
      ADD CONSTRAINT ai_pulse_prompt_builds_safety_status_chk
      CHECK (safety_status IN ('pending','passed','failed','error'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Job type — Max lane, interactive=false, glue template. Mirrors
--    ai_pulse.prompt_dedup exactly (provider/model_id unset = provider-agnostic ₹0).
-- ---------------------------------------------------------------------------
INSERT INTO ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled, input_schema, expected_seconds, loop_key)
SELECT 'ai_pulse.prompt_safety',
       'AI Pulse - Peer prompt safety check',
       'Given a learner-written build-from-parts prompt, judges whether it is APPROPRIATE to show publicly on a campus feed whose audience includes minors (content safety, NOT craft); returns JSON {"appropriate": bool, "reasons": [...]}. Gates the classmates feed.',
       '{{prompt}}', 'none', 'job.result',
       false, 'max', 'seat_owner', 3, true, true,
       '[{"key":"prompt","type":"textarea","label":"Safety check request","required":true}]'::jsonb, 25, 'ai-pulse'
WHERE NOT EXISTS (SELECT 1 FROM ai_job_types WHERE job_type = 'ai_pulse.prompt_safety');

-- ---------------------------------------------------------------------------
-- 4. Record RPC — CRON/system only. Writes the safety verdict from the drained
--    job. Only the three terminal states are accepted; anything else collapses to
--    'error' so a malformed payload can never accidentally mark a prompt 'passed'.
--    Idempotent w.r.t. the cron: the cron only submits safety_status='pending'
--    builds, so a recorded build is never re-checked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_record_prompt_safety(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_build_id uuid;
  v_status   text;
BEGIN
  v_build_id := NULLIF(p_payload->>'build_id','')::uuid;
  IF v_build_id IS NULL THEN
    RETURN;
  END IF;

  -- Fail-closed normalisation: only 'passed'/'failed'/'error' are valid; any
  -- other/absent value is treated as 'error' (never 'passed').
  v_status := lower(COALESCE(p_payload->>'safety_status',''));
  IF v_status NOT IN ('passed','failed','error') THEN
    v_status := 'error';
  END IF;

  UPDATE ai_pulse_prompt_builds
  SET safety            = COALESCE(p_payload->'safety', safety),
      safety_status     = v_status,
      safety_checked_at = now(),
      updated_at        = now()
  WHERE id = v_build_id;
END; $function$;

-- CRON/system only: revoke authenticated too (Supabase default-privileges grants
-- EXECUTE to authenticated on every new fn). service_role is the only caller.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_record_prompt_safety(jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_record_prompt_safety(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Feed read — GATE on the safety verdict. Base is the kill-switch version
--    (20260804050000); the ONLY change is the new "AND b.safety_status='passed'"
--    row filter (fail-closed). Signature UNCHANGED (id, assembled_prompt, score,
--    used_count) — the sole TS caller is untouched. Anon lock re-asserted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_topic_peer_prompts(p_topic_type text, p_topic_id uuid, p_limit integer DEFAULT 6)
 RETURNS TABLE(id uuid, assembled_prompt text, score numeric, used_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner   uuid;
  v_threshold numeric;
  v_name      text;                              -- subject name to match (NULL for global)
BEGIN
  -- Identity from the session only (self-scoped; confused-deputy guard).
  SELECT p.learner_id INTO v_learner FROM profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN
    RETURN;  -- learners only
  END IF;

  -- Kill switch (safeguarding): campus-wide feed of UNGRADED-quality peer prompts;
  -- the AI grader scores craft, not content safety. Dark by default; the Director
  -- flips 'prompt_classmates_feed_enabled' to turn it on. Per-item guards still apply.
  IF NOT COALESCE((SELECT (value_jsonb)::boolean FROM ai_pulse_policies
                   WHERE config_key = 'prompt_classmates_feed_enabled' AND is_active LIMIT 1), false) THEN
    RETURN;
  END IF;

  SELECT COALESCE((value_jsonb)::numeric, 2) INTO v_threshold
  FROM ai_pulse_policies WHERE config_key = 'prompt_report_autohide_threshold' AND is_active LIMIT 1;
  v_threshold := COALESCE(v_threshold, 2);

  -- Resolve the caller's topic to a SUBJECT NAME. 'global' has no name (matched by type).
  IF p_topic_type = 'programme' THEN
    SELECT pr.program_name INTO v_name FROM programs pr WHERE pr.id = p_topic_id;
  ELSIF p_topic_type = 'course' THEN
    SELECT c.course_name INTO v_name FROM courses c WHERE c.id = p_topic_id;
  ELSIF p_topic_type = 'global' THEN
    v_name := NULL;
  ELSE
    RETURN;  -- unknown topic type
  END IF;

  IF p_topic_type <> 'global' AND v_name IS NULL THEN
    RETURN;  -- topic id didn't resolve to a name -> nothing to match
  END IF;

  RETURN QUERY
  SELECT b.id,
         b.assembled_prompt,
         (b.grade->>'score')::numeric AS score,
         COALESCE((
           SELECT count(DISTINCT u.profile_id)
           FROM ai_pulse_prompt_build_uses u
           WHERE u.build_id = b.id AND u.action = 'copy'
         ), 0) AS used_count
  FROM ai_pulse_prompt_builds b
  LEFT JOIN programs bpr ON b.topic_type = 'programme' AND bpr.id = b.topic_id
  LEFT JOIN courses  bco ON b.topic_type = 'course'    AND bco.id = b.topic_id
  WHERE b.graduated_at IS NULL                    -- NON-star: not yet graduated
    -- Decent-but-not-yet-star band. >=80 would auto-graduate on quality; this is
    -- the popularity lane where copies (>=3 distinct) can promote it.
    AND (b.grade->>'score')::numeric BETWEEN 60 AND 79
    AND b.learner_id <> v_learner                 -- never the caller's own builds
    -- Match the SAME subject by NAME across ALL colleges (no institution scope). [#2]
    AND (
         (p_topic_type = 'programme' AND b.topic_type = 'programme' AND bpr.program_name = v_name)
      OR (p_topic_type = 'course'    AND b.topic_type = 'course'    AND bco.course_name  = v_name)
      OR (p_topic_type = 'global'    AND b.topic_type = 'global')
    )
    -- SAFETY GATE (moderation #1, safeguarding minors): show ONLY after the ₹0 AI
    -- safety check judged the prompt APPROPRIATE. Fail-closed — pending/failed/
    -- error/NULL never surface. The grader scores craft; THIS gates content.
    AND b.safety_status = 'passed'
    -- Champion disqualify: a disqualified build NEVER surfaces.
    AND b.disqualified_at IS NULL
    -- Auto-hide: exclude a build with >= threshold DISTINCT learner flags a champion
    -- has NOT cleared (UNIQUE(build_id, reporter_profile_id) => distinct reporters).
    AND NOT (
      b.report_cleared_at IS NULL
      AND (
        SELECT count(DISTINCT r.reporter_profile_id)
        FROM ai_pulse_prompt_build_reports r
        WHERE r.build_id = b.id
      ) >= v_threshold
    )
  ORDER BY (b.grade->>'score')::numeric DESC NULLS LAST, b.id
  LIMIT COALESCE(NULLIF(p_limit, 0), 6);
END; $function$;

-- Re-assert the anon lock (Supabase default-privileges re-grants authenticated on
-- CREATE OR REPLACE; the secdef-anon gate treats this replace as a new fn).
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer) TO authenticated;

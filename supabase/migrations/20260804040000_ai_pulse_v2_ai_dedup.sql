-- =====================================================================
-- AI Pulse — Star-Prompt Library v2: ₹0 AI-Max semantic dedup (decision #7)
-- Created: 2026-08-04 - Group near-duplicate stars by MEANING, not trigram.
-- =====================================================================
-- When a learner build graduates into the shared library, it can express the
-- SAME idea as an existing star on its subject shelf (differently worded). The
-- library should later show just the best of a duplicate set, not five copies.
-- Decision #7: a nightly ₹0 claude_code Max-lane job judges "same idea?" against
-- the existing canonical stars on the shelf and, if so, marks the newcomer a
-- duplicate. Semantic, not the old trigram grouping — and no new infra: it is a
-- declarative ai_job_types row + prompt, drained by the same generic Max lane
-- that already runs the prompt grader (₹0, family-alias model, provider-agnostic).
--
-- SHAPE MIRRORED: ai_pulse.prompt_grade (migration 20260723063000). Same lane
-- (max), interactive=false, output_target='job.result', tool_set='none', glue
-- prompt_template '{{prompt}}', input_schema one textarea. provider/model_id left
-- unset (NULL) = provider-agnostic; the ₹0 box resolves the family model.
--
-- FLOW (mirrors the grade loop's collect-then-submit sibling cron):
--   fn_ai_pulse_enqueue_prompt_dedup(build) — assembles {candidate + shelf stars}
--     and enqueues one ai_pulse.prompt_dedup job (service-role, via
--     fn_ai_enqueue_system → seat owner, in-flight guarded, ₹0 Max lane).
--   fn_ai_pulse_record_prompt_dedup(payload) — writes ai_pulse_prompt_builds
--     .duplicate_of from the drained verdict, with a same-shelf/canonical guard.
--   The sibling cron app/api/cron/aipulse-prompt-dedup drains done jobs → record,
--     then submits dedup jobs for newly-graduated builds.
--
-- DARK by default: gated behind policy 'prompt_dedup_enabled' (default false).
-- Nothing is enqueued and nothing is marked until an admin flips it. Also inert
-- in practice today (7 builds, 1 graduated). Read side unchanged: the library's
-- "hide duplicate_of / show best" filter is a deliberate 1-line follow-up on the
-- read fn (owned by PR A) once PR A + PR C both merge — kept out of this file to
-- avoid a shared-fn conflict.
--
-- SECDEF: both RPCs are CRON/system-only → service_role (never authenticated:
-- a learner-callable enqueue/record would let anyone drive grouping — cross-tenant
-- risk). Both anon-locked (the gate treats CREATE OR REPLACE as a new function).

-- 1. Kill switch (house rule: every switch = a policy row). DARK.
INSERT INTO ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type, is_active)
SELECT 'prompt_dedup_enabled',
       'AI Pulse: semantic dedup of star prompts',
       'When on, the nightly ₹0 AI-Max dedup cron judges whether a newly-graduated learner prompt is the same idea as an existing star on its shelf and, if so, marks it a duplicate so the library can show just the best. Dark by default.',
       'false'::jsonb, 'bool', true
WHERE NOT EXISTS (SELECT 1 FROM ai_pulse_policies WHERE config_key = 'prompt_dedup_enabled');

-- 2. Duplicate grouping marker on the build (NULL = not a duplicate / canonical).
ALTER TABLE ai_pulse_prompt_builds
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES ai_pulse_prompt_builds(id);
COMMENT ON COLUMN ai_pulse_prompt_builds.duplicate_of IS
  'Set when this graduated build was judged (by the ₹0 AI-Max dedup job, decision #7) to express the same idea as an earlier canonical star on the same shelf. NULL = canonical / not a duplicate. Points only at a graduated, non-disqualified, non-duplicate star on the same (topic_type, topic_id).';

-- 3. Job type — Max lane, interactive=false, glue template. Mirrors
--    ai_pulse.prompt_grade exactly (provider/model_id unset = provider-agnostic).
INSERT INTO ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled, input_schema, expected_seconds, loop_key)
SELECT 'ai_pulse.prompt_dedup',
       'AI Pulse - Star prompt semantic dedup',
       'Given a graduation-candidate learner prompt and the existing canonical star prompts on the same subject shelf, judges whether the candidate expresses the same idea as one of them; returns JSON with the duplicate index (or 0 for none). Groups near-duplicates so the library shows just the best.',
       '{{prompt}}', 'none', 'job.result',
       false, 'max', 'seat_owner', 3, true, true,
       '[{"key":"prompt","type":"textarea","label":"Dedup request","required":true}]'::jsonb, 25, 'ai-pulse'
WHERE NOT EXISTS (SELECT 1 FROM ai_job_types WHERE job_type = 'ai_pulse.prompt_dedup');

-- 4. Enqueue RPC — CRON/system only. Assembles the candidate + the canonical
--    stars on its shelf and enqueues ONE dedup job on the ₹0 Max lane. Idempotent:
--    fn_ai_enqueue_system's in-flight guard blocks re-enqueue while a job is
--    pending/claimed/running; the terminal-job check below blocks re-judging an
--    already-decided build. Returns fn_ai_enqueue_system's jsonb (or a skip reason).
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_enqueue_prompt_dedup(p_build_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled   boolean;
  v_build     ai_pulse_prompt_builds%ROWTYPE;
  v_ids       uuid[];
  v_stars_txt text;
  v_prompt    text;
  v_dedupe    text;
  v_res       jsonb;
BEGIN
  -- Dark gate (defense-in-depth; the cron also gates).
  SELECT COALESCE((value_jsonb)::boolean, false) INTO v_enabled
  FROM ai_pulse_policies WHERE config_key = 'prompt_dedup_enabled' AND is_active LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'disabled');
  END IF;

  SELECT * INTO v_build FROM ai_pulse_prompt_builds WHERE id = p_build_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'build_not_found');
  END IF;

  -- Only judge graduated, non-disqualified builds that carry a shelf key and are
  -- not already grouped as a duplicate.
  IF v_build.graduated_at IS NULL
     OR v_build.disqualified_at IS NOT NULL
     OR v_build.topic_type IS NULL
     OR v_build.topic_id IS NULL
     OR v_build.duplicate_of IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_eligible');
  END IF;

  -- Idempotency: skip if a dedup job for this build already reached a terminal
  -- state. (fn_ai_enqueue_system covers the still-running window.)
  v_dedupe := 'aipulse_dedup|' || p_build_id::text;
  IF EXISTS (
    SELECT 1 FROM ai_jobs
    WHERE job_type = 'ai_pulse.prompt_dedup'
      AND status IN ('done','error','canceled')
      AND payload->>'_dedupe' = v_dedupe
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_judged');
  END IF;

  -- The canonical stars on the SAME shelf (same topic_type + topic_id): graduated,
  -- non-disqualified, not themselves duplicates, excluding self. Oldest-first so
  -- the index the model returns maps deterministically to the candidate id array.
  WITH peers AS (
    SELECT b.id, b.assembled_prompt,
           row_number() OVER (ORDER BY b.graduated_at ASC, b.id ASC) AS rn
    FROM ai_pulse_prompt_builds b
    WHERE b.topic_type = v_build.topic_type
      AND b.topic_id   = v_build.topic_id
      AND b.id <> v_build.id
      AND b.graduated_at IS NOT NULL
      AND b.disqualified_at IS NULL
      AND b.duplicate_of IS NULL
    ORDER BY b.graduated_at ASC, b.id ASC
    LIMIT 20
  )
  SELECT array_agg(id ORDER BY rn),
         string_agg(rn::text || '. ' || assembled_prompt, E'\n\n' ORDER BY rn)
    INTO v_ids, v_stars_txt
  FROM peers;

  -- No canonical peer to compare against → cannot be a duplicate by construction.
  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_peers');
  END IF;

  v_prompt :=
    'You keep a shared library of learner-written AI prompts free of near-duplicates.' || E'\n'
 || 'Below is a CANDIDATE prompt, then a numbered list of EXISTING library prompts on the same subject.' || E'\n'
 || 'Decide whether the CANDIDATE expresses essentially the SAME idea and intent as ONE of the existing prompts' || E'\n'
 || '(same underlying task and goal, even if the wording, length, or examples differ). Ignore surface wording;' || E'\n'
 || 'judge the underlying request. Be conservative: only call it a duplicate when the core task clearly matches.' || E'\n\n'
 || 'Return ONLY valid JSON, no markdown, no commentary, exactly:' || E'\n'
 || '{"duplicate_of_index": <N>, "reason": "<short>"}' || E'\n'
 || '- N = the number of the ONE existing prompt the candidate duplicates, or 0 if it is meaningfully different from all of them.' || E'\n\n'
 || 'CANDIDATE:' || E'\n' || '"""' || E'\n' || v_build.assembled_prompt || E'\n' || '"""' || E'\n\n'
 || 'EXISTING LIBRARY PROMPTS:' || E'\n' || v_stars_txt;

  SELECT public.fn_ai_enqueue_system(
    'ai_pulse.prompt_dedup',
    jsonb_build_object(
      'prompt', v_prompt,
      '_ctx', jsonb_build_object('build_id', p_build_id, 'candidates', to_jsonb(v_ids))
    ),
    v_dedupe
  ) INTO v_res;

  RETURN v_res;
END; $function$;

-- 5. Record RPC — CRON/system only. Writes duplicate_of from the drained verdict.
--    The cron maps the model's returned index → the candidate id (from _ctx) and
--    passes it here as duplicate_of. Guards: never override a champion decision or
--    an existing grouping, never self-reference, and only accept a target that is a
--    canonical graduated star on the SAME shelf (blocks a hallucinated/cross-shelf/
--    chained target). A NULL/absent duplicate_of ("unique") is a no-op.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_record_prompt_dedup(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_build_id uuid;
  v_dup_id   uuid;
  v_build    ai_pulse_prompt_builds%ROWTYPE;
  v_ok       boolean;
BEGIN
  v_build_id := NULLIF(p_payload->>'build_id','')::uuid;
  IF v_build_id IS NULL THEN
    RETURN;
  END IF;

  -- "unique" verdict → nothing to write.
  IF NULLIF(p_payload->>'duplicate_of','') IS NULL THEN
    RETURN;
  END IF;
  v_dup_id := (p_payload->>'duplicate_of')::uuid;

  SELECT * INTO v_build FROM ai_pulse_prompt_builds WHERE id = v_build_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Candidate must still be a canonical graduated star; never self-reference.
  IF v_build.graduated_at IS NULL
     OR v_build.disqualified_at IS NOT NULL
     OR v_build.duplicate_of IS NOT NULL
     OR v_dup_id = v_build_id THEN
    RETURN;
  END IF;

  -- Target must be a canonical graduated star on the SAME shelf.
  SELECT EXISTS (
    SELECT 1 FROM ai_pulse_prompt_builds t
    WHERE t.id = v_dup_id
      AND t.graduated_at IS NOT NULL
      AND t.disqualified_at IS NULL
      AND t.duplicate_of IS NULL
      AND t.topic_type = v_build.topic_type
      AND t.topic_id   = v_build.topic_id
  ) INTO v_ok;
  IF NOT v_ok THEN
    RETURN;
  END IF;

  UPDATE ai_pulse_prompt_builds
  SET duplicate_of = v_dup_id, updated_at = now()
  WHERE id = v_build_id;
END; $function$;

-- CRON/system only: revoke authenticated too (Supabase default-privileges grants
-- EXECUTE to authenticated on every new fn). service_role is the only caller.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_enqueue_prompt_dedup(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_enqueue_prompt_dedup(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_record_prompt_dedup(jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_record_prompt_dedup(jsonb) TO service_role;

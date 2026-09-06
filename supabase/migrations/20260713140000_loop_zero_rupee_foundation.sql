-- ============================================================================
-- 20260713140000_loop_zero_rupee_foundation.sql
-- ----------------------------------------------------------------------------
-- ₹0 loop-generator migration — FOUNDATION (Director work order 2026-07-13 §B).
-- Moves loop AI generators off the paid Anthropic fallback onto the #1998
-- generic ai_jobs registry (the ₹0 Max lane, drained by the Windows generic
-- seat runner). This file adds the SHARED spine; a per-generator PR then wires
-- one cron behind its flip-back switch. The #2016 CDC route is the pattern.
--
-- WHY new RPCs (the cron-enqueue gap): #1998 fn_ai_enqueue HARD-requires
-- auth.uid() (a logged-in user), but a Vercel cron has NO session. So a cron
-- cannot use fn_ai_enqueue. This migration adds:
--   • fn_ai_enqueue_system  — service-role only; resolves requested_by from the
--     seat-owner allowlist (ai_model_config.max_lane_user_ids[0], single source
--     of truth) so scheduled Max work is attributed to the seat owner. The
--     generic drain claims by lane, NOT by requester, so it drains these.
--   • fn_ai_collect_claim   — service-role only; atomically claims done+
--     undelivered jobs (stamps delivered_at, FOR UPDATE SKIP LOCKED) so a
--     collect sweep records each result exactly once (at-most-once record;
--     domain record fns are idempotent upserts, so even a retry is safe).
--   • ai_jobs in-flight dedupe index — a candidate whose job is still
--     non-terminal is not re-enqueued (mirrors ai_batch_job_items' guard).
--
-- Switch (config-table pattern, the standing rule): platform_policies
-- `loops.<key>.generation_lane` in {'jobs','direct'}. 'jobs' → the cron
-- enqueues onto ai_jobs (₹0); 'direct' → the cron keeps its existing paid
-- Anthropic fallback verbatim (the flip-back). Read via fn_get_policy service-
-- role (global scope resolves with no auth.uid()).
--
-- Additive + idempotent. Nothing existing moves. Validated rolled-back on prod
-- (BEGIN…ROLLBACK Mgmt-API batch) before apply — receipts in the PR body.
-- Ref: .claude/loop-lane-workorder-20260713.md §B; memory/project_ai_jobs_registry_lane.md
-- ============================================================================

-- ── 1. IN-FLIGHT DEDUPE on ai_jobs ──────────────────────────────────────────
-- Only rows carrying a `_dedupe` payload key AND still non-terminal are indexed,
-- so ordinary jobs (fn_ai_enqueue, the drain) are unconstrained. Defense-in-
-- depth behind fn_ai_enqueue_system's advisory-lock + EXISTS pre-check: if any
-- other path inserted a duplicate in-flight _dedupe it would surface as an error
-- (a bug) rather than silently double-generating.
CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_inflight_dedupe_idx
  ON public.ai_jobs (job_type, (payload->>'_dedupe'))
  WHERE status IN ('pending','claimed','running') AND (payload->>'_dedupe') IS NOT NULL;

-- ── 2. SYSTEM ENQUEUE (service-role; no auth.uid() required) ─────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_enqueue_system(
  p_job_type   text,
  p_payload    jsonb DEFAULT '{}'::jsonb,
  p_dedupe_key text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '10s'
AS $fn$
DECLARE
  v_type    public.ai_job_types%ROWTYPE;
  v_seat    uuid;
  v_payload jsonb;
  v_id      uuid;
BEGIN
  SELECT * INTO v_type FROM public.ai_job_types WHERE job_type = p_job_type AND enabled = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown or disabled job_type');
  END IF;

  -- Seat owner = single source of truth (the same allowlist fn_ai_enqueue's
  -- seat_owner rule reads). Scheduled Max jobs are attributed to the seat owner;
  -- the drain claims by lane, so requester identity does not gate draining.
  SELECT (config_json->'max_lane_user_ids'->>0)::uuid
    INTO v_seat
    FROM public.ai_model_config
   WHERE feature_key = 'ai_query.natural_language' AND is_active
   LIMIT 1;
  IF v_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no seat owner configured');
  END IF;

  v_payload := COALESCE(p_payload, '{}'::jsonb);
  IF p_dedupe_key IS NOT NULL THEN
    v_payload := v_payload || jsonb_build_object('_dedupe', p_dedupe_key);

    -- In-flight guard: serialize racers on (job_type, dedupe) then skip if a
    -- job for this candidate is still non-terminal (mirrors fn_ai_enqueue's
    -- advisory-lock cap). Prevents re-enqueuing a candidate already queued.
    PERFORM pg_advisory_xact_lock(hashtext('ai_jobs_sys:' || p_job_type || ':' || p_dedupe_key));
    IF EXISTS (
      SELECT 1 FROM public.ai_jobs
       WHERE job_type = p_job_type
         AND status IN ('pending','claimed','running')
         AND payload->>'_dedupe' = p_dedupe_key
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'in_flight');
    END IF;
  END IF;

  INSERT INTO public.ai_jobs (job_type, payload, requested_by, lane, priority)
  VALUES (p_job_type, v_payload, v_seat, v_type.lane, 100)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'job_id', v_id);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_enqueue_system(text, jsonb, text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_ai_enqueue_system(text, jsonb, text) TO service_role;

-- ── 3. COLLECT CLAIM (service-role; exactly-once delivery) ───────────────────
-- Atomically claims done + not-yet-delivered jobs for the given types, stamping
-- delivered_at so a concurrent sweep never records the same result twice
-- (FOR UPDATE SKIP LOCKED). At-most-once record: if the caller crashes between
-- claim and domain-record, that one result is dropped (the daily cron
-- regenerates the candidate) — never corrupted, per the Director's accepted
-- "a missed cycle is a skipped cycle" tolerance.
CREATE OR REPLACE FUNCTION public.fn_ai_collect_claim(
  p_job_types text[],
  p_limit     int DEFAULT 50
)
RETURNS SETOF public.ai_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '15s'
AS $fn$
BEGIN
  RETURN QUERY
  UPDATE public.ai_jobs j
     SET delivered_at = now()
   WHERE j.id IN (
     SELECT id FROM public.ai_jobs
      WHERE status = 'done'
        AND delivered_at IS NULL
        AND job_type = ANY(p_job_types)
      ORDER BY completed_at ASC NULLS LAST
      FOR UPDATE SKIP LOCKED
      LIMIT GREATEST(COALESCE(p_limit, 50), 1)
   )
  RETURNING j.*;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_collect_claim(text[], int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_ai_collect_claim(text[], int) TO service_role;

-- ── 4. JOB TYPE SEED — curriculum.lesson_spine_generate (first generator) ────
-- Glue prompt_template ({{prompt}}): the cron assembles the EXACT system+user
-- text it would have sent to Anthropic and passes it as payload.prompt, so the
-- model sees identical instructions (effect-parity — the drafts written via
-- fn_curriculum_lesson_ai_draft_upsert are structurally identical). tool_set
-- 'none' + interactive=false → runs on the generic Windows seat drain (proven
-- by work_pulse.translate at ₹0). output_target 'job.result' → the drain writes
-- the model text to ai_jobs.result; the cron's collect sweep does the domain
-- record (byte-parity of effects stays in app code). allow_rule seat_owner is
-- documentary (system enqueue is service-role); it gates the /admin AI-Studio
-- manual-run path. ON CONFLICT DO NOTHING keeps this additive + idempotent.
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, schedulable, enabled, input_schema, expected_seconds)
VALUES
  ('curriculum.lesson_spine_generate',
   'Curriculum — Lesson Spine (loop generator)',
   'Loop generator: breaks a course''s BoS-approved syllabus into an ordered lesson spine (Fink + Bloom mapped), recorded as draft lessons. Migrated onto the #1998 Max lane (₹0) behind loops.curriculum_lesson_spine_generate.generation_lane. The cron assembles the full prompt and passes it as payload.prompt.',
   '{{prompt}}',
   'none', 'job.result', false, 'max', 'seat_owner', true, true,
   '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb,
   90)
ON CONFLICT (job_type) DO NOTHING;

-- ── 5. SWITCH SEED — generation_lane policy (flip-back), seeded 'jobs' ────────
-- Go-live rule (ratified): merging = flipping. On deploy the curriculum cron
-- reads 'jobs' and enqueues onto ai_jobs instead of paying Anthropic on the
-- fallback path. Flip back to 'direct' at any time (no deploy) to restore the
-- paid path verbatim. String policy: fn_get_policy returns the jsonb value.
-- NOTE: platform_policies has NO unique constraint on (policy_key, scope_type,
-- scope_id) — only PRIMARY KEY (id) — so this is an IDENTITY-guarded NOT EXISTS
-- insert, not ON CONFLICT (which would error, and would risk resurrecting a
-- Director-flipped value on re-run — see feedback_seed_onconflict_mutable_column).
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, publication_state)
SELECT
  'loops.curriculum_lesson_spine_generate.generation_lane', 'global', NULL,
  '"jobs"'::jsonb,
  'Generation lane for the curriculum lesson-spine loop generator: ''jobs'' = enqueue on the #1998 ai_jobs Max lane (₹0); ''direct'' = the legacy paid Anthropic fallback. Flip-back switch (no deploy).',
  'string', true, true, 'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'loops.curriculum_lesson_spine_generate.generation_lane'
     AND scope_type = 'global' AND scope_id IS NULL
);

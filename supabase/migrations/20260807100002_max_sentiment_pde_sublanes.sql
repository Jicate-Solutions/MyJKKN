-- ============================================================================
-- Voice-memo sentiment + PDE coach → ₹0 Max sub-lanes (Stage 2a of the
-- "move the last paid AI features onto the free Max lane" handoff)
-- ============================================================================
-- Created: 2026-07-28. Applied by the orchestrator with a BEGIN…ROLLBACK
-- rehearsal — NOT auto-applied by any deploy.
--
-- WHY: voice_memo.sentiment still runs on paid Google (gemini-2.5-flash-lite)
-- and the PDE clinical-reasoning coach still runs on paid Google. This migration
-- registers the two dedicated Max SUB-LANES they will ride — `max-sentiment`
-- (background) and `max-pde` (interactive, live student) — so a runner on either
-- lane can never be handed a live ai_query.chat question (fn_ai_claim filters on
-- (lane, interactive) with NO job_type predicate). Both sub-lanes are widened in
-- THIS migration so Stage 3 (PDE) needs no second CHECK/allowlist re-widen.
--
-- SHIPS DARK: this migration ONLY re-lanes voice_memo.sentiment and widens the
-- vocabulary. It does NOT enable anything and does NOT change which model the
-- live path uses:
--   • enabled stays FALSE on voice_memo.sentiment.
--   • provider/model_id are set to NULL. This is the DARK-SAFE state, not the
--     final state. Model resolution (getModelForFeature AND fn_ai_claim) uses the
--     rule "ai_job_types wins ONLY when it carries both provider AND model_id,
--     else fall back to ai_model_config". With NULL here, the STILL-LIVE direct
--     cron (app/api/cron/analyze-voice-memos) resolves voice_memo.sentiment from
--     ai_model_config — which still holds google / gemini-2.5-flash-lite,
--     is_active=true — so the live Gemini path is byte-unchanged while dark.
--   • CUTOVER (human, later — see the runbook in
--     specs/ai-max-lane-move-live-features-handoff-2026-07-28.md) flips
--     provider='anthropic' + a Claude model_id + enabled=true AND enables the
--     `maxlane:voice-memo-sentiment` schedule row TOGETHER. Setting provider now
--     would make the still-live direct path call PAID Anthropic — hence NULL.
--
-- CONTAINS ONE SECDEF REPLACE: fn_ai_job_type_upsert (section 2). It is a
-- CREATE OR REPLACE of the LIVE production body with the sub-lane vocabulary
-- extended — required, because that RPC silently coerces an unknown lane back to
-- 'max' and would otherwise undo section 3 the first time anyone saves the job
-- type from /admin/ai-models. The body below is the LIVE definition
-- (md5 babe2215d3222add0c70a9790f9c5fc9, read from pg_get_functiondef at
-- authoring time — verified equal to the baseline documented in the sibling
-- migration 20260805090000_procurement_pdf_max_lane.sql). The ONLY edit vs live
-- is the extended IN(...) vocabulary. Re-read the live md5 before applying: if it
-- has moved, regenerate this body rather than apply blind.
--
-- ⚠️  ORDERING NOTE vs 20260805090000_procurement_pdf_max_lane.sql (procurement,
--     merged but NOT yet applied): both migrations DROP+re-ADD ai_job_types_lane_chk
--     and CREATE OR REPLACE fn_ai_job_type_upsert. Whichever applies LAST wins.
--     This file carries the FULL superset (max-pdf + max-sentiment + max-pde), so
--     applying THIS one last is safe. If procurement's migration is applied AFTER
--     this one, its narrower vocabulary ('max','api','either','max-pdf') will DROP
--     max-sentiment/max-pde from both the CHECK and the allowlist. Apply this file
--     AFTER procurement's, or fold the superset into procurement's before applying.
--
-- ADDITIVE / IDEMPOTENT / DROPS-NOTHING for the vocabulary and the row config.
-- ============================================================================

BEGIN;

-- ── 1. Widen the lane vocabulary (drop + re-add; WIDEN-ONLY superset) ────────
-- Includes max-pdf so this migration is safe to apply after OR instead of the
-- procurement migration; includes BOTH new sub-lanes so Stage 3 needs no re-widen.
ALTER TABLE public.ai_job_types DROP CONSTRAINT IF EXISTS ai_job_types_lane_chk;
ALTER TABLE public.ai_job_types
  ADD CONSTRAINT ai_job_types_lane_chk
  CHECK (lane = ANY (ARRAY['max'::text, 'api'::text, 'either'::text, 'max-pdf'::text, 'max-sentiment'::text, 'max-pde'::text]));

-- ── 2. Teach fn_ai_job_type_upsert about the two new sub-lanes ───────────────
-- WITHOUT THIS the lane split is undone by a UI save: the RPC behind
-- /admin/ai-models → job-type edit carries its own vocabulary gate independent of
-- the CHECK; an unrecognised lane is SILENTLY coerced back to 'max'. For an
-- interactive job type (max-pde) that re-arms the ai_query.chat claim collision.
-- LIVE body (md5 babe2215d3222add0c70a9790f9c5fc9); ONLY the IN(...) list changed.
CREATE OR REPLACE FUNCTION public.fn_ai_job_type_upsert(p_def jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
DECLARE
  v_job_type      text := nullif(trim(p_def->>'job_type'), '');
  v_title         text := nullif(trim(p_def->>'title'), '');
  v_lane          text := coalesce(p_def->>'lane', 'max');
  v_output_target text := coalesce(p_def->>'output_target', 'job.result');
  v_allow_rule    text := coalesce(p_def->>'allow_rule', 'seat_owner');
  v_tool_set      text := coalesce(nullif(trim(p_def->>'tool_set'), ''), 'all');
  v_input_schema  jsonb;
  v_expected      int;
  v_max_inflight  int;
  v_row           public.ai_job_types%ROWTYPE;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: super_admin required';
  END IF;

  -- job_type must be a safe key (lowercase, digits, underscore, dot)
  IF v_job_type IS NULL OR v_job_type !~ '^[a-z0-9_.]+$' THEN
    RAISE EXCEPTION 'job_type must match ^[a-z0-9_.]+$ (got %)', coalesce(v_job_type, '<null>');
  END IF;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'title is required';
  END IF;

  -- Coerce to CHECK-constraint vocab; anything unrecognised → safe default.
  -- 'max-pdf' (2026-07-28, procurement): a dedicated Max sub-lane.
  -- 'max-sentiment' / 'max-pde' (2026-07-28, this migration): dedicated Max
  -- sub-lanes for voice-memo sentiment and the PDE coach. They MUST be listed
  -- here — without them this coercion silently rewrites lane back to 'max',
  -- which for the interactive max-pde type re-arms the ai_query.chat collision.
  IF v_lane NOT IN ('max', 'api', 'either', 'max-pdf', 'max-sentiment', 'max-pde') THEN
    v_lane := 'max';
  END IF;
  IF NOT (v_output_target IN ('job.result', 'inbox') OR v_output_target LIKE 'table:%') THEN
    v_output_target := 'job.result';
  END IF;
  IF NOT (v_allow_rule IN ('seat_owner', 'authenticated') OR v_allow_rule LIKE 'permission:%') THEN
    v_allow_rule := 'seat_owner';
  END IF;

  -- input_schema must be a JSON array; otherwise empty.
  v_input_schema := CASE
    WHEN jsonb_typeof(p_def->'input_schema') = 'array' THEN p_def->'input_schema'
    ELSE '[]'::jsonb
  END;

  -- expected_seconds / max_inflight: tolerate strings, clamp sane.
  BEGIN
    v_expected := nullif(p_def->>'expected_seconds', '')::int;
  EXCEPTION WHEN others THEN v_expected := NULL;
  END;
  IF v_expected IS NOT NULL AND v_expected < 0 THEN
    v_expected := NULL;
  END IF;
  BEGIN
    v_max_inflight := coalesce(nullif(p_def->>'max_inflight', '')::int, 3);
  EXCEPTION WHEN others THEN v_max_inflight := 3;
  END;
  IF v_max_inflight < 1 THEN
    v_max_inflight := 1;
  END IF;

  INSERT INTO public.ai_job_types (
    job_type, title, description, prompt_template, tool_set, output_target,
    interactive, lane, allow_rule, max_inflight, schedulable, enabled,
    input_schema, expected_seconds, updated_at
  ) VALUES (
    v_job_type,
    v_title,
    nullif(trim(p_def->>'description'), ''),
    nullif(trim(p_def->>'prompt_template'), ''),
    v_tool_set,
    v_output_target,
    coalesce((p_def->>'interactive')::boolean, false),
    v_lane,
    v_allow_rule,
    v_max_inflight,
    coalesce((p_def->>'schedulable')::boolean, false),
    coalesce((p_def->>'enabled')::boolean, true),
    v_input_schema,
    v_expected,
    now()
  )
  ON CONFLICT (job_type) DO UPDATE SET
    title            = EXCLUDED.title,
    description      = EXCLUDED.description,
    prompt_template  = EXCLUDED.prompt_template,
    tool_set         = EXCLUDED.tool_set,
    output_target    = EXCLUDED.output_target,
    interactive      = EXCLUDED.interactive,
    lane             = EXCLUDED.lane,
    allow_rule       = EXCLUDED.allow_rule,
    max_inflight     = EXCLUDED.max_inflight,
    schedulable      = EXCLUDED.schedulable,
    enabled          = EXCLUDED.enabled,
    input_schema     = EXCLUDED.input_schema,
    expected_seconds = EXCLUDED.expected_seconds,
    updated_at       = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'job_type', v_row.job_type, 'row', to_jsonb(v_row));
END;
$function$;

-- Preserve the exact grant set this function had before the replace.
REVOKE EXECUTE ON FUNCTION public.fn_ai_job_type_upsert(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_type_upsert(jsonb) TO authenticated, service_role;

-- ── 3. Re-lane voice_memo.sentiment onto max-sentiment (DARK) ────────────────
-- interactive stays FALSE (background). lane='max-sentiment' is the isolation:
-- fn_ai_claim('max-sentiment', runner, false) is the ONLY way a max-sentiment
-- job can be claimed. provider/model NULL → dark-safe (see header); the direct
-- cron falls back to ai_model_config (google) until cutover. prompt_template is
-- the glue '{{prompt}}' — the cron assembles the full system+transcript prompt
-- and passes it as payload.prompt (enqueueJobsLane contract). enabled UNTOUCHED
-- (stays false) — go-live is a one-line flip alongside the schedule row.
UPDATE public.ai_job_types
   SET lane             = 'max-sentiment',
       interactive      = false,
       provider         = NULL,
       model_id         = NULL,
       prompt_template  = '{{prompt}}',
       allow_rule       = 'seat_owner',
       expected_seconds = 30,
       description      = 'Voice-memo sentiment — ₹0 Max sub-lane (background). Dark until the max-sentiment runner is proven.',
       updated_at       = now()
 WHERE job_type = 'voice_memo.sentiment';

NOTIFY pgrst, 'reload schema';

COMMIT;

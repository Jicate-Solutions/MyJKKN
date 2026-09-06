-- Feature A: fn_ai_claim honors a per-job model OVERRIDE from the payload.
--
-- The Windows Max-lane drain already runs whatever model fn_ai_claim returns in
-- spec.model_id (proven live 2026-07-23 — the per-job-model Opus probe ran
-- claude-opus-4-8). So the auto-compare loop's "run the OLD model on this input"
-- needs NO box change: we resolve payload._model_override HERE and the drain uses
-- it transparently. This is the whole reason the collect loop is verifiable
-- end-to-end without a drain patch.
--
-- Contract: a job whose payload carries
--     "_model_override": { "provider": "anthropic", "model_id": "<claude-...>" }
-- is run on that exact model. Only the model_compare.replay cron sets this today
-- (to pin the OLD model), but the mechanism is generic.
--
-- SAFETY:
--  - Honored ONLY for provider 'anthropic' (the Max lane is Claude-only, D3). A
--    missing/blank provider defaults to anthropic; a non-anthropic override is
--    ignored (falls through to the registry model).
--  - NEVER honored for the safety-judge job types (scf.note_safety_judge,
--    scf.judge_help_ask, bug.reverify): they have a Sonnet floor enforced at the
--    registry (fn_ai_job_type_set_model). Those job types are enqueued only by
--    crons (allow_rule='seat_owner'), so a user cannot forge one — but excluding
--    them here is defense-in-depth so no payload can ever drop a safety judge
--    below its floor.
--  - Behavior-preserving for every existing job: with no _model_override in the
--    payload, the resolved model is byte-identical to before this migration.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_ai_claim(p_lane text DEFAULT NULL::text, p_runner text DEFAULT 'unknown'::text, p_interactive boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
DECLARE
  j  public.ai_jobs%ROWTYPE;
  t  public.ai_job_types%ROWTYPE;
  mc public.ai_model_config%ROWTYPE;
  v_use_reg      boolean;
  v_provider     text;
  v_model_id     text;
  v_ovr          jsonb;
  v_ovr_provider text;
  v_ovr_model    text;
BEGIN
  UPDATE public.ai_jobs SET status='claimed', claimed_by=p_runner, claimed_at=now()
   WHERE id = (
     SELECT j2.id FROM public.ai_jobs j2
       JOIN public.ai_job_types t2 ON t2.job_type = j2.job_type
      WHERE j2.status='pending'
        AND (p_lane IS NULL OR j2.lane = p_lane)
        AND COALESCE(t2.interactive, false) = p_interactive
      ORDER BY j2.priority ASC, j2.requested_at ASC
      FOR UPDATE SKIP LOCKED LIMIT 1)
  RETURNING * INTO j;
  IF NOT FOUND THEN RETURN jsonb_build_object('job', null); END IF;

  SELECT * INTO t  FROM public.ai_job_types   WHERE job_type    = j.job_type;
  SELECT * INTO mc FROM public.ai_model_config WHERE feature_key = j.job_type AND is_active;

  -- ai_job_types wins ONLY when it carries both provider AND model_id (mirrors getModelForFeature).
  v_use_reg  := (t.provider IS NOT NULL AND t.model_id IS NOT NULL);
  v_provider := CASE WHEN v_use_reg THEN t.provider ELSE mc.provider END;
  v_model_id := CASE WHEN v_use_reg THEN t.model_id ELSE mc.model_id END;

  -- Feature A: per-job model OVERRIDE from the payload (anthropic-only; never for
  -- safety-judge jobs). Lets the auto-compare replay run the OLD model on a job's
  -- exact input. Behavior-preserving when _model_override is absent.
  v_ovr := j.payload -> '_model_override';
  IF v_ovr IS NOT NULL
     AND jsonb_typeof(v_ovr) = 'object'
     AND j.job_type NOT IN ('scf.note_safety_judge','scf.judge_help_ask','bug.reverify') THEN
    v_ovr_provider := nullif(trim(coalesce(v_ovr->>'provider','')), '');
    v_ovr_model    := nullif(trim(coalesce(v_ovr->>'model_id','')), '');
    IF v_ovr_model IS NOT NULL
       AND lower(coalesce(v_ovr_provider, 'anthropic')) = 'anthropic' THEN
      v_provider := 'anthropic';
      v_model_id := v_ovr_model;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'job', jsonb_build_object('id', j.id, 'job_type', j.job_type, 'payload', j.payload,
                              'requested_by', j.requested_by, 'lane', j.lane),
    'spec', jsonb_build_object(
              'prompt_template',   t.prompt_template,
              'tool_set',          t.tool_set,
              'output_target',     t.output_target,
              'interactive',       t.interactive,
              'provider',          v_provider,
              'model_id',          v_model_id,
              'fallback_provider', CASE WHEN v_use_reg THEN t.fallback_provider ELSE mc.fallback_provider END,
              'fallback_model_id', CASE WHEN v_use_reg THEN t.fallback_model_id ELSE mc.fallback_model_id END));
END;
$function$;

-- Re-assert the lock (CI secdef-anon gate treats CREATE OR REPLACE as new).
-- Current grants: postgres (owner) + service_role only — replicate exactly.
REVOKE EXECUTE ON FUNCTION public.fn_ai_claim(text,text,boolean) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_claim(text,text,boolean) TO service_role;

COMMIT;

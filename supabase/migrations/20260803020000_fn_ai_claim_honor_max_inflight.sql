-- fn_ai_claim honors ai_job_types.max_inflight (dormant-bug fix, multi-worker prep).
--
-- DORMANT BUG (memory: reference_fn_ai_claim_ignores_max_inflight_dormant):
-- ai_job_types.max_inflight is the per-job-type concurrency cap, but fn_ai_claim
-- never read it — it handed out the next pending job regardless of how many jobs
-- of that type were already claimed/running. Harmless today (ONE Windows box
-- runner, strictly sequential: claim → run → complete/fail → claim), fatal with
-- 2+ workers: N runners would happily run N jobs of a cap-1 type at once. This
-- migration makes the cap real so adding a second worker later is one switch,
-- not a debugging session. The lane stays single-worker after this ships.
--
-- WHAT CHANGES (vs 20260731130003, the previous definition — body otherwise
-- reproduced verbatim; the model-override logic is untouched):
--  1. The claim SELECT skips any candidate job whose type is at/over its
--     max_inflight, where "in-flight" = status IN ('claimed','running') — the
--     exact active set fn_ai_complete / fn_ai_fail / fn_ai_requeue_stale use.
--     (NOT 'pending': counting queued rows against the cap would deadlock the
--     queue. fn_ai_enqueue's per-requester cap counts pending on purpose —
--     that one bounds queue depth per person; this one bounds concurrency.)
--     A capped type is SKIPPED, not blocking: the next eligible job of another
--     type is claimed instead.
--  2. NULL max_inflight = unlimited (column is NOT NULL DEFAULT 3 today, so no
--     current row changes behavior; the guard is for a future relaxation).
--     max_inflight = 0 would mean "never claim this type" — a sensible pause
--     semantic; today impossible (fn_ai_job_type_upsert clamps to >= 1).
--  3. Race safety for CONCURRENT claimers: FOR UPDATE SKIP LOCKED (kept) locks
--     rows, but the in-flight count runs on the statement snapshot — two
--     simultaneous claim calls could each count cap-1 and both claim, breaching
--     the cap by one. A transaction-scoped advisory lock serializes claim
--     calls so each caller's count sees every prior committed claim (same
--     idiom fn_ai_enqueue already uses for its atomic cap check). Claims are
--     millisecond-scale, job runs are seconds-to-minutes, so serializing
--     claims costs nothing at 2-5 workers.
--
-- SINGLE-WORKER EQUIVALENCE (why this is safe to apply while nothing scales):
-- with one sequential runner, at claim time every type's claimed+running count
-- is 0 — the previous job was completed or failed before the next claim — and
-- every registry row has max_inflight >= 1, so the new predicate is always
-- true and the claim choice is identical to the old body. The generic drain
-- and the chat drain are the only two claim paths and they serve DISJOINT type
-- sets (COALESCE(t2.interactive,false) = p_interactive), so per-type counts
-- never cross between them. The only divergence window is crash-stranded
-- claimed/running rows, which fn_ai_requeue_stale (ai-tasks-sweep cron) clears;
-- interactive types are exempt from that requeue by design, so a crash-stranded
-- interactive job holds its cap slot until manually reset — acceptable, and
-- exactly what the cap is supposed to mean.
--
-- Signature (p_lane text, p_runner text, p_interactive boolean) UNCHANGED —
-- out-of-repo box runners (~/jkkn-max-lane drains) call by these named params
-- and need zero changes. Return shape unchanged. Grants unchanged.

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
  -- Serialize claim calls so the in-flight count below is race-safe: without
  -- this, two concurrent claimers each count cap-1 committed in-flight jobs
  -- and both claim, breaching max_inflight by one. Transaction-scoped (auto-
  -- released), same idiom as fn_ai_enqueue's atomic cap gate.
  PERFORM pg_advisory_xact_lock(hashtext('ai_jobs:claim'));

  UPDATE public.ai_jobs SET status='claimed', claimed_by=p_runner, claimed_at=now()
   WHERE id = (
     SELECT j2.id FROM public.ai_jobs j2
       JOIN public.ai_job_types t2 ON t2.job_type = j2.job_type
      WHERE j2.status='pending'
        AND (p_lane IS NULL OR j2.lane = p_lane)
        AND COALESCE(t2.interactive, false) = p_interactive
        -- max_inflight gate: skip (not block) any type at/over its cap.
        -- In-flight = claimed|running (the fn_ai_complete/fn_ai_fail active
        -- set). NULL cap = unlimited. Single worker: count is always 0 here,
        -- so behavior is identical to the pre-cap body.
        AND (t2.max_inflight IS NULL
             OR (SELECT count(*) FROM public.ai_jobs jf
                  WHERE jf.job_type = j2.job_type
                    AND jf.status IN ('claimed','running')) < t2.max_inflight)
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
-- Current grants: postgres (owner) + service_role only — replicated exactly
-- from 20260731130003.
REVOKE EXECUTE ON FUNCTION public.fn_ai_claim(text,text,boolean) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_claim(text,text,boolean) TO service_role;

COMMIT;

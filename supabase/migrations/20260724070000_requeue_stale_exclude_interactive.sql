-- Migration: 2026-07-24 — fn_ai_requeue_stale excludes interactive job types
-- ---------------------------------------------------------------------------
-- Reason: fn_ai_requeue_stale (the Max-lane stale-job reclaim) is about to be
-- wired into the ai-tasks-sweep cron so orphaned claimed/running jobs auto-
-- recover instead of stranding forever (a job stuck in 'claimed' since a runner
-- died between claim and completion). Today the RPC has ZERO callers, so this
-- refinement is behavior-preserving until the cron ships.
--
-- The one correctness guard the base RPC lacks: it would reset ANY stale
-- claimed/running job — including the 2 interactive (chat) Max-lane job types.
-- A live chat turn claimed mid-conversation must NEVER be requeued. This adds a
-- NOT EXISTS(interactive job_type) guard to BOTH the terminal-fail branch and
-- the requeue branch, mirroring fn_ai_claim's interactive/batch lane split. A
-- missing or non-interactive job_type row → not excluded (reclaimed normally),
-- so only known-interactive jobs are protected.
--
-- Cron/system-only SECURITY DEFINER fn → REVOKE anon, authenticated, PUBLIC;
-- GRANT service_role (matches the original 20260712201500 grant shape).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_ai_requeue_stale(p_timeout_seconds integer DEFAULT 300, p_max_attempts integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
DECLARE v_requeued int; v_failed int;
BEGIN
  -- Terminally fail jobs that have exhausted their attempts. Skip interactive
  -- (chat) job types — a live conversation is never auto-failed.
  UPDATE public.ai_jobs j SET status='error', error='stale: runner did not finish in time', completed_at=now()
   WHERE j.status IN ('claimed','running')
     AND j.claimed_at < now() - make_interval(secs => p_timeout_seconds)
     AND j.attempts >= p_max_attempts
     AND NOT EXISTS (
       SELECT 1 FROM public.ai_job_types t
        WHERE t.job_type = j.job_type AND t.interactive IS TRUE);
  GET DIAGNOSTICS v_failed = ROW_COUNT;

  -- Requeue jobs that still have attempts left. Skip interactive job types.
  UPDATE public.ai_jobs j SET status='pending', claimed_by=NULL, claimed_at=NULL, attempts=attempts+1
   WHERE j.status IN ('claimed','running')
     AND j.claimed_at < now() - make_interval(secs => p_timeout_seconds)
     AND j.attempts < p_max_attempts
     AND NOT EXISTS (
       SELECT 1 FROM public.ai_job_types t
        WHERE t.job_type = j.job_type AND t.interactive IS TRUE);
  GET DIAGNOSTICS v_requeued = ROW_COUNT;

  RETURN jsonb_build_object('requeued', v_requeued, 'failed', v_failed);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_requeue_stale(integer, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_requeue_stale(integer, integer) TO service_role;

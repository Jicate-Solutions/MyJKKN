-- Migration: AI-Query chat cutover — scoped ai_jobs path
-- Date: 2026-07-12
-- Part of moving the AI Assistant chat off the UNSCOPED max_lane_chat_requests
-- runner (service-role, every college) onto the per-user-scoped ai_jobs lane.
--
-- This migration provides the DB pieces the route + the scoped Windows chat drain
-- need. It is ADDITIVE and safe to apply live: the interactive-claim filter
-- defaults to FALSE so the existing generic drain keeps working unchanged and
-- simply stops being able to grab interactive (chat) jobs; the inbox/ack/cancel
-- RPCs are brand new. ai_query.chat stays enabled=false until the scoped chat
-- drain is confirmed live, so nothing user-facing changes on apply.

-- ---------------------------------------------------------------------------
-- 1) Interactive-claim gap fix.
--    fn_ai_claim previously handed back ANY pending job in the lane, so a
--    continuous generic drain would claim-and-fail an interactive chat job
--    (no release RPC; the user can't re-enqueue). Add an `interactive` filter
--    that DEFAULTS to false, so:
--      - the generic drain (fn_ai_claim('max','runner'))  -> non-interactive only
--      - the scoped chat drain (fn_ai_claim('max','runner', true)) -> chat only
--    Safe-by-default: a drain must EXPLICITLY ask for interactive work.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_ai_claim(text, text);

CREATE OR REPLACE FUNCTION public.fn_ai_claim(
  p_lane text DEFAULT NULL::text,
  p_runner text DEFAULT 'unknown'::text,
  p_interactive boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
DECLARE j public.ai_jobs%ROWTYPE; t public.ai_job_types%ROWTYPE;
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
  SELECT * INTO t FROM public.ai_job_types WHERE job_type = j.job_type;
  -- hand the runner everything it needs to execute from data alone
  RETURN jsonb_build_object(
    'job', jsonb_build_object('id', j.id, 'job_type', j.job_type, 'payload', j.payload,
                              'requested_by', j.requested_by, 'lane', j.lane),
    'spec', jsonb_build_object('prompt_template', t.prompt_template, 'tool_set', t.tool_set,
                               'output_target', t.output_target, 'interactive', t.interactive));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_claim(text, text, boolean) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_claim(text, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) fn_ai_job_status already returns {status,result,error,job_type,completed_at}
--    scoped to auth.uid() — the route polls it directly (result->>'answer').
--    No change needed here.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3) fn_ai_chat_inbox() — the "while you were away" inbox for the AI Assistant.
--    Finished, still-undelivered jobs the CALLER requested whose type routes to
--    the inbox (output_target='inbox'), answer pulled from result->>'answer'.
--    Mirrors fn_max_chat_inbox on the ai_jobs table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_chat_inbox()
 RETURNS TABLE(id uuid, message text, answer text, completed_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT j.id,
         j.payload->>'message'  AS message,
         j.result->>'answer'    AS answer,
         j.completed_at
    FROM public.ai_jobs j
    JOIN public.ai_job_types t ON t.job_type = j.job_type
   WHERE j.requested_by = auth.uid()
     AND j.status = 'done'
     AND j.delivered_at IS NULL
     AND t.output_target = 'inbox'
     AND j.completed_at > now() - interval '24 hours'
     AND COALESCE(btrim(j.result->>'answer'), '') <> ''
   ORDER BY j.completed_at
   LIMIT 20;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_chat_inbox() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_chat_inbox() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) fn_ai_job_ack(uuid[]) — stamp delivered_at once answers are on screen.
--    Requester-scoped, idempotent. Mirrors fn_max_chat_ack on ai_jobs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_job_ack(p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.ai_jobs
     SET delivered_at = now()
   WHERE id = ANY(p_ids)
     AND requested_by = auth.uid()
     AND delivered_at IS NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_job_ack(uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_ack(uuid[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) fn_ai_job_cancel(uuid) — requester abandons a still-unfinished question.
--    Sets status='canceled' so it (a) frees the in-flight slot and (b) is NOT
--    counted by the daily cap (fn_ai_enqueue counts status <> 'canceled').
--    Requester-scoped. Mirrors fn_max_chat_cancel on ai_jobs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_job_cancel(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.ai_jobs
     SET status='canceled', completed_at=now(),
         error=COALESCE(error,'abandoned by requester')
   WHERE id = p_job_id
     AND requested_by = auth.uid()
     AND status IN ('pending','claimed','running');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_job_cancel(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_cancel(uuid) TO authenticated, service_role;

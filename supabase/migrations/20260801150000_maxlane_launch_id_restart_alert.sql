-- 20260801150000_maxlane_launch_id_restart_alert.sql
-- Max-lane restart alerts — CLOUD slice.
--
-- WHY: The Max-lane drains are now self-healing (auto-restart on crash ~1 min;
-- reboot-proof via auto-login). That closed the "box stays dead" gap but opened a
-- VISIBILITY gap: a box can reboot, or a drain can crash-and-recover, and the
-- existing runnerDownHealthCheck (10-min stale window) never fires — a ~1-min
-- crash-restart or ~2-min reboot slips under it. A box rebooting nightly (failing
-- hardware / bad update loop) would silently self-heal forever, unseen.
--
-- WHAT: give each heartbeat a per-process "launch id". A box drain computes it once
-- at process start (process-start epoch seconds) and passes it on every heartbeat.
-- The */15 ai-tasks-sweep cron reads it and, when it CHANGES, alerts the Director
-- once per (runner, launch id) — so a steady box is silent and every restart is
-- surfaced exactly once (dedup via the notifications.idempotency_key UNIQUE index;
-- no ack table needed).
--
-- This migration is the CLOUD slice: (1) a launch_id column to carry the value,
-- (2) extend fn_ai_routine_record_fire to accept + store it. The BOX slice (drains
-- pass the 3rd arg) ships off-repo. The ROUTE slice (the compare/notify step) is in
-- app/api/cron/ai-tasks-sweep/route.ts in the same PR.
--
-- SIGNATURE CHANGE: the RPC goes (text,text) -> (text,text,text DEFAULT NULL). We
-- DROP the 2-arg overload and CREATE the 3-arg version rather than adding a
-- defaulted param alongside it — otherwise a 2-arg call would be AMBIGUOUS between
-- the two functions (Postgres 42725, "function is not unique"). With only the
-- 3-arg-default fn present, the sole existing 2-arg caller (ai-routine-dispatcher,
-- named args p_routine_id/p_status) resolves cleanly via the default. Backward-
-- compatible; the DROP+CREATE runs in one migration transaction so there is no
-- window where the heartbeat writer is missing.
--
-- SECDEF anon-lock: CREATE OR REPLACE / CREATE of a SECDEF fn re-opens anon EXECUTE
-- via Supabase's default `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO
-- anon`, so we re-assert the REVOKE explicitly (mandatory rule + secdef-anon-revoke
-- CI gate). Cron/system-only writer → service_role only (NOT authenticated).

-- 1) Carrier column: the CURRENT launch id of the process that last stamped the
--    heartbeat. NULL until a box drain starts passing it (safe: the route step
--    skips NULL launch ids, so nothing alerts during the pre-box-update window).
ALTER TABLE public.ai_routine_schedules
  ADD COLUMN IF NOT EXISTS launch_id text;

COMMENT ON COLUMN public.ai_routine_schedules.launch_id IS
  'Per-process launch id (process-start epoch seconds) of the runner that last stamped this heartbeat, written via fn_ai_routine_record_fire''s 3rd arg (box drains). A change vs the last-alerted value = the runner restarted; ai-tasks-sweep alerts once per (runner, launch_id). NULL for cloud-lane routines and until a box drain passes it.';

-- 2) Extend the heartbeat writer to carry launch_id. DROP the 2-arg overload first
--    (see header: avoids 42725 ambiguity), then CREATE the 3-arg version. Body is
--    the LIVE 2-arg body verbatim + the launch_id write; the run-log sub-block is
--    unchanged (still best-effort, still 7-day retention).
DROP FUNCTION IF EXISTS public.fn_ai_routine_record_fire(text, text);

CREATE OR REPLACE FUNCTION public.fn_ai_routine_record_fire(
  p_routine_id text,
  p_status text,
  p_launch_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ai_routine_schedules
     SET last_status = left(p_status, 200),
         -- Keep the prior launch id when the caller omits it: cloud-lane 2-arg
         -- callers pass NULL via the default, and COALESCE preserves the column
         -- rather than wiping it. Box drains always pass their current id, so it
         -- only changes on an actual restart.
         launch_id = COALESCE(p_launch_id, launch_id),
         updated_at = now()
   WHERE routine_id = p_routine_id;

  -- Append-only run log (cloud dispatcher lane). Best-effort: a logging failure
  -- must not fail the tick, so swallow any error from this sub-block only.
  BEGIN
    INSERT INTO public.ai_routine_run_log (routine_id, lane, status)
    VALUES (
      p_routine_id,
      CASE WHEN p_routine_id LIKE 'maxlane:%' THEN 'max' ELSE 'cloud' END,
      left(p_status, 200)
    );
    -- rolling 7-day retention, scoped to this routine (cheap, indexed)
    DELETE FROM public.ai_routine_run_log
     WHERE routine_id = p_routine_id
       AND fired_at < now() - interval '7 days';
  EXCEPTION WHEN OTHERS THEN
    NULL; -- logging is best-effort; the dispatcher tick must not fail on it
  END;
END;
$function$;

-- 3) Re-assert the SECDEF lockdown on the NEW 3-arg signature (mirrors the 2-arg
--    grants that were on the live function: service_role only).
REVOKE EXECUTE ON FUNCTION public.fn_ai_routine_record_fire(text, text, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_routine_record_fire(text, text, text) TO service_role;

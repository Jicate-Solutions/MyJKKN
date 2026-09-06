-- ============================================================================
-- Migration: ai_routine_run_log — the dispatcher lane's append-only run log
-- Date: 2026-07-13
-- ============================================================================
-- Why:
--   The dispatcher lane (ai_routine_schedules) keeps only ONE timestamp per
--   routine — last_fired_at — so the Loop Tower's EXECUTION ring could only ever
--   show "routines whose LATEST fire is in the 7d window", never a true run
--   count. This table is the dispatcher's append-only run log: one row per fire.
--   (The async jobs lane is already logged per-job in ai_jobs, PR #1998; the Max
--   lane in max_lane_requests. This closes the dispatcher lane, the last
--   uninstrumented lane except static vercel crons.)
--
-- Security (Supabase default-privileges "twin trap"):
--   RLS ON + zero policies denies anon/authenticated at the row layer, but
--   Supabase's ALTER DEFAULT PRIVILEGES grants anon+authenticated a DIRECT table
--   grant on every new table — a separate axis from RLS. A service-role-only run
--   log must therefore ALSO explicitly REVOKE ALL from anon, authenticated and
--   PUBLIC, then GRANT to service_role. The Loop Tower reads it via the
--   service-role client on a super-admin-gated page.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_routine_run_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id text        NOT NULL,
  fired_at   timestamptz NOT NULL DEFAULT now(),
  status     text
);

COMMENT ON TABLE public.ai_routine_run_log IS
  'Append-only run log for the dispatcher lane — one row per routine fire, written best-effort by fn_ai_routine_record_fire. Service-role only. Powers the Loop Tower EXECUTION ring true run counts (logging since 2026-07-13).';

ALTER TABLE public.ai_routine_run_log ENABLE ROW LEVEL SECURITY;

-- Deny-all to anon/authenticated/PUBLIC at BOTH axes: RLS on with no policies,
-- AND an explicit REVOKE that overrides Supabase's default anon/authenticated
-- table grants. Only service_role (and the table owner) may touch it.
REVOKE ALL ON TABLE public.ai_routine_run_log FROM anon, authenticated, PUBLIC;
GRANT  ALL ON TABLE public.ai_routine_run_log TO service_role;

-- Read path 1: latest N fires for a given routine (routine drill-down).
CREATE INDEX IF NOT EXISTS idx_ai_routine_run_log_routine_fired
  ON public.ai_routine_run_log (routine_id, fired_at DESC);
-- Read path 2: all fires in a time window across routines (the Tower's 7d count).
CREATE INDEX IF NOT EXISTS idx_ai_routine_run_log_fired
  ON public.ai_routine_run_log (fired_at DESC);

-- ── Extend the dispatcher's record-fire hook ────────────────────────────────
-- The hook currently only UPDATEs ai_routine_schedules.last_status. Extend it to
-- ALSO append a run-log row. The INSERT is wrapped in its own sub-block so a
-- logging failure can NEVER fail the dispatcher tick — the last_status UPDATE
-- remains the primary, load-bearing effect. (CREATE OR REPLACE preserves the
-- existing ACL: EXECUTE stays granted only to postgres + service_role, never
-- anon/authenticated. Re-asserted below as an audit-trail signal.)
CREATE OR REPLACE FUNCTION public.fn_ai_routine_record_fire(p_routine_id text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ai_routine_schedules
     SET last_status = left(p_status, 200), updated_at = now()
   WHERE routine_id = p_routine_id;

  -- Append-only run log (dispatcher lane). Best-effort: a logging failure must
  -- not fail the tick, so swallow any error from this sub-block only.
  BEGIN
    INSERT INTO public.ai_routine_run_log (routine_id, status)
    VALUES (p_routine_id, left(p_status, 200));
  EXCEPTION WHEN OTHERS THEN
    NULL; -- logging is best-effort; the dispatcher tick must not fail on it
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_routine_record_fire(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_routine_record_fire(text, text) TO service_role;

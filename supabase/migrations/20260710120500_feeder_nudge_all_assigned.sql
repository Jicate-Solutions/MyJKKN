-- ============================================================================
-- 20260710120500_feeder_nudge_all_assigned.sql
-- ⚠️ ALREADY APPLIED TO PROD 2026-07-10 via the Management API — this migration
--    RECORDS production so the repo is not amnesiac. Idempotent (CREATE OR
--    REPLACE + re-asserted ACLs); safe to re-run.
--
-- Director decision 2026-07-10: the daily schools-network visit nudge goes to
-- ALL assigned schools, not only slipping/overdue ones. Previously the fn
-- filtered candidates to `nudge_eligible` (cycle_delta < 0 OR last visit 60+
-- days ago), so a coordinator with an assigned-but-healthy school never got a
-- nudge and the assignment silently idled. The rewrite drops that filter and
-- instead CLASSIFIES each candidate (slipping_and_overdue / slipping /
-- assigned) so the cron route can still prioritise message text and priority.
--
-- Unchanged safety rails: skips done schools (logged visit + follow-up
-- contribution) and schools nudged within the realert window
-- (last_nudged_at < now() - p_realert_days).
--
-- Fired live 2026-07-10 ~09:43 IST: 74/74 assignments nudged (74 notifications
-- + 74 user_notifications fanout rows to 46 coordinators), all stamped.
--
-- NOTE for a future PR (route change, needs deploy — NOT part of this record):
-- app/api/schools-network/visit-nudges/cron/route.ts `bodyFor()` predates the
-- new 'assigned' reason and falls through to the "no visit in 60+ days" text
-- for those schools even when a recent visit exists.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_schools_network_nudge_candidates(p_realert_days integer DEFAULT 7)
 RETURNS TABLE(school_id uuid, school_name text, assigned_to uuid, cycle_delta bigint, last_visit timestamp with time zone, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Director 2026-07-10: nudge ALL assigned schools (not just slipping/overdue).
  -- Dropped the `nudge_eligible` filter; still skips done + recently-nudged.
  RETURN QUERY
  SELECT c.school_id, c.school_name, c.assigned_to, c.cycle_delta, c.last_visit,
         CASE
           WHEN COALESCE(c.cycle_delta,0) < 0 AND (c.last_visit IS NULL OR c.last_visit < now() - interval '60 days') THEN 'slipping_and_overdue'
           WHEN COALESCE(c.cycle_delta,0) < 0 THEN 'slipping'
           ELSE 'assigned'
         END AS reason
    FROM public.fn_schools_network_visit_worklist_core() c
   WHERE c.assigned_to IS NOT NULL
     AND NOT c.is_done
     AND (c.last_nudged_at IS NULL OR c.last_nudged_at < now() - make_interval(days => greatest(1, p_realert_days)));
END;
$function$;

-- ACL re-assert: CREATE OR REPLACE preserves existing grants, but re-assert so
-- this record is self-contained (Supabase default privileges grant anon
-- EXECUTE separately from PUBLIC — both must be revoked explicitly).
REVOKE EXECUTE ON FUNCTION public.fn_schools_network_nudge_candidates(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_nudge_candidates(integer) TO authenticated, service_role;

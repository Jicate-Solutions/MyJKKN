-- Updated: 2026-10-07 - v_session_feedback_pending_ingest: service role only.
--
-- Review follow-up to #4172 (20261021000100). That migration granted SELECT on
-- the pending-ingest view to `authenticated`; on production the role actually
-- holds every table privilege on it (INSERT, UPDATE, DELETE included), because
-- the view is a single-table anti-join and so auto-updatable. It is not a leak:
-- the view is security_invoker, so session_feedback's own row rules still
-- decide what a caller sees or writes. But nothing signed-in reads it. Its only
-- reader is the feedback-adapter-session cron, through the service-role client.
-- An unused door is closed rather than left to be reasoned about later.

REVOKE ALL ON public.v_session_feedback_pending_ingest FROM anon, authenticated, PUBLIC;
-- service_role holds every privilege by Supabase default; leave it read-only.
REVOKE ALL ON public.v_session_feedback_pending_ingest FROM service_role;
GRANT SELECT ON public.v_session_feedback_pending_ingest TO service_role;

-- Apply-time check: refuse to finish if the grants did not land as intended.
DO $assert$
BEGIN
  IF has_table_privilege('anon', 'public.v_session_feedback_pending_ingest', 'SELECT')
     OR has_table_privilege('anon', 'public.v_session_feedback_pending_ingest', 'INSERT')
     OR has_table_privilege('anon', 'public.v_session_feedback_pending_ingest', 'UPDATE')
     OR has_table_privilege('anon', 'public.v_session_feedback_pending_ingest', 'DELETE')
     OR has_table_privilege('authenticated', 'public.v_session_feedback_pending_ingest', 'SELECT')
     OR has_table_privilege('authenticated', 'public.v_session_feedback_pending_ingest', 'INSERT')
     OR has_table_privilege('authenticated', 'public.v_session_feedback_pending_ingest', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.v_session_feedback_pending_ingest', 'DELETE') THEN
    RAISE EXCEPTION 'v_session_feedback_pending_ingest: anon or authenticated still holds a privilege';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.v_session_feedback_pending_ingest', 'SELECT') THEN
    RAISE EXCEPTION 'v_session_feedback_pending_ingest: service_role lost SELECT';
  END IF;
END
$assert$;

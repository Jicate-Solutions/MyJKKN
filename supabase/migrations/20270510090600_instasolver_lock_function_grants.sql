-- =============================================================================
-- InstaSolver — lock the function grants the CI definer gate asked about
-- (2026-10-03)
--
-- Supabase's default privileges grant EXECUTE on every new function to anon
-- AND authenticated, on top of PostgreSQL's PUBLIC grant. Two things were left
-- callable that nobody should call directly:
--
--   · instasolver_cao_user_ids — only the notification fan-out (a SECURITY
--     DEFINER trigger, running as the owner) needs it. A signed-in user could
--     otherwise list every CAO's profile id.
--   · the trigger functions — PostgREST cannot invoke a RETURNS trigger
--     function and PostgreSQL does not check EXECUTE when a trigger fires, so
--     revoking changes nothing for the triggers; it just removes the grant.
--
-- service_role keeps its own EXECUTE, so operator and server paths are
-- unaffected.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.instasolver_cao_user_ids() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.instasolver_before_insert_submission() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.instasolver_issues_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.instasolver_requirements_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.instasolver_log_issue_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.instasolver_log_requirement_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.instasolver_log_note_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.instasolver_notify_on_activity() FROM PUBLIC, anon, authenticated;

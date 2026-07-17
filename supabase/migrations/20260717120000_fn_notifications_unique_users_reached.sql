-- =====================================================================================
-- Exact distinct-user count for the notifications stats card
-- (/api/admin/notifications/stats -> target_users / uniqueUsersReached).
-- SECURITY DEFINER: notifications.view holders cannot read the full
-- user_notifications fan-out under RLS, and PostgREST has no COUNT(DISTINCT).
-- Discloses ONLY an aggregate bigint (no user identities), matching the
-- fn_role_user_counts precedent. Grant: authenticated only; anon explicitly revoked
-- (Supabase default GRANTs anon EXECUTE on new functions).
-- Suggested filename: supabase/migrations/20260717120000_fn_notifications_unique_users_reached.sql
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.fn_notifications_unique_users_reached()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT user_id)::bigint
  FROM public.user_notifications;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_notifications_unique_users_reached() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_notifications_unique_users_reached() TO authenticated;
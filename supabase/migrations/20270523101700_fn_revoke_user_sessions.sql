-- =============================================================================
-- fn_revoke_user_sessions — "Sign out of all devices" for an admin, on any account
-- Added: 2026-10-01 — Director ruling (1 Oct 2026): logins last forever on the
-- installed app; the safety net for a lost or shared phone is a "sign out
-- everywhere" button — one for each person on their own account (that one uses
-- supabase.auth.signOut({ scope: 'global' }) and needs no SQL), and one for
-- admins on anyone's account (this function).
--
-- WHY A DATABASE FUNCTION AND NOT THE AUTH ADMIN API
--   @supabase/auth-js 2.75.0 GoTrueAdminApi.signOut(jwt, scope) needs the
--   TARGET's own access token (it POSTs /logout with that token). There is no
--   "sign out user <id>" endpoint, so an admin cannot end someone else's
--   sessions through the API. Deleting the person's rows in auth.sessions and
--   auth.refresh_tokens is what /logout?scope=global does server-side.
--
-- WHAT THE PERSON EXPERIENCES
--   Every refresh token is gone, so no device can renew its login. A device
--   that loads a page is refused by proxy.ts (getUser() asks the Auth server,
--   which rejects a token whose session no longer exists) once its 60-second
--   token-validation cache entry lapses. A page that is ALREADY open keeps
--   reading data until its current access token expires (the project's JWT
--   expiry, normally one hour), then it is signed out.
--
-- WHO MAY CALL IT
--   auth.uid() is the caller (called through the caller's own session, never a
--   service-role client). Allowed: is_super_admin(), or a role holding
--   users.sessions.revoke. is_admin() is deliberately NOT a bypass: the key is
--   granted only by ticking it in Role Management. A caller who is not a super
--   admin may not sign out a super admin. COALESCE on both checks so a caller
--   with no role (NULL) is refused, not waved through.
--
-- FILE ONLY — applied by the ship wave at merge time, never by hand.
-- =============================================================================

DO $$
BEGIN
  -- Precondition: the role applying this migration (which becomes the
  -- function owner) must be able to delete from the Auth tables. If it cannot,
  -- fail the apply loudly instead of shipping a function that errors 42501
  -- every time an admin presses the button.
  IF NOT has_table_privilege('auth.sessions', 'DELETE')
     OR NOT has_table_privilege('auth.refresh_tokens', 'DELETE') THEN
    RAISE EXCEPTION 'fn_revoke_user_sessions: applying role % cannot DELETE from auth.sessions / auth.refresh_tokens', current_user;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.fn_revoke_user_sessions(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_is_super boolean;
  v_target_exists boolean;
  v_target_is_super boolean;
  v_sessions integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'missing_user' USING ERRCODE = '22004';
  END IF;

  v_caller_is_super := COALESCE(public.is_super_admin(), false);

  IF NOT (v_caller_is_super
          OR COALESCE(public.user_has_permission('users.sessions.revoke'), false)) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT true, COALESCE(p.is_super_admin, false)
    INTO v_target_exists, v_target_is_super
    FROM public.profiles p
   WHERE p.id = p_user_id;

  IF NOT COALESCE(v_target_exists, false) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_is_super AND NOT v_caller_is_super THEN
    RAISE EXCEPTION 'cannot_revoke_super_admin' USING ERRCODE = '42501';
  END IF;

  -- Refresh tokens first (explicitly, not relying on the session FK cascade),
  -- then the sessions themselves.
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;

  WITH removed AS (
    DELETE FROM auth.sessions WHERE user_id = p_user_id RETURNING 1
  )
  SELECT count(*)::integer INTO v_sessions FROM removed;

  RETURN v_sessions;
END;
$$;

COMMENT ON FUNCTION public.fn_revoke_user_sessions(uuid) IS
  'Sign a person out of every device (deletes their auth sessions and refresh tokens). Super admin or users.sessions.revoke; a non-super-admin cannot target a super admin. Returns the number of sessions ended. Director ruling 2026-10-01.';

REVOKE EXECUTE ON FUNCTION public.fn_revoke_user_sessions(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_revoke_user_sessions(uuid) TO authenticated;

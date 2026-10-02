-- =============================================================================
-- fn_revoke_user_sessions — "Sign out of all devices" for an admin, on any account
-- Added: 2026-10-01 — Director ruling (1 Oct 2026): logins last forever on the
-- installed app; the safety net for a lost or shared phone is a "sign out
-- everywhere" button — one for each person on their own account (that one uses
-- supabase.auth.signOut({ scope: 'global' }) and needs no SQL), and one for
-- admins on anyone's account (this function).
-- Updated: 2026-10-02 — repair round: the apply-time precondition (a DO block
-- that RAISEd) is gone; the checks now run at call time (see below).
--
-- WHY A DATABASE FUNCTION AND NOT THE AUTH ADMIN API
--   @supabase/auth-js 2.75.0 GoTrueAdminApi.signOut(jwt, scope) needs the
--   TARGET's own access token (it POSTs /logout with that token). There is no
--   "sign out user <id>" endpoint. Checked in the Auth server source
--   (supabase/auth internal/api/admin.go + internal/models/user.go):
--   updateUserById({ ban_duration }) only sets banned_until and does NOT end
--   sessions, so "ban then lift" would leave every device signed in; an admin
--   password change does end sessions but would destroy the person's password.
--   Deleting the person's rows in auth.sessions and auth.refresh_tokens is
--   what /logout?scope=global does server-side.
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
--   service-role client). Allowed: is_super_admin() (the profiles.is_super_admin
--   FLAG — the same test user_has_permission(text) and every RLS policy use),
--   or a role holding users.sessions.revoke. is_admin() is deliberately NOT a
--   bypass: the key is granted only by ticking it in Role Management. A caller
--   who is not a super admin may not sign out a super admin. COALESCE on both
--   checks so a caller with no role (NULL) is refused, not waved through.
--
-- IF THE DATABASE CANNOT DO IT
--   No apply-time precondition: a RAISE at apply time would fail the ship
--   wave's BEGIN…ROLLBACK dry-run and freeze every PR behind this one. Instead,
--   at CALL time and before deleting anything, the function checks that its
--   owner may DELETE from both Auth tables and that row security cannot hide
--   their rows. If not, it raises 'revoke_unavailable' and the screen says so —
--   never a false "nobody was signed in". After deleting it re-checks that none
--   of the person's rows remain ('revoke_incomplete', which rolls the call back).
--
-- DESTRUCTIVE-FLAGGED — needs the Director's explicit allow at merge time.
--   The function body contains DELETE FROM auth.refresh_tokens / auth.sessions,
--   so scripts/ship-wave/apply-migrations.sh step 3 refuses this file unless the
--   Director, after review, writes 20270523101700 into $STATE/allow-destructive.
--   Merging without that allow freezes the wave. FILE ONLY until then.
-- =============================================================================

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
  v_sessions_rel regclass := to_regclass('auth.sessions');
  v_tokens_rel regclass := to_regclass('auth.refresh_tokens');
  v_rows_visible boolean;
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

  -- Can this function actually do it? current_user here is the function OWNER
  -- (SECURITY DEFINER), i.e. whoever applied the migration.
  IF v_sessions_rel IS NULL OR v_tokens_rel IS NULL THEN
    RAISE EXCEPTION 'revoke_unavailable: the auth session tables were not found'
      USING ERRCODE = '55000';
  END IF;

  IF NOT (COALESCE(has_table_privilege(v_sessions_rel, 'DELETE'), false)
          AND COALESCE(has_table_privilege(v_tokens_rel, 'DELETE'), false)) THEN
    RAISE EXCEPTION 'revoke_unavailable: role % may not delete auth sessions', current_user
      USING ERRCODE = '55000';
  END IF;

  -- Row security would make the deletes below remove 0 rows without an error,
  -- which the screen would then report as "no active logins". Rows are visible
  -- when the table has no RLS, or the owner role is a superuser or bypasses RLS,
  -- or the owner role owns the table and RLS is not FORCEd.
  SELECT bool_and(
           NOT c.relrowsecurity
           OR r.rolsuper
           OR r.rolbypassrls
           OR (pg_has_role(current_user, c.relowner, 'USAGE') AND NOT c.relforcerowsecurity)
         )
    INTO v_rows_visible
    FROM pg_class c
   CROSS JOIN pg_roles r
   WHERE c.oid IN (v_sessions_rel, v_tokens_rel)
     AND r.rolname = current_user;

  IF NOT COALESCE(v_rows_visible, false) THEN
    RAISE EXCEPTION 'revoke_unavailable: row security hides auth sessions from role %', current_user
      USING ERRCODE = '55000';
  END IF;

  -- Refresh tokens first (explicitly, not relying on the session FK cascade),
  -- then the sessions themselves.
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;

  WITH removed AS (
    DELETE FROM auth.sessions WHERE user_id = p_user_id RETURNING 1
  )
  SELECT count(*)::integer INTO v_sessions FROM removed;

  -- Second line of defence: nothing of theirs may remain. Raising here rolls
  -- the whole call back, and the screen reports a failure, not a success.
  IF EXISTS (SELECT 1 FROM auth.sessions WHERE user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM auth.refresh_tokens WHERE user_id = p_user_id::text) THEN
    RAISE EXCEPTION 'revoke_incomplete' USING ERRCODE = '55000';
  END IF;

  RETURN v_sessions;
END;
$$;

COMMENT ON FUNCTION public.fn_revoke_user_sessions(uuid) IS
  'Sign a person out of every device (deletes their auth sessions and refresh tokens). Super admin (profiles.is_super_admin flag) or users.sessions.revoke; a non-super-admin cannot target a super admin. Refuses with revoke_unavailable when its owner cannot delete or cannot see the rows. Returns the number of sessions ended. Director ruling 2026-10-01.';

REVOKE EXECUTE ON FUNCTION public.fn_revoke_user_sessions(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_revoke_user_sessions(uuid) TO authenticated;

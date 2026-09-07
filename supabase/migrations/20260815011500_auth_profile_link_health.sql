-- ============================================================================
-- 2026-08-15 — Make the auth/profile link health check tell the truth
-- ============================================================================
--
-- WHY
--
-- `public.check_orphaned_auth_users()` is the platform's own health check for
-- "someone can sign in but has no profile". Its entire body was:
--
--     -- Since we can't access auth.users table, return empty result set
--     SELECT p.id, p.email, p.created_at FROM profiles p WHERE 1 = 0;
--
-- It always answered ZERO. So every consistency check ever run reported a
-- clean system, and the people it was meant to find were never found.
--
-- Measured on production 2026-08-15: 992 auth.users rows have no profiles row.
-- 978 of those have NEVER signed in (pre-created shells — harmless, they have
-- not hit anything). 14 HAVE signed in and therefore hit the wall:
--   · 8 of the 14 DO have a profile, under a DIFFERENT id, matching by email
--     — a broken identity link, against the documented invariant
--     auth.users.id == profiles.id. These are recoverable by relinking.
--   · 6 have no profile under any id.
-- 6 of the 14 signed in within the last 30 days; the most recent was today.
--
-- Those people are redirected to /auth/login?error=profile_load_failed by
-- proxy.ts and by two academic/attendance pages. The wording they see there is
-- corrected in the same change as this migration.
--
-- WHAT THIS DOES
--
-- Replaces the stub with a real query. `has_signed_in` is the column that
-- matters: it separates the 978 harmless never-signed-in shells from the 14
-- people actually being turned away. `profile_exists_by_email` separates the
-- recoverable link breaks from the genuinely profile-less.
--
-- SECURITY
--
-- Reading auth.users requires SECURITY DEFINER, so the function gates itself
-- on is_super_admin() OR is_admin() rather than relying on the caller. The
-- explicit REVOKE FROM anon is mandatory here: Supabase's default
-- ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function
-- separately from PUBLIC, and the anon key ships in the client bundle. The
-- stub this replaces was callable by anon — harmless only because it returned
-- nothing.
--
-- NOT DONE HERE (deliberate)
--
-- `check_orphaned_profiles()` and `create_missing_profiles()` are stubs of the
-- same vintage and are left alone. The second one WRITES profiles; repairing
-- 8 broken identity links is a decision about real people's accounts, not a
-- migration. Detection first.
-- ============================================================================

BEGIN;

-- Return type changes (three columns become six), so CREATE OR REPLACE cannot
-- be used. The only caller is app/api/users/check-consistency/route.ts, which
-- reads the result as an opaque array and is unaffected by extra columns.
DROP FUNCTION IF EXISTS public.check_orphaned_auth_users();

CREATE FUNCTION public.check_orphaned_auth_users()
RETURNS TABLE (
  user_id                 uuid,
  user_email              text,
  created_at              timestamptz,
  last_sign_in_at         timestamptz,
  has_signed_in           boolean,
  profile_exists_by_email boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'check_orphaned_auth_users: administrator access required';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    (u.last_sign_in_at IS NOT NULL),
    EXISTS (
      SELECT 1
      FROM public.profiles p2
      WHERE lower(p2.email) = lower(u.email::text)
    )
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL
    AND u.deleted_at IS NULL
  ORDER BY u.last_sign_in_at DESC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_orphaned_auth_users() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_orphaned_auth_users() TO authenticated;

COMMENT ON FUNCTION public.check_orphaned_auth_users() IS
  'Auth users with no profiles row. has_signed_in separates people actually '
  'being turned away from never-used pre-created shells; profile_exists_by_email '
  'flags broken identity links that are recoverable by relinking. '
  'Admin-gated internally because it is SECURITY DEFINER over auth.users.';

COMMIT;

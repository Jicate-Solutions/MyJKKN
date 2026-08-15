-- ============================================================================
-- 2026-08-15 — Make the profile-side link health check tell the truth
-- ============================================================================
--
-- WHY
--
-- `public.check_orphaned_profiles()` is the platform's own health check for
-- "a profiles row that has no auth.users row at its own id". Its entire body
-- was:
--
--     -- Since we can't access auth.users table, return empty result set
--     SELECT p.id, p.email, p.role, p.created_at FROM profiles p WHERE 1 = 0;
--
-- It always answered ZERO, and it was callable by anon — harmless only
-- because it returned nothing. Sibling change: 20260815011500 fixed the
-- other half of the pair, check_orphaned_auth_users().
--
-- WHAT IS ACTUALLY OUT THERE (measured on production 2026-08-15)
--
-- 1,228 profiles rows have no auth.users row at their own id. That is ONE
-- number covering TWO completely different situations, and an admin looking
-- at a flat list cannot tell them apart:
--
--   ·   269  no auth.users row for their email ANYWHERE. Pre-registered,
--            awaiting a first Google sign-in. HEALTHY — nothing to do.
--   ·   959  their EMAIL already has an auth.users row, under a DIFFERENT id.
--            This violates the documented invariant auth.users.id ==
--            profiles.id. 941 are is_active. But only 7 of the 959 have ever
--            authenticated at all — the other 952 are dormant and will link
--            themselves the moment they do.
--
-- DOES SIGN-IN HEAL THIS? MOSTLY YES — AND THAT IS WHY THIS IS DETECTION ONLY
--
-- app/auth/callback/route.ts does heal exactly this case. Its gate is not
-- "does an auth row exist for this email"; it is "does a profile exist at the
-- signing-in user's auth id". When none does, it looks the profile up by
-- email and calls migrate_pre_registered_profile_to_auth(old_id, new_auth_id),
-- which re-keys the profile onto the auth id. Since 2026-06 BOTH branches
-- (is_pre_registered true and false) route through that same RPC, so
-- is_pre_registered is not a reliable discriminator and this function does not
-- treat it as one.
--
-- For 958 of the 959 that healing path is open: emails match exactly (the
-- lookup is a case-sensitive .eq), profiles.email is UNIQUE so the
-- .maybeSingle() cannot error, and no profile sits at the auth id to
-- short-circuit it.
--
-- TWO WAYS IT STILL DOES NOT RUN — both small, both measured, both surfaced
-- here as heal_blocked_reason:
--
--   a) THE CALLBACK IS THE OAUTH DOOR ONLY. signInWithOAuth() redirects to
--      /auth/callback; signInWithPassword() (components/auth/email-login-form
--      .tsx, plus the test/lti/audit login pages) never touches it — it just
--      reads profiles at data.user.id and routes on the role. 6 of the 7
--      signed-in rows have provider='email'. They hold a valid session with no
--      profile at their id and no healing code has ever run for them. This is
--      the whole explanation for the counter-evidence that healing "does not
--      always happen": healing is real, it just lives behind one of two doors.
--      This function cannot see the provider (that is an auth.users concern,
--      already reported by check_orphaned_auth_users), so it reports
--      has_signed_in and lets the admin draw the line.
--   b) A PROFILE ALREADY SITS AT THE AUTH ID, so existingProfile is truthy and
--      the email branch never executes. Exactly 1 row is in this state
--      (an all-uppercase email whose auth twin is lowercase, so the
--      case-sensitive .eq would miss it even if the branch did run). That row
--      will never self-heal.
--
-- So: 959 is a count of ROWS, not of people being turned away. 7 have ever
-- authenticated; 6 of those are experiencing anything at all. Reporting 959 as
-- "broken accounts" would be as wrong as the stub's zero.
--
-- WHAT THIS DOES
--
-- Replaces the stub with a real query over all 1,228, discriminated so the
-- populations can never be conflated:
--   · link_state          — 'broken_link' vs 'awaiting_first_signin'
--   · has_signed_in       — separates the 7 live cases from the 952 dormant
--   · heal_blocked_reason — non-null only for rows sign-in will NOT fix
--   · linked_auth_user_id — the auth row the email actually resolves to
--
-- SECURITY
--
-- Reading auth.users requires SECURITY DEFINER, so the function gates itself
-- on is_super_admin() OR is_admin() rather than trusting the caller. The
-- explicit REVOKE FROM anon is mandatory: Supabase's default
-- ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function
-- separately from PUBLIC, and the anon key ships in the client bundle. The
-- stub this replaces was anon-callable.
--
-- NOT DONE HERE (deliberate)
--
-- `create_missing_profiles()` is a stub of the same vintage and is left alone.
-- It WRITES profiles. Repairing identity links re-keys real people's accounts
-- and their FK graph — that is a Director decision, not a migration.
-- Detection first.
-- ============================================================================

BEGIN;

-- Return type changes (four columns become ten), so CREATE OR REPLACE cannot
-- be used. The only caller is app/api/users/check-consistency/route.ts, which
-- passes the result straight through as an opaque JSON array and is unaffected
-- by extra columns.
DROP FUNCTION IF EXISTS public.check_orphaned_profiles();

CREATE FUNCTION public.check_orphaned_profiles()
RETURNS TABLE (
  profile_id          uuid,
  profile_email       text,
  profile_role        text,
  created_at          timestamptz,
  link_state          text,
  linked_auth_user_id uuid,
  has_signed_in       boolean,
  last_sign_in_at     timestamptz,
  is_pre_registered   boolean,
  is_active           boolean,
  heal_blocked_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'check_orphaned_profiles: administrator access required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.email::text,
    p.role::text,
    p.created_at,
    CASE WHEN au.id IS NULL THEN 'awaiting_first_signin' ELSE 'broken_link' END,
    au.id,
    (au.last_sign_in_at IS NOT NULL),
    au.last_sign_in_at,
    COALESCE(p.is_pre_registered, false),
    COALESCE(p.is_active, false),
    CASE
      WHEN au.id IS NULL THEN NULL
      -- A profile already occupies the auth id, so the callback's
      -- existingProfile lookup succeeds and its email branch never runs.
      WHEN EXISTS (SELECT 1 FROM public.profiles px WHERE px.id = au.id)
        THEN 'profile_exists_at_auth_id'
      -- The callback matches on .eq('email', ...), which is case-sensitive.
      WHEN p.email::text <> au.email::text
        THEN 'email_case_mismatch'
      ELSE NULL
    END
  FROM public.profiles p
  LEFT JOIN auth.users own
    ON own.id = p.id
  LEFT JOIN LATERAL (
    SELECT u.id, u.email, u.last_sign_in_at
    FROM auth.users u
    WHERE lower(u.email::text) = lower(p.email::text)
      AND u.deleted_at IS NULL
    ORDER BY u.last_sign_in_at DESC NULLS LAST, u.created_at
    LIMIT 1
  ) au ON true
  WHERE own.id IS NULL
    AND p.email IS NOT NULL
  ORDER BY (au.last_sign_in_at IS NOT NULL) DESC, au.last_sign_in_at DESC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_orphaned_profiles() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_orphaned_profiles() TO authenticated;

COMMENT ON FUNCTION public.check_orphaned_profiles() IS
  'Profiles rows with no auth.users row at their own id. link_state separates '
  'healthy pre-registered rows awaiting a first sign-in from rows whose email '
  'already resolves to a DIFFERENT auth id (the auth.users.id == profiles.id '
  'invariant broken). has_signed_in separates dormant rows — which the '
  '/auth/callback email-migration path heals on first Google sign-in — from '
  'rows where someone has already authenticated and was not healed. '
  'heal_blocked_reason is non-null only where sign-in cannot fix it. '
  'Admin-gated internally because it is SECURITY DEFINER over auth.users.';

COMMIT;

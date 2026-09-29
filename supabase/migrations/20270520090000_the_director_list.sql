-- ============================================================================
-- Migration: 20270520090000_the_director_list
-- Added: 2026-09-30 — name ONE list of who counts as "the Director".
-- ============================================================================
--
-- WHY
--   The Director ruled (29 Sep 2026) that the final yes on any salary revision
--   is ALWAYS the Director, and that at appraisal sign-off the Director can
--   change a rating. Code has been using is_super_admin() for "the Director",
--   but 15 profiles carry is_super_admin = true (developers, and the shared
--   test account test.superadmin@jkkn.ac.in, whose password is documented).
--   So 14 other accounts could give that yes. This migration gives the system
--   one named list instead.
--
-- WHAT
--   1. A row in the canonical config table platform_policies (the pattern in
--      docs/architecture/config-table-pattern.md), key
--      'platform.the_director_profile_ids', value = JSON array of profile ids.
--   2. public.fn_is_the_director() — true only when the caller is signed in
--      and their profile id is in that list. Missing row, inactive row, empty
--      list, a non-array value, or no signed-in user => false.
--   3. The list is seeded with the profile whose email is director@jkkn.ac.in,
--      looked up when this runs (no hard-coded id). No such profile => an
--      empty list and a NOTICE. ON CONFLICT DO NOTHING: re-running never
--      resets a list someone has since edited.
--   4. Who may change the row: only someone already on the list, or
--      service_role, or a database session with no signed-in user (a
--      migration / the SQL console). Enforced by a BEFORE trigger, because
--      platform_policies already has several PERMISSIVE write policies
--      (super admin, admin, principal) and permissive policies OR together.
--      A super admin who is not on the list is refused, with an error.
--   5. Who may read the raw row through the table: super admins and people on
--      the list (RESTRICTIVE select policies scoped to this one key; anon
--      never sees it). Everyone else just calls fn_is_the_director().
--      NOTE: fn_get_policy() (SECURITY DEFINER, granted to authenticated) can
--      still return any key's value to any signed-in user. That is how every
--      platform_policies key works today and is not changed here. The list
--      holds profile ids only, never pay or secrets.
--
-- NOT HERE: no UI, and no existing page calls fn_is_the_director() yet.
--   Draft #4120 (salary revision approval) and the rating-override draft will
--   switch to it and must merge AFTER this.
--
-- Idempotent: safe to apply twice. No inner BEGIN/COMMIT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The check everyone else calls
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_is_the_director()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND COALESCE((
           SELECT jsonb_typeof(pp.value) = 'array'
              AND pp.value ? (auth.uid())::text
             FROM public.platform_policies pp
            WHERE pp.policy_key = 'platform.the_director_profile_ids'
              AND pp.scope_type = 'global'
              AND pp.scope_id IS NULL
              AND pp.is_active = true
            LIMIT 1
         ), false);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_the_director() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_the_director() TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_is_the_director() IS
  'True only when the signed-in caller is on platform_policies '
  '''platform.the_director_profile_ids'' (global, active, a JSON array of '
  'profile ids). NOT the same as is_super_admin(): 15 accounts are super '
  'admins. Use this for the Director-only decisions (salary revision final '
  'yes, appraisal rating override). Migration 20270520090000.';

-- ----------------------------------------------------------------------------
-- 2. Guard: only a listed person (or service_role / a no-user DB session) may
--    insert, update or delete the list row, whatever RLS would allow.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_the_director_list()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c_key CONSTANT text := 'platform.the_director_profile_ids';
  v_touches boolean;
  v_role text := auth.role();
  v_bad text;
BEGIN
  v_touches := (TG_OP IN ('INSERT', 'UPDATE') AND NEW.policy_key = c_key)
            OR (TG_OP IN ('UPDATE', 'DELETE') AND OLD.policy_key = c_key);

  IF NOT v_touches THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- A request from an app user (signed in or anonymous) carries a JWT role.
  -- Such a caller must already be on the list. A NULL role means a direct
  -- database session (migration, SQL console, cron): the owner, allowed.
  -- Two separate statements on purpose: anon has no EXECUTE on
  -- fn_is_the_director(), and PostgreSQL checks that when the expression is
  -- first prepared, so anon must be refused before that line is reached.
  IF v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    IF v_role IS DISTINCT FROM 'authenticated' THEN
      RAISE EXCEPTION 'Only the Director can change who counts as the Director.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT public.fn_is_the_director() THEN
      RAISE EXCEPTION 'Only the Director can change who counts as the Director.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- The value must be a JSON array of profile ids. Store it cleaned:
  -- lower-case, no duplicates, sorted.
  IF NEW.policy_key = c_key THEN
    IF jsonb_typeof(NEW.value) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'platform.the_director_profile_ids must be a JSON array of profile ids.'
        USING ERRCODE = '22023';
    END IF;

    SELECT e::text INTO v_bad
      FROM jsonb_array_elements(NEW.value) AS t(e)
     WHERE jsonb_typeof(e) <> 'string'
        OR (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Not a profile id: %', v_bad
        USING ERRCODE = '22023';
    END IF;

    NEW.value := COALESCE(
      (SELECT jsonb_agg(DISTINCT lower(e) ORDER BY lower(e))
         FROM jsonb_array_elements_text(NEW.value) AS t(e)),
      '[]'::jsonb);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_the_director_list() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_guard_the_director_list() IS
  'BEFORE trigger on platform_policies. Refuses any insert/update/delete that '
  'touches ''platform.the_director_profile_ids'' unless the caller is already '
  'on that list, is service_role, or is a direct DB session with no JWT. '
  'Also cleans the value to a sorted, de-duplicated array of lower-case ids. '
  'Migration 20270520090000.';

DROP TRIGGER IF EXISTS trg_guard_the_director_list ON public.platform_policies;
CREATE TRIGGER trg_guard_the_director_list
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_the_director_list();

-- ----------------------------------------------------------------------------
-- 3. Reading the raw row: super admins and listed people only.
--    RESTRICTIVE, so it AND-s with the existing permissive select policies.
--    Every other key is untouched (the first branch is true for them).
-- ----------------------------------------------------------------------------
--    Two policies, by role: anon has no EXECUTE on fn_is_the_director(), and
--    a policy that merely names it would make every anon read of this table
--    fail with "permission denied for function". So anon gets a policy that
--    names no function and simply never sees this key.
DROP POLICY IF EXISTS platform_policies_the_director_list_read ON public.platform_policies;
CREATE POLICY platform_policies_the_director_list_read ON public.platform_policies
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    policy_key IS DISTINCT FROM 'platform.the_director_profile_ids'
    OR public.is_super_admin()
    OR public.fn_is_the_director()
  );

DROP POLICY IF EXISTS platform_policies_the_director_list_hide_anon ON public.platform_policies;
CREATE POLICY platform_policies_the_director_list_hide_anon ON public.platform_policies
  AS RESTRICTIVE
  FOR SELECT
  TO anon
  USING (policy_key IS DISTINCT FROM 'platform.the_director_profile_ids');

-- ----------------------------------------------------------------------------
-- 4. Seed: the profile with email director@jkkn.ac.in, looked up now.
-- ----------------------------------------------------------------------------
DO $seed$
DECLARE
  v_ids jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(p.id::text ORDER BY p.id), '[]'::jsonb)
    INTO v_ids
    FROM public.profiles p
   WHERE lower(p.email) = 'director@jkkn.ac.in';

  IF v_ids = '[]'::jsonb THEN
    RAISE NOTICE 'the_director_list: no profile has email director@jkkn.ac.in. Seeding an EMPTY list; fn_is_the_director() is false for everyone until service_role adds an id.';
  END IF;

  INSERT INTO public.platform_policies
    (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
  VALUES
    ('platform.the_director_profile_ids', 'global', NULL, v_ids,
     'Who counts as "the Director" for Director-only decisions (salary revision '
     'final yes, appraisal rating override). A JSON array of profile ids. Only '
     'someone already on this list can change it. Read through '
     'fn_is_the_director(); is_super_admin() is NOT the Director.',
     'array', true, true)
  ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO NOTHING;
END
$seed$;

-- ROLLBACK (down migration):
--   DROP POLICY IF EXISTS platform_policies_the_director_list_hide_anon ON public.platform_policies;
--   DROP POLICY IF EXISTS platform_policies_the_director_list_read ON public.platform_policies;
--   DROP TRIGGER IF EXISTS trg_guard_the_director_list ON public.platform_policies;
--   DELETE FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids';
--   DROP FUNCTION IF EXISTS public.fn_guard_the_director_list();
--   DROP FUNCTION IF EXISTS public.fn_is_the_director();

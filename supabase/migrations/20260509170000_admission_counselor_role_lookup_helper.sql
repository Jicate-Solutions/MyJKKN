-- ============================================================================
-- Phase 11: SECURITY DEFINER helper for counselor role-key resolution
-- ============================================================================
-- Why:
--   The Assign-Counselor picker dialog (counselor-picker-dialog.tsx) needed
--   to resolve role_key per counselor user_id to display the role-color
--   badge. The hook used a client-side JOIN through user_roles → custom_roles,
--   but those tables have restrictive RLS (users can read their own role
--   memberships but not other users'). For an Admission Officer trying to
--   pick from 100+ counselors, the join returned zero rows, every counselor's
--   role_key resolved to null, and the hook's `.filter(r => r.role_key !== null)`
--   then dropped them all — producing "No eligible counselors".
--
--   This RPC bypasses the RLS via SECURITY DEFINER and returns the canonical
--   counselor role mapping for the requested user_ids. If a user holds none
--   of the 4 counselor role_keys, they're omitted from the result (no row);
--   the hook handles that by treating role_key as null and still rendering
--   the counselor (with a fallback badge), instead of dropping them.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_counselor_role_keys_for_users(
  p_user_ids uuid[]
)
RETURNS TABLE (
  user_id   uuid,
  role_key  text,
  role_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Pick the highest-precedence counselor role per user. The DISTINCT ON
  -- collapses multi-role users to one row, preferring admission_counselor
  -- over expo, then learner, then staff (the order is admin-curated above).
  SELECT DISTINCT ON (ur.user_id)
    ur.user_id,
    cr.role_key,
    cr.role_name
  FROM unnest(p_user_ids) AS u(user_id)
  JOIN user_roles ur     ON ur.user_id = u.user_id
  JOIN custom_roles cr   ON cr.id      = ur.role_id
  WHERE cr.role_key IN (
    'admission_counselor',
    'expo_counselor',
    'learner_counselor',
    'staff_counselor'
  )
  ORDER BY
    ur.user_id,
    CASE cr.role_key
      WHEN 'admission_counselor' THEN 1
      WHEN 'expo_counselor'      THEN 2
      WHEN 'learner_counselor'   THEN 3
      WHEN 'staff_counselor'     THEN 4
      ELSE 5
    END;
$$;

GRANT EXECUTE ON FUNCTION public.get_counselor_role_keys_for_users(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_counselor_role_keys_for_users(uuid[]) IS
  'SECURITY DEFINER lookup that returns role_key + role_name for the given user_ids, restricted to the 4 counselor role keys. Used by the Assign Counselor picker so RLS on user_roles/custom_roles does not produce empty role-badge data for admin pickers.';

COMMIT;

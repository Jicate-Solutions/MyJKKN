-- =====================================================================
-- Fix: 42P17 infinite recursion in resource_reservations SELECT policy
-- =====================================================================
-- Root cause (introduced by 20260602000001):
--   resource_reservations_select_by_approver queried resource_approvals
--   directly with RLS active. But resource_approvals' own SELECT policy
--   ("resource_approvals_select") contains:
--       EXISTS (SELECT 1 FROM resource_reservations rr WHERE ...)
--   This creates a mutual recursion:
--     resource_reservations → resource_approvals → resource_reservations → …
--
-- Fix:
--   Replace the direct EXISTS subquery with a SECURITY DEFINER helper
--   function. SECURITY DEFINER functions execute as the function owner
--   (postgres superuser in Supabase migrations), which bypasses RLS on
--   every table the function accesses. Querying resource_approvals inside
--   the function therefore never triggers that table's own RLS policies,
--   breaking the cycle entirely.
-- =====================================================================

BEGIN;

-- 1. SECURITY DEFINER helper: checks whether the calling user has an
--    approval row for the given reservation, without triggering RLS on
--    resource_approvals.
CREATE OR REPLACE FUNCTION public.is_reservation_approver(p_reservation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.resource_approvals ra
    WHERE ra.reservation_id = p_reservation_id
      AND ra.approver_user_id = (SELECT auth.uid())
  );
$$;

-- Authenticated (and anonymous) roles must be able to call this function
-- because RLS policy evaluation runs in the query user's execution context.
GRANT EXECUTE ON FUNCTION public.is_reservation_approver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_reservation_approver(uuid) TO anon;

-- 2. Drop + recreate the policy using the helper instead of a direct
--    EXISTS subquery, eliminating the recursion entry point.
DROP POLICY IF EXISTS resource_reservations_select_by_approver
  ON public.resource_reservations;

CREATE POLICY resource_reservations_select_by_approver
  ON public.resource_reservations
  FOR SELECT
  USING (public.is_reservation_approver(resource_reservations.id));

COMMIT;

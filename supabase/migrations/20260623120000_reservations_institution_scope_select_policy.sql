-- Problem: the SELECT policy "Staff with permission can view all reservations"
-- on resource_reservations gated purely on profiles.role IN
-- ('super_admin','admin','accounts') with NO institution scoping, so those
-- staff saw reservations across EVERY institution. Because RLS SELECT policies
-- are OR'd, this single policy leaked cross-institution reservation data.
--
-- Fix: keep the SAME viewer population (deliberately NOT switching to the
-- resources.reservations.view permission key -- that key's VALUE is false for
-- the `accounts` role and true for `staff`, so gating on it would silently
-- revoke the 9 accounts users AND grant every staff user, neither intended).
-- Instead AND the existing role gate with the canonical multi-tenant helper
-- role_has_institution_access(), which:
--   * returns true for super_admin               -> keeps global visibility
--   * returns true for roles with scope='all'    -> group-wide staff unchanged
--   * otherwise limits to own + CAS-sibling + explicitly-granted institutions
-- Net: super_admin and scope='all' staff are unchanged; institution-scoped
-- staff can no longer see other institutions' reservations.

DROP POLICY IF EXISTS "Staff with permission can view all reservations"
  ON public.resource_reservations;

CREATE POLICY "resource_reservations_select_staff_scoped"
  ON public.resource_reservations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = ANY (ARRAY['super_admin', 'admin', 'accounts'])
    )
    AND EXISTS (
      SELECT 1 FROM public.resources r
      WHERE r.id = resource_reservations.resource_id
        AND public.role_has_institution_access(r.institution_id)
    )
  );

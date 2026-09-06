-- Allow super admins to DELETE any reservation.
--
-- The reservation list/detail pages surface a Delete action gated to super
-- admins in the UI. Without a matching RLS path the delete would fail: the only
-- existing DELETE policy (resource_reservations_delete_by_resource) requires the
-- caller's profile institution to match the resource's institution AND
-- user_has_permission('resources.reservations.cancel') — neither of which a
-- super admin (scope='all', often institution_id NULL) necessarily satisfies.
--
-- This adds a separate, additive permissive policy. Postgres OR-combines
-- permissive policies, so super admins can delete any reservation while the
-- existing institution-scoped path is left untouched. is_super_admin() returns
-- false for anon, so anonymous callers still cannot delete.

DROP POLICY IF EXISTS resource_reservations_delete_super_admin ON public.resource_reservations;
CREATE POLICY resource_reservations_delete_super_admin
  ON public.resource_reservations
  FOR DELETE
  TO authenticated
  USING (is_super_admin());

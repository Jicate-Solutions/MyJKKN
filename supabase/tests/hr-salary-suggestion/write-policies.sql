-- Stand-ins for main's permissive write policies on platform_policies
-- (super admin or admin). Loaded by run.sh AFTER the permission helpers, since
-- they name is_super_admin(). #4111's restrictive write locks and this PR's
-- trigger are layered on top of these in the rehearsal.
CREATE POLICY platform_policies_insert ON public.platform_policies
  FOR INSERT WITH CHECK (public.is_super_admin() OR public.is_admin());
CREATE POLICY platform_policies_update ON public.platform_policies
  FOR UPDATE USING (public.is_super_admin() OR public.is_admin());
CREATE POLICY platform_policies_delete ON public.platform_policies
  FOR DELETE USING (public.is_super_admin() OR public.is_admin());

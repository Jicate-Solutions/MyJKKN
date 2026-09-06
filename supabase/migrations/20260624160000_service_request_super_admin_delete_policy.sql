-- Allow super admins to DELETE any service request.
--
-- The "All Requests" tab on /service-requests surfaces a Delete action gated to
-- super admins in the UI. Without a matching RLS path the delete would fail
-- silently: service_requests has RLS enabled but NO FOR DELETE policy at all, so
-- Postgres default-denies the DELETE command for every caller (super admins
-- included).
--
-- This adds a separate, additive permissive policy. Postgres OR-combines
-- permissive policies, so super admins can delete any request while every other
-- (INSERT/SELECT/UPDATE) path is left byte-unchanged. is_super_admin() returns
-- false for anon, so anonymous callers still cannot delete. Child rows in
-- service_request_approvals / service_request_timeline / service_request_attachments
-- are removed automatically via their ON DELETE CASCADE foreign keys.

DROP POLICY IF EXISTS service_requests_delete_super_admin ON public.service_requests;
CREATE POLICY service_requests_delete_super_admin
  ON public.service_requests
  FOR DELETE
  TO authenticated
  USING (is_super_admin());

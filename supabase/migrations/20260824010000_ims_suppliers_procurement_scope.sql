-- ims_suppliers: admit the Procurement institution scope alongside the IMS one.
--
-- Vendors live in ims_suppliers, but Procurement borrowed the table without
-- borrowing IMS's access model:
--
--   IMS scope         ims_accessible_institution_ids()
--                     = your own profile institution + your active store grants
--   Procurement scope role_has_institution_access(institution_id)
--                     = honours custom_roles.institution_scope = 'all',
--                       CAS siblings, and user_institution_access grants
--
-- A procurement user raising an RFQ for an institution other than their own
-- could therefore create the QUOTATION (procurement_quotations and friends are
-- scoped by role_has_institution_access) but could neither SEE nor CREATE the
-- vendor it belongs to. The "Existing" vendor dropdown came up empty, which
-- pushed them onto "+ New vendor", and that insert was then refused by RLS with
-- a bare "Failed to add quotation" in the UI.
--
-- DELETE is deliberately NOT widened. Reading, creating and correcting vendors is
-- what the quotation flow needs; removing a supplier is destructive and stays on
-- the IMS scope.
--
-- NULL GUARD: institution_id is nullable, and role_has_institution_access(NULL)
-- returns true by design (it treats NULL as a system-wide record). Each new
-- clause below is guarded with IS NOT NULL so a null-institution supplier can
-- never become globally readable or insertable as a side effect of this change.

DROP POLICY IF EXISTS ims_suppliers_select ON ims_suppliers;
CREATE POLICY ims_suppliers_select ON ims_suppliers
  FOR SELECT TO authenticated
  USING (
    institution_id IN (SELECT ims_accessible_institution_ids())
    OR (institution_id IS NOT NULL AND role_has_institution_access(institution_id))
    OR (SELECT get_current_user_role()) = 'super_admin'
  );

DROP POLICY IF EXISTS ims_suppliers_insert ON ims_suppliers;
CREATE POLICY ims_suppliers_insert ON ims_suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    institution_id IN (SELECT ims_accessible_institution_ids())
    OR (institution_id IS NOT NULL AND role_has_institution_access(institution_id))
    OR (SELECT get_current_user_role()) = 'super_admin'
  );

DROP POLICY IF EXISTS ims_suppliers_update ON ims_suppliers;
CREATE POLICY ims_suppliers_update ON ims_suppliers
  FOR UPDATE TO authenticated
  USING (
    institution_id IN (SELECT ims_accessible_institution_ids())
    OR (institution_id IS NOT NULL AND role_has_institution_access(institution_id))
    OR (SELECT get_current_user_role()) = 'super_admin'
  );

-- ims_suppliers_delete is intentionally left untouched (IMS scope only).

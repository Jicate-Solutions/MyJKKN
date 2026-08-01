-- 20260801120000_billing_insert_policies_institution_scope.sql
--
-- Close the institution-scope hole in the two billing INSERT policies.
--
-- THE BUG
-- `billing_bills_insert_permission` and `billing_receipts_insert_permission`
-- gated only on the permission key:
--     is_super_admin() OR is_admin() OR user_has_permission('<key>')
-- while the matching UPDATE and DELETE policies on the same tables have always
-- ANDed in `role_has_institution_access(institution_id)`. So a role scoped to
-- one institution could CREATE a bill or receipt against ANY institution, then
-- be unable to edit or delete the row it had just written. Asymmetric by
-- accident, not by design.
--
-- THE FIX
-- Mirror the UPDATE/DELETE shape exactly. Note the evaluation forms differ on
-- purpose, matching the existing policies:
--   - is_super_admin() / is_admin() / user_has_permission() take no column
--     reference, so they stay wrapped in a scalar subquery `(SELECT fn())` —
--     that forces once-per-statement evaluation instead of once per row.
--   - role_has_institution_access(institution_id) DOES reference a column and
--     therefore must be evaluated per row. It cannot be wrapped.
--
-- BLAST RADIUS (measured 2026-08-01, before applying)
-- 25 user_roles assignments + 1 legacy profiles.role-only user currently hold
-- billing.schedule.create or billing.receipts.create. All but one resolve to a
-- role with institution_scope='all', and role_has_institution_access() returns
-- true unconditionally for those — so 25 of 26 see NO behaviour change.
-- The single account that becomes restricted is test.admin@jkkn.ac.in
-- (payment_audit_admin, institution_scope='own'), which is the point.
--
-- Also verified safe:
--   - institution_id is NOT NULL on both tables with 0 NULL rows, so the
--     `role_has_institution_access(NULL) => true` escape hatch is unreachable.
--   - relforcerowsecurity = false on both tables, so SECURITY DEFINER RPCs and
--     the service-role client (bulk-import, bulk-template) bypass RLS entirely
--     and are unaffected by this change.
--   - billing_student_bills has a SECOND permissive INSERT policy,
--     `bills_insert_admin`, which already ANDs in role_has_institution_access.
--     Permissive policies OR together, so after this migration BOTH insert
--     branches are institution-scoped.

-- ── billing_student_bills ────────────────────────────────────────────────
DROP POLICY IF EXISTS billing_bills_insert_permission ON billing_student_bills;

CREATE POLICY billing_bills_insert_permission
  ON billing_student_bills
  FOR INSERT
  WITH CHECK (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR (
      (SELECT user_has_permission('billing.schedule.create'::text))
      AND role_has_institution_access(institution_id)
    )
  );

-- ── billing_receipts ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS billing_receipts_insert_permission ON billing_receipts;

CREATE POLICY billing_receipts_insert_permission
  ON billing_receipts
  FOR INSERT
  WITH CHECK (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR (
      (SELECT user_has_permission('billing.receipts.create'::text))
      AND role_has_institution_access(institution_id)
    )
  );

-- Verification — both INSERT policies should now contain
-- role_has_institution_access, matching their UPDATE/DELETE siblings:
--   SELECT tablename, policyname, cmd, with_check
--   FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename IN ('billing_student_bills','billing_receipts')
--     AND cmd='INSERT';

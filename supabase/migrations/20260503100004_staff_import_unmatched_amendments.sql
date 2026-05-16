-- 20260503100004_staff_import_unmatched_amendments.sql
-- Follow-up amendments to the staff_import_unmatched table created in
-- 20260503100003_staff_import_unmatched_table.sql:
--   1. resolved_by FK gets ON DELETE SET NULL (was NO ACTION) so deleting
--      an auth user no longer blocks deletion of their resolved-by rows.
--   2. RLS policy renamed from super_admin_full_access (misleading; gated
--      by permission key, not role) to staff_imports_manage_access.
--   3. Grant staff.manage_imports permission to the 'administrator'
--      custom role so the policy is not dead. Real super_admin users
--      already bypass user_has_permission() at the function level
--      (profiles.is_super_admin = true OR profiles.role = 'super_admin'),
--      but no other role currently holds this key. Following the existing
--      pattern in 20260425000001_grant_hr_dashboard_view_to_administrator.sql.

-- ── Issue 2: FK ON DELETE SET NULL ──────────────────────────────────────
ALTER TABLE public.staff_import_unmatched
  DROP CONSTRAINT IF EXISTS staff_import_unmatched_resolved_by_fkey;
ALTER TABLE public.staff_import_unmatched
  ADD CONSTRAINT staff_import_unmatched_resolved_by_fkey
  FOREIGN KEY (resolved_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── Issue 3: rename policy ──────────────────────────────────────────────
DROP POLICY IF EXISTS "super_admin_full_access" ON public.staff_import_unmatched;
DROP POLICY IF EXISTS "staff_imports_manage_access" ON public.staff_import_unmatched;
CREATE POLICY "staff_imports_manage_access"
  ON public.staff_import_unmatched
  FOR ALL
  TO authenticated
  USING (user_has_permission('staff.manage_imports'))
  WITH CHECK (user_has_permission('staff.manage_imports'));

-- ── Issue 1: grant staff.manage_imports to administrator role ───────────
-- Idempotent: WHERE guard re-executes safely. Only updates when the
-- permission is not already true. Mirrors the pattern in
-- 20260425000001_grant_hr_dashboard_view_to_administrator.sql.
UPDATE custom_roles
SET permissions = permissions || '{"staff.manage_imports": true}'::jsonb,
    updated_at = now()
WHERE role_key = 'administrator'
  AND COALESCE((permissions->>'staff.manage_imports')::boolean, false) = false;

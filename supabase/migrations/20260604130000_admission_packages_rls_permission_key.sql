-- ─── Admission Packages module — RLS: hardcoded role → permission key ─────────
-- Replaces the hardcoded `profiles.role IN ('super_admin','admin')` write gate
-- on admission_packages and its community junction with the catalog permission
-- key `campus_living.settings.edit`, per the repo rule "never hardcode role
-- names in SQL".
--
-- Why this is safe (verified against live data 2026-06-04):
--   * user_has_permission() grants super admins automatically (is_super_admin),
--     so all 12 super_admin users keep write access.
--   * `campus_living.settings.edit` is already granted to ceo / chief_warden /
--     executive_admin_officer / hostel_office — so the gate WIDENS legitimate
--     access to campus-living managers who the old role gate excluded.
--   * Of users passing the OLD gate, the only one that loses write is
--     test.admin2@jkkn.local — a roleless test account.
--
-- Scope: only the two package tables (the reported module). The sibling
-- hostel_*/mess_* settings tables remain on the legacy role gate pending the
-- planned module-wide retrofit (see lib/constants/permissions.ts ~L1245).
-- SELECT stays open (USING true), unchanged.

-- ── admission_packages: INSERT / UPDATE / DELETE ────────────────────────────
DROP POLICY IF EXISTS admission_packages_insert ON admission_packages;
CREATE POLICY admission_packages_insert
  ON admission_packages FOR INSERT TO authenticated
  WITH CHECK (user_has_permission('campus_living.settings.edit'));

DROP POLICY IF EXISTS admission_packages_update ON admission_packages;
CREATE POLICY admission_packages_update
  ON admission_packages FOR UPDATE TO authenticated
  USING (user_has_permission('campus_living.settings.edit'));

DROP POLICY IF EXISTS admission_packages_delete ON admission_packages;
CREATE POLICY admission_packages_delete
  ON admission_packages FOR DELETE TO authenticated
  USING (user_has_permission('campus_living.settings.edit'));

-- ── admission_package_communities: INSERT / DELETE ──────────────────────────
DROP POLICY IF EXISTS admission_package_communities_insert ON admission_package_communities;
CREATE POLICY admission_package_communities_insert
  ON admission_package_communities FOR INSERT TO authenticated
  WITH CHECK (user_has_permission('campus_living.settings.edit'));

DROP POLICY IF EXISTS admission_package_communities_delete ON admission_package_communities;
CREATE POLICY admission_package_communities_delete
  ON admission_package_communities FOR DELETE TO authenticated
  USING (user_has_permission('campus_living.settings.edit'));

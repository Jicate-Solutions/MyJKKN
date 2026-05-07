-- Coordination PR: Phase 0A (HR/Appraisal Program prerequisites)
-- Adds HoD pointer to departments table for SAMS-Slice-1 routing.
-- Per /interview Round 2/3 (2026-05-07) — Director-locked schema add.
--
-- Why this column lives here (vs reports_to_staff_id on hr_staff_details):
--   Director's chosen routing model is "appraisal goes to dept HoD" — i.e. the
--   identity is owned by departments, not by every staff. 0% of
--   hr_staff_details.reports_to_staff_id is currently populated; HR officers
--   would have to fill ~1500 rows to use that path. Filling
--   departments.head_of_department_id is ~50 rows total across 8 colleges.
--
-- Tier-2 migration per feedback_migration_notification_protocol.md:
--   - Structural change (DDL) on production
--   - Additive (new nullable column + index)
--   - Reversible (DROP COLUMN + DROP INDEX)
--   - Zero existing rows affected (NULL default for all 50 departments)
--   - RLS unchanged (departments policies remain as-is)

ALTER TABLE departments
  ADD COLUMN head_of_department_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_departments_hod
  ON departments(head_of_department_id)
  WHERE head_of_department_id IS NOT NULL;

COMMENT ON COLUMN departments.head_of_department_id IS
  'Resolves to the staff member acting as HoD for this department. '
  'Used by SAMS appraisal routing (one HoD per dept). '
  'NULL allowed; SAMS service treats NULL as "needs assignment". '
  'Filled by HR officer per college via /admin/departments admin UI.';

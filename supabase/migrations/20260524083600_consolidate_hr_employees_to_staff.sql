-- =====================================================================
-- TIER-2 DESTRUCTIVE MIGRATION — Director typed-approval required before apply
-- =====================================================================
--
-- Context: hr_employees has 0 data rows and exists only as an FK target
-- for hr_attendance_records.employee_id. The real staff data lives in the
-- `staff` table (393 rows). This dual-table creates confusion.
--
-- What this does:
--   1. Verifies hr_attendance_records.employee_id values resolve to staff.id
--      (likely empty table, so trivially true)
--   2. Drops the FK from hr_attendance_records → hr_employees
--   3. Adds a new FK: hr_attendance_records.employee_id → staff(id)
--   4. Drops the hr_employees table
--
-- Rollback: not provided — this is a one-way consolidation. If hr_employees
-- needs to come back, re-create it from the original migration
-- (20260429000001_hr_attendance_sprint5_schema.sql context).
-- =====================================================================

BEGIN;

-- Step 1: Safety check — abort if any hr_attendance_records.employee_id
-- references an id that does NOT exist in staff. Since hr_employees is
-- typically empty, hr_attendance_records is also likely empty, but verify.
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM hr_attendance_records ar
  WHERE NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = ar.employee_id);

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Found % hr_attendance_records rows whose employee_id does not exist in staff. Cannot consolidate.', orphan_count;
  END IF;
END $$;

-- Step 2: Drop the existing FK constraint on hr_attendance_records → hr_employees
-- The constraint name comes from the original CREATE TABLE which used inline REFERENCES.
-- Postgres auto-names it: hr_attendance_records_employee_id_fkey
ALTER TABLE hr_attendance_records
  DROP CONSTRAINT IF EXISTS hr_attendance_records_employee_id_fkey;

-- Step 3: Add new FK constraint pointing to staff
ALTER TABLE hr_attendance_records
  ADD CONSTRAINT hr_attendance_records_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES staff(id);

-- Step 4: Drop hr_employees table (cascade drops its RLS policies, indexes, etc.)
-- Using CASCADE to clean up any remaining policies/triggers on the table.
DROP TABLE IF EXISTS hr_employees CASCADE;

COMMIT;

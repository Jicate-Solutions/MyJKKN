-- =====================================================================
-- Drop the FK on staff.biometric_institution_id
-- =====================================================================
-- Regression fix. Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
--
-- 20260806120000 added staff.biometric_institution_id AS A FOREIGN KEY to
-- institutions. That gave `staff` a SECOND fk to `institutions`, and PostgREST
-- resolves embeds by relationship, not by column — so every existing
-- `staff ... institution:institutions(...)` embed became ambiguous and started
-- failing with PGRST201:
--
--   Could not embed because more than one relationship was found for
--   'staff' and 'institutions'
--
-- That broke the staff list, staff detail, staff export, incomplete-profiles,
-- the b2a and api-management staff endpoints, faculty timetable, the attendance
-- dashboard and the staff-search selector — roughly 20 call sites, several in
-- files that also embed institutions on OTHER base tables, so qualifying them
-- individually is both wide and easy to get wrong.
--
-- The column and all its data are kept; only the constraint is dropped, which
-- restores every embed with no application change. Validity of the machine id
-- is now enforced by the application: the staff form and the import wizard both
-- offer only real institutions.
--
-- This is a stop-gap. The durable fix is to move the (machine, code) pairing off
-- `staff` into its own table, which removes the second relationship entirely and
-- also buys multi-machine enrolment and re-issue history.
-- =====================================================================

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_biometric_institution_id_fkey;

COMMENT ON COLUMN public.staff.biometric_institution_id IS
  'The institution that OWNS the machine this code was issued on — deliberately NOT staff.institution_id, because staff routinely punch on another institution''s machine. Intentionally NOT a foreign key: a second FK from staff to institutions makes every PostgREST institutions embed on staff ambiguous (PGRST201). Validity is enforced in the application.';

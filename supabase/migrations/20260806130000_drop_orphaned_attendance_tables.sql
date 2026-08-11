-- =====================================================================
-- Drop the orphaned biometric / faculty-attendance tables
-- =====================================================================
-- Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
--
-- hr_attendance_records is now the single canonical per-day staff attendance
-- store. These four are what is left over from earlier attempts, and leaving
-- them invites someone to wire into the wrong one later — which is exactly how
-- the previous importer ended up writing a non-canonical, institution-blind
-- table instead of the governed one.
--
-- Verified 2026-08-06 immediately before dropping:
--   hr_biometric_punches                    0 rows, NO code reference anywhere
--   hr_biometric_devices                    0 rows, NO code reference anywhere
--   faculty_attendance_days                 0 rows, last writer removed when
--                                           the import route was rewritten
--   faculty_attendance_reconcile_proposals  0 rows, orphaned with it
--
-- What is lost: the never-implemented "reconcile a missed punch against a
-- corroborating work signal" idea. Nothing ever wrote a proposal, and no
-- function or trigger ever consumed one. The equivalent path today is
-- hr_attendance_exceptions -> the existing regularization queue, which the
-- importer now populates for single-punch days.
-- =====================================================================

DROP TABLE IF EXISTS public.faculty_attendance_reconcile_proposals;
DROP TABLE IF EXISTS public.faculty_attendance_days;
DROP TABLE IF EXISTS public.hr_biometric_punches;
DROP TABLE IF EXISTS public.hr_biometric_devices;

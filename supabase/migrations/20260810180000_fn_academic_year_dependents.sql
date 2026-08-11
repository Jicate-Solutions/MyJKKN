-- ============================================================================
-- fn_academic_year_dependents — what still points at an academic year
-- ============================================================================
--
-- Companion to 20260810170000_learner_academic_year_active_guard.sql. That
-- migration repaired 15 learners stranded on deactivated Dental years and
-- taught the learners_profiles trigger to reject an inactive academic_year_id.
-- This one gives the Academic Years screen the number it needed BEFORE the
-- damage: how many rows would be rewritten or destroyed by switching a year
-- off, or deleting it.
--
-- WHY AN RPC AND NOT SIX CLIENT-SIDE COUNTS:
--   AcademicYearService runs on the BROWSER client, so every count it issues
--   is filtered by RLS. An operator who administers Academic Years but cannot
--   read student_attendance or timetables would get 0 back and be waved
--   straight through the guard — a guard that silently under-counts is worse
--   than none, because it reads as a clean bill of health. SECURITY DEFINER
--   makes the count authoritative.
--
--   It returns COUNTS ONLY — no learner, bill or attendance rows — so
--   bypassing RLS here discloses nothing beyond "this year is in use".
--
-- WHY THESE SIX of the 19 tables that reference academic_years: they are the
--   ones that carry volume or lose data on delete.
--     timetables, intake_history ....... ON DELETE CASCADE — Postgres DELETES
--                                        these rows, without a word
--     learners_profiles, billing_student_bills
--                              ......... ON DELETE SET NULL — silently untags
--                                        the learner / the bill. An untagged
--                                        bill is exactly what makes
--                                        fn_learner_band_academic_fee report
--                                        "bills exist but none is usable".
--     student_attendance, staff_plans .. plain FK — the delete just fails
--
--   Measured 2026-08-10: the four "empty-looking" duplicate Dental years still
--   held 3 timetables, 30 attendance records, 1 bill and 1 intake_history row.
--   Deleting them as harmless leftovers would have destroyed the timetables.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_academic_year_dependents(
  p_academic_year_id uuid
)
RETURNS TABLE(entity text, row_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 'learner profile'::text,    count(*) FROM public.learners_profiles     WHERE academic_year_id = p_academic_year_id
  UNION ALL
  SELECT 'bill'::text,               count(*) FROM public.billing_student_bills WHERE academic_year_id = p_academic_year_id
  UNION ALL
  SELECT 'timetable'::text,          count(*) FROM public.timetables            WHERE academic_year_id = p_academic_year_id
  UNION ALL
  SELECT 'attendance record'::text,  count(*) FROM public.student_attendance    WHERE academic_year_id = p_academic_year_id
  UNION ALL
  SELECT 'intake history row'::text, count(*) FROM public.intake_history        WHERE academic_year_id = p_academic_year_id
  UNION ALL
  SELECT 'staff plan'::text,         count(*) FROM public.staff_plans           WHERE academic_year_id = p_academic_year_id
$function$;

COMMENT ON FUNCTION public.fn_academic_year_dependents(uuid) IS
  'Counts rows referencing an academic year, across the six tables that carry '
  'volume or lose data on delete. SECURITY DEFINER so the count is not silently '
  'shrunk by RLS in the Academic Years screen. Returns counts only, no rows.';

REVOKE EXECUTE ON FUNCTION public.fn_academic_year_dependents(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_academic_year_dependents(uuid) TO authenticated, service_role;

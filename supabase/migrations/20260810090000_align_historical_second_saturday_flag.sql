-- ============================================================================
-- Align the historical 2nd-Saturday flag with the config now in force
-- Created: 2026-08-10
--
-- THE REPORT
--   2026-07-11 read WEEKLY_OFF for JKKN Main Office staff even though Saturday
--   is configured as a working day and the "2nd Saturday off" box is unticked.
--
-- WHY
--   The box is not is_working_day. fn_resolve_shift_timings_bulk overrides the
--   working-day flag for day-of-month 8..14 on an ISODOW-6 date whenever
--   second_saturday_holiday is set:
--     WHEN (ISODOW = 6 AND DAY BETWEEN 8 AND 14 AND t.second_saturday_holiday)
--       THEN false
--   The 2026-08-06 seed created all 28 Saturday rows with the flag ON. On
--   2026-08-09 the flag was turned OFF for 10 institutions, but each of those
--   saves took the SUPERSEDE branch of fn_save_shift_timing_week: the old row
--   was closed at 2026-08-09 and a new one opened. 2026-07-11 still resolves
--   against the closed row, where the flag is still ON.
--
--   The UI cannot fix this. fn_save_shift_timing_week only ever reads the row
--   with effective_until IS NULL, so once a supersede exists the historical row
--   is unreachable. (Migration 20260810091000 removes that limitation; this one
--   repairs the damage already done.)
--
-- SCOPE — verified before writing: exactly 20 rows, 10 institutions x 2 scopes,
-- all effective 2026-06-01 -> 2026-08-09. The predicate is self-limiting: a
-- historical Saturday row is corrected ONLY where the row currently in force
-- for the same (institution, scope, category) already has the flag off. The
-- four institutions never edited — Matric School, Nattraja CBSE, Testing
-- Institution, Incubation Forum — keep the flag ON in both rows and are
-- untouched, because nobody has said their 2nd Saturday is a working day.
--
-- CONSEQUENCE — this one is not free. 42 staff hold WEEKLY_OFF on 2026-07-11.
-- After the recompute, 31 who punched become PRESENT/HALF_DAY and 11 who did
-- not become ABSENT. Confirmed by the operator on 2026-08-10 before applying.
--
-- ATTENDANCE IS NOT REWRITTEN HERE. This migration changes configuration only.
-- The verdicts move when the recompute runs (/hr/admin/shift-timings ->
-- "Recompute imported attendance", or automatically on the next week save),
-- which re-judges via the shared TypeScript evaluateDay() rather than a second
-- copy of the rule in SQL.
-- ============================================================================

BEGIN;

WITH in_force AS (
  SELECT institution_id, staff_scope, employment_category_id, day_of_week
  FROM public.hr_shift_timings
  WHERE day_of_week = 6
    AND is_active
    AND effective_until IS NULL
    AND second_saturday_holiday = false
)
UPDATE public.hr_shift_timings h
   SET second_saturday_holiday = false,
       updated_at              = now(),
       notes                   = COALESCE(h.notes || ' | ', '')
                                 || '2026-08-10: 2nd-Saturday flag cleared to match the '
                                 || 'configuration in force from 2026-08-09; the 08-09 edit '
                                 || 'superseded rather than corrected (migration 20260810090000).'
  FROM in_force f
 WHERE h.institution_id            = f.institution_id
   AND h.staff_scope               = f.staff_scope
   AND h.employment_category_id IS NOT DISTINCT FROM f.employment_category_id
   AND h.day_of_week               = f.day_of_week
   AND h.is_active
   AND h.effective_until IS NOT NULL
   AND h.second_saturday_holiday   = true;

COMMIT;

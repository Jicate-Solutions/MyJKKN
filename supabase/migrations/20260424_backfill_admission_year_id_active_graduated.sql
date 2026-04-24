-- Migration: 2026-04-24
-- Extend admission_year_id backfill to 'active' and 'graduated' learners.
-- The 2026-04-23 migration only backfilled 'admitted' status rows.
-- This extends the same logic to the two remaining "filled seat" statuses
-- so the primary FK join in get_seat_analytics works for all three.
--
-- Strategy: match learner's (institution_id, program_id, admission_year integer)
-- to admission_years (institution_id, program_id, program_start_year).
-- Uses the same resolver logic as the original backfill.

UPDATE learners_profiles lp
SET    admission_year_id = ay.id
FROM   admission_years ay
WHERE  lp.admission_year_id IS NULL
  AND  lp.lifecycle_status  IN ('active', 'graduated')
  AND  lp.program_id         IS NOT NULL
  AND  lp.institution_id     IS NOT NULL
  AND  ay.institution_id = lp.institution_id
  AND  ay.program_id     = lp.program_id
  AND  ay.program_start_year = lp.admission_year;

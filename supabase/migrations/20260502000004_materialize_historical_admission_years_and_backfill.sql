-- Migration: 2026-05-02
-- Purpose:
--   Phase A of legacy `learners_profiles.admission_year` integer column retirement.
--   Goal: every learner that has a valid (institution, program, year) tuple is
--   linked to an `admission_years` row via `admission_year_id`, so the integer
--   column can be dropped in a later phase without losing cohort linkage.
--
-- Strategy:
--   1. Materialize the missing `admission_years` cohort rows. Today the table
--      only contains 2026 cohort rows; prior cohorts (2002–2025) were never
--      catalogued, which is why ~2,582 learners cannot currently be linked
--      via FK and rely on the OR-fallback branch in `get_seat_analytics`.
--      For each (institution, program, learner.admission_year) tuple where no
--      row exists, create one with:
--        - sanctioned_intake = 0  (NOT NULL constraint; honest "unknown")
--        - program_end_year  = start + program_duration_yrs (CEIL), default 4
--        - is_active = (year >= 2026)  → only the current cycle is "open"
--        - admission_year_name = "{year}-{year+1}"
--   2. Backfill `learners_profiles.admission_year_id` from the now-complete
--      catalogue.
--
-- Effect on dashboards:
--   `get_seat_analytics` filters `WHERE ay.is_active = true`, so historical
--   rows stay invisible to current-cycle dashboards (correct behaviour). Once
--   Phase C drops the OR-fallback branch, FK linkage from this migration is
--   what keeps cohort scopes working.
--
-- Reversibility:
--   Both steps are read-from-data inserts/updates. To reverse, delete the
--   admission_years rows where `created_at` >= now() AND `sanctioned_intake = 0`
--   AND there are no edits, and clear `admission_year_id` on rows updated.
--   Safer to roll forward.

-- (1) Materialize missing admission_years rows.
INSERT INTO admission_years (
  institution_id,
  program_id,
  program_start_year,
  program_end_year,
  admission_year_name,
  sanctioned_intake,
  is_active
)
SELECT DISTINCT
  lp.institution_id,
  lp.program_id,
  lp.admission_year,
  lp.admission_year + COALESCE(CEIL(p.program_duration_yrs)::int, 4),
  lp.admission_year::text || '-' || (lp.admission_year + 1)::text,
  0,
  (lp.admission_year >= 2026)
FROM learners_profiles lp
JOIN programs p ON p.id = lp.program_id
WHERE lp.admission_year_id IS NULL
  AND lp.admission_year     IS NOT NULL
  AND lp.program_id         IS NOT NULL
  AND lp.institution_id     IS NOT NULL
ON CONFLICT (institution_id, program_id, program_start_year) DO NOTHING;

-- (2) Backfill admission_year_id using the now-complete catalogue.
UPDATE learners_profiles lp
SET    admission_year_id = ay.id
FROM   admission_years ay
WHERE  lp.admission_year_id IS NULL
  AND  lp.admission_year     IS NOT NULL
  AND  lp.program_id         IS NOT NULL
  AND  lp.institution_id     IS NOT NULL
  AND  ay.institution_id     = lp.institution_id
  AND  ay.program_id         = lp.program_id
  AND  ay.program_start_year = lp.admission_year;

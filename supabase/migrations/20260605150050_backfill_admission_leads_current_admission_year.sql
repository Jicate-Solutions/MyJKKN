-- Backfill admission_leads.admission_year_id for leads that have none, to each lead's
-- institution's CURRENT admission year (prefer year = current calendar year; else latest
-- active). Only fills NULLs (never overwrites). Leads whose institution has no admission
-- year (non-academic orgs e.g. vendor/admin entities) correctly stay null.
-- Safe: the only AFTER-UPDATE trigger (log_admission_lead_stage_change) guards on a
-- funnel_stage change, so this admission_year_id-only update fires no side effects.
WITH current_ay AS (
  SELECT DISTINCT ON (institution_id) institution_id, id
  FROM admission_years
  WHERE is_active
  ORDER BY institution_id,
           (year = EXTRACT(year FROM now())::int) DESC,
           year DESC
)
UPDATE admission_leads l
SET admission_year_id = c.id
FROM current_ay c
WHERE l.admission_year_id IS NULL
  AND l.institution_id = c.institution_id;

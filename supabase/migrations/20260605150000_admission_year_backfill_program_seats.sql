-- Admission Year → institution-wide, step 1/4.
-- Move per-(program,year) seat capacity onto the year-agnostic programs row,
-- BEFORE admission_years.sanctioned_intake is dropped (20260605150030 DDL).
-- Take the LATEST year's value per program; only fill where programs has none.
WITH latest AS (
  SELECT DISTINCT ON (ay.program_id) ay.program_id, ay.sanctioned_intake
  FROM admission_years ay
  WHERE ay.sanctioned_intake > 0
  ORDER BY ay.program_id, ay.program_start_year DESC, ay.created_at DESC
)
UPDATE programs p
SET sanctioned_intake = latest.sanctioned_intake,
    updated_at = now()
FROM latest
WHERE p.id = latest.program_id
  AND (p.sanctioned_intake IS NULL OR p.sanctioned_intake = 0);

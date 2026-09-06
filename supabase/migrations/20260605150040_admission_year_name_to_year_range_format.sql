-- Rename admission_years.admission_year_name to the "{year}-{year+1}" academic-range
-- format (e.g. 2026-2027). Name is display-only — analytics and the unique constraint
-- use the `year` column — so this is a safe label-only change.
UPDATE admission_years
SET admission_year_name = year::text || '-' || (year + 1)::text,
    updated_at = now();

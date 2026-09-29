-- ============================================================================
-- Repair learners_profiles.date_of_birth values corrupted by the Excel
-- date sanitiser (2026-09-22). Run in the Supabase SQL editor as postgres.
--
-- Root cause: lib/utils/excel-parser.ts sanitizeValue(..., 'date') handed a
-- STRING Excel serial ("42842") to `new Date("42842")`, which V8 reads as
-- YEAR 42842 and toISOString() emits as "+042842-01-01". The column is text,
-- so that string was stored verbatim. The year IS the serial, so the real
-- date is 1899-12-30 + serial. The same pass also normalises the 24 rows
-- typed as DD.MM.YYYY that the old parser stored raw.
--
-- Safety:
--   • Only touches rows matching the two exact shapes below.
--   • Only writes a result between 1950-01-01 and 2022-12-31; anything else
--     is left untouched and listed by the preview query.
--   • Reversible: serial = new_date - 1899-12-30, so the old string can be
--     rebuilt as '+' || lpad(serial::text, 6, '0') || '-01-01'.
--
-- Step 1 — PREVIEW (run first; nothing is written)
-- ============================================================================
WITH cand AS (
  SELECT id, first_name, institution_id, lifecycle_status, date_of_birth AS old_value,
    CASE
      WHEN date_of_birth ~ '^\+\d{6}-\d{2}-\d{2}$'
        THEN to_char(DATE '1899-12-30' + ltrim(split_part(date_of_birth, '-', 1), '+')::int, 'YYYY-MM-DD')
      WHEN date_of_birth ~ '^\d{1,2}\.\d{1,2}\.\d{4}$'
        THEN to_char(to_date(date_of_birth, 'DD.MM.YYYY'), 'YYYY-MM-DD')
    END AS new_value
  FROM public.learners_profiles
  WHERE date_of_birth ~ '^\+\d{6}-\d{2}-\d{2}$'
     OR date_of_birth ~ '^\d{1,2}\.\d{1,2}\.\d{4}$'
)
SELECT
  CASE WHEN new_value IS NOT NULL AND new_value::date BETWEEN '1950-01-01' AND '2022-12-31'
       THEN 'WILL REPAIR' ELSE 'SKIPPED (manual)' END AS action,
  count(*) AS rows,
  min(new_value) AS min_new, max(new_value) AS max_new
FROM cand
GROUP BY 1;

-- Rows that will be skipped (fix by hand from the admission record):
WITH cand AS (
  SELECT id, first_name, lifecycle_status, date_of_birth AS old_value,
    CASE
      WHEN date_of_birth ~ '^\+\d{6}-\d{2}-\d{2}$'
        THEN to_char(DATE '1899-12-30' + ltrim(split_part(date_of_birth, '-', 1), '+')::int, 'YYYY-MM-DD')
      WHEN date_of_birth ~ '^\d{1,2}\.\d{1,2}\.\d{4}$'
        THEN to_char(to_date(date_of_birth, 'DD.MM.YYYY'), 'YYYY-MM-DD')
    END AS new_value
  FROM public.learners_profiles
  WHERE date_of_birth ~ '^\+\d{6}-\d{2}-\d{2}$'
     OR date_of_birth ~ '^\d{1,2}\.\d{1,2}\.\d{4}$'
)
SELECT id, first_name, lifecycle_status, old_value, new_value
FROM cand
WHERE new_value IS NULL OR new_value::date NOT BETWEEN '1950-01-01' AND '2022-12-31';

-- ============================================================================
-- Step 2 — APPLY (expected: repaired = 476 as of 2026-09-22; 1 row (PRAVIN, recovers to 2024) is skipped)
-- ============================================================================
BEGIN;

WITH cand AS (
  SELECT id, date_of_birth AS old_value,
    CASE
      WHEN date_of_birth ~ '^\+\d{6}-\d{2}-\d{2}$'
        THEN to_char(DATE '1899-12-30' + ltrim(split_part(date_of_birth, '-', 1), '+')::int, 'YYYY-MM-DD')
      WHEN date_of_birth ~ '^\d{1,2}\.\d{1,2}\.\d{4}$'
        THEN to_char(to_date(date_of_birth, 'DD.MM.YYYY'), 'YYYY-MM-DD')
    END AS new_value
  FROM public.learners_profiles
  WHERE date_of_birth ~ '^\+\d{6}-\d{2}-\d{2}$'
     OR date_of_birth ~ '^\d{1,2}\.\d{1,2}\.\d{4}$'
), upd AS (
  UPDATE public.learners_profiles lp
  SET date_of_birth = c.new_value
  FROM cand c
  WHERE c.id = lp.id
    AND c.new_value IS NOT NULL
    AND c.new_value::date BETWEEN '1950-01-01' AND '2022-12-31'
  RETURNING lp.id
)
SELECT count(*) AS repaired FROM upd;

COMMIT;

-- ============================================================================
-- Step 3 — VERIFY (expect 'other' to hold only the manual leftovers)
-- ============================================================================
SELECT
  CASE
    WHEN date_of_birth IS NULL OR date_of_birth = '' THEN 'empty'
    WHEN date_of_birth ~ '^\d{4}-\d{2}-\d{2}$'
         AND date_of_birth::date BETWEEN '1950-01-01' AND '2022-12-31' THEN 'iso-plausible'
    WHEN date_of_birth ~ '^\d{4}-\d{2}-\d{2}$' THEN 'iso-implausible'
    ELSE 'other'
  END AS shape,
  count(*) AS n, min(date_of_birth), max(date_of_birth)
FROM public.learners_profiles
GROUP BY 1 ORDER BY n DESC;

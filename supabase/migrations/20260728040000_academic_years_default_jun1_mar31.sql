-- Academic years: standardise every row on June 1 -> March 31.
--
-- The group convention is a June-start / March-end academic year. Production
-- had drifted into four different shapes: Jun 1->May 31 (26 rows), Nov 1->Oct 31
-- (7 rows, all College of Pharmacy), Jun 4->Apr 30 (both schools) and a handful
-- of arbitrary Jan->Dec ranges on the test/company tenants.
--
-- The NAME is the source of truth for the dates, not the existing range. Two
-- Dental rows ('2022-2023' and '2028-2029') both carried 2026-06-01..2026-06-30,
-- a range that matched neither their own name nor any real calendar; deriving
-- from the name repairs them as a side effect.
--
-- Every academic_year_name is '<YYYY>-<YYYY>', four of them with an
-- ' Additional N' suffix (Dental, all is_active=false). The two leading year
-- groups parse cleanly on all 42 rows, so the regex guard below excludes nothing
-- today -- it is there so a future free-text name cannot be silently mangled
-- into a NULL date against a NOT NULL column.

CREATE TABLE IF NOT EXISTS public.academic_years_dates_rollback_20260728 AS
SELECT id, start_date AS old_start_date, end_date AS old_end_date
FROM public.academic_years;

UPDATE public.academic_years ay
SET start_date = make_date(
      substring(btrim(ay.academic_year_name) from '^(\d{4})')::int, 6, 1),
    end_date = make_date(
      substring(btrim(ay.academic_year_name) from '^\d{4}\s*-\s*(\d{4})')::int, 3, 31),
    updated_at = timezone('utc', now())
WHERE btrim(ay.academic_year_name) ~ '^\d{4}\s*-\s*\d{4}';

-- Rollback:
--   UPDATE public.academic_years ay
--   SET start_date = b.old_start_date, end_date = b.old_end_date
--   FROM public.academic_years_dates_rollback_20260728 b
--   WHERE b.id = ay.id;

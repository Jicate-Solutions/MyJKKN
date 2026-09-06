-- 20260729180000_backfill_historical_admission_years_2020_2025.sql
--
-- Backfill the historical admission-year cohorts (2020..2025) that were never
-- created for most institutions. Before this migration only JKKN Dental College
-- had a contiguous 2020-2026 run; the other institutions started somewhere
-- between 2022 and 2026, and the two schools (Matric Hr Sec, Nattraja Vidhyalya
-- CBSE) had a single 2026 row. Legacy learner/lead imports carrying a 2020-2024
-- year therefore had no cohort to resolve against and fell back to the latest
-- active cohort (see lib/services/admission/resolve-admission-year.ts).
--
-- Three deliberate choices, each of which is load-bearing:
--
--   1. is_active = TRUE. This flag is NOT "is this cohort live" — that is
--      is_current. is_active is dropdown visibility:
--      AdmissionYearService.getAdmissionYearsByInstitution() defaults to
--      includeInactive=false and getAdmissionYearOptions() hardcodes
--      .eq('is_active', true). Inserting these as inactive would make them
--      invisible in every picker, which is the opposite of the intent.
--
--   2. is_current = FALSE, stated explicitly rather than left to the column
--      default. trg_admission_years_single_current is a BEFORE trigger that
--      demotes the institution's existing current cohort whenever NEW.is_current
--      is true. A wrong default here would silently knock every institution off
--      its 2026-2027 cohort and re-point all new leads.
--
--   3. The institution set is derived from "institutions that already have at
--      least one admission year" rather than hardcoded UUIDs. This excludes the
--      three non-academic orgs (Jicate Solutions, JKKN Main Office, Nattraja
--      Incubation Forum) which have zero cohorts by design — an earlier lead
--      backfill deliberately left their leads' admission_year_id null.
--
-- Idempotent: admission_years_institution_year_unique (institution_id, year)
-- backs the ON CONFLICT, so re-running is a no-op.
--
-- Expected effect at authoring time: 40 rows inserted (38 covering 2020-2024
-- plus the 2025 gap for the two schools that only had 2026). admission_years
-- goes 38 -> 78 rows.
--
-- Rollback:
--   DELETE FROM public.admission_years
--    WHERE year BETWEEN 2020 AND 2025
--      AND created_at >= '2026-07-29'::date
--      AND NOT is_current;
--   (learners_profiles / admission_leads FKs are ON DELETE SET NULL, so verify
--    nothing has been linked to these cohorts before running the rollback.)

INSERT INTO public.admission_years (
  institution_id,
  admission_year_name,
  year,
  is_active,
  is_current
)
SELECT
  a.institution_id,
  y.year || '-' || (y.year + 1),  -- matches the existing "2024-2025" convention
  y.year,
  TRUE,
  FALSE
FROM (
  SELECT DISTINCT institution_id FROM public.admission_years
) AS a
CROSS JOIN generate_series(2020, 2025) AS y(year)
ON CONFLICT (institution_id, year) DO NOTHING;

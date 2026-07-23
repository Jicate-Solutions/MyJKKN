-- 20260605104000_fn_learner_year_of_study.sql
-- Canonical "current year of study" for ANY learner (not just hostellers),
-- mirroring the 3-tier derivation in v_learner_hostelites exactly:
--   Tier 1: admission_years.program_start_year / program_end_year  (preferred)
--   Tier 2: batches.start_date / end_date                          (fallback)
--   Tier 3: learners_profiles.enquiry_date                         (last resort)
-- Upper-clamp via LEAST prevents "year 5 of a 4-year programme".
-- Lower-clamp via GREATEST(1, …) prevents negative / zero values.
CREATE OR REPLACE FUNCTION public.fn_learner_year_of_study(p_learner_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE
      WHEN lp.admission_year_id IS NOT NULL AND ay.program_start_year IS NOT NULL
        THEN GREATEST(1, LEAST(
               EXTRACT(year FROM CURRENT_DATE)::integer - ay.program_start_year + 1,
               ay.program_end_year - ay.program_start_year + 1
             ))
      WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL
        THEN GREATEST(1, LEAST(
               EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM b.start_date)::integer + 1,
               EXTRACT(year FROM b.end_date)::integer - EXTRACT(year FROM b.start_date)::integer + 1
             ))
      WHEN lp.enquiry_date IS NOT NULL
        THEN GREATEST(1, EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM lp.enquiry_date)::integer + 1)
      ELSE NULL
    END
  FROM learners_profiles lp
  LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN batches b ON b.id = lp.batch_id
  WHERE lp.id = p_learner_id;
$$;

COMMENT ON FUNCTION public.fn_learner_year_of_study(uuid) IS
  'Returns the current year of study for a learner using the same 3-tier derivation '
  'as v_learner_hostelites: admission_year → batch → enquiry_date. '
  'Clamps to [1, program_duration] so result is always ≥ 1 and never exceeds the programme length.';

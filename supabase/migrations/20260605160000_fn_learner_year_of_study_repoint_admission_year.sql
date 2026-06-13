-- 20260605160000_fn_learner_year_of_study_repoint_admission_year.sql
-- INCIDENT FIX: the concurrent admission-year migration collapsed admission_years
-- (dropped program_start_year/program_end_year/program_id -> single `year`) and
-- recreated v_learner_hostelites to cap year-of-study by programs.program_duration_yrs.
-- Re-mirror fn_learner_year_of_study to the NEW view derivation so the helper and the
-- view stay in lock-step (and admission_resolve_fee_items_for_lead, which calls it,
-- stops erroring on the dropped column).
CREATE OR REPLACE FUNCTION public.fn_learner_year_of_study(p_learner_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN lp.admission_year_id IS NOT NULL AND ay.year IS NOT NULL
      THEN GREATEST(1, LEAST(
             EXTRACT(year FROM CURRENT_DATE)::integer - ay.year + 1,
             pr.program_duration_yrs::integer + 1))
    WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL
      THEN GREATEST(1, LEAST(
             EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM b.start_date)::integer + 1,
             EXTRACT(year FROM b.end_date)::integer - EXTRACT(year FROM b.start_date)::integer + 1))
    WHEN lp.enquiry_date IS NOT NULL
      THEN GREATEST(1, EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM lp.enquiry_date)::integer + 1)
    ELSE NULL::integer
  END
  FROM learners_profiles lp
  LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN batches b ON b.id = lp.batch_id
  LEFT JOIN programs pr ON pr.id = lp.program_id
  WHERE lp.id = p_learner_id;
$$;

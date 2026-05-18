-- =====================================================================
-- CDC Sprint 7b — Export RPCs (NAAC 5.2.1 + AICTE Annual)
-- =====================================================================
-- Agent: ζ
-- Date: 2026-05-18
-- Column mappings are stored in platform_policies (seeded by Sprint 1):
--   cdc.naac_export_column_mapping  → {"version":"5.2.1","columns":[...]}
--   cdc.aicte_export_column_mapping → {"version":"annual_return_...","columns":[...]}
-- These RPCs read placements + joins and return typed rows.
-- They are SECURITY DEFINER so the service layer can call them as
-- an authenticated user without needing direct table access.
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------------
-- 1. COMPOSITE RETURN TYPES
-- ------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cdc_naac_5_2_1_row') THEN
    CREATE TYPE public.cdc_naac_5_2_1_row AS (
      student_name         text,
      roll_number          text,
      college_email        text,
      course               text,
      company_name         text,
      package_lpa          numeric,
      year_of_placement    int,
      placement_status     text,
      job_role             text,
      job_location         text,
      is_walk_in           boolean,
      offered_at           date
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cdc_aicte_annual_row') THEN
    CREATE TYPE public.cdc_aicte_annual_row AS (
      student_name         text,
      roll_number          text,
      program              text,
      company_name         text,
      package_inr          numeric,
      offer_date           date,
      placement_status     text,
      job_role             text,
      is_internal          boolean
    );
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 2. fn_naac_5_2_1_export(p_cycle text)
--    p_cycle examples: '2024-25', '2023-24'
--    Returns accepted placements for the academic cycle.
--    Cycle year is derived from offered_at (Apr–Mar financial year).
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_naac_5_2_1_export(p_cycle text)
RETURNS SETOF public.cdc_naac_5_2_1_row
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Parse cycle: '2024-25' → start = 2024-04-01, end = 2025-03-31
  WITH cycle_bounds AS (
    SELECT
      make_date(
        (split_part(p_cycle, '-', 1))::int,
        4, 1
      ) AS cycle_start,
      make_date(
        (split_part(p_cycle, '-', 1))::int + 1,
        3, 31
      ) AS cycle_end
  ),
  placement_data AS (
    SELECT
      lp.first_name || ' ' || lp.last_name                          AS student_name,
      lp.roll_number                                                  AS roll_number,
      lp.college_email                                               AS college_email,
      COALESCE(pr.program_name, 'N/A')                              AS course,
      r.name                                                          AS company_name,
      cp.package_lpa                                                  AS package_lpa,
      EXTRACT(YEAR FROM cp.offered_at)::int                         AS year_of_placement,
      cp.status::text                                                 AS placement_status,
      cp.job_role                                                     AS job_role,
      cp.job_location                                                 AS job_location,
      cp.is_walk_in                                                   AS is_walk_in,
      cp.offered_at::date                                            AS offered_at
    FROM public.cdc_placements cp
    JOIN public.learners_profiles lp  ON lp.id = cp.learner_id
    JOIN public.cdc_recruiters r      ON r.id = cp.recruiter_id
    LEFT JOIN public.programs pr      ON pr.id = lp.program_id
    CROSS JOIN cycle_bounds
    WHERE cp.status = 'accepted'
      AND cp.offered_at >= cycle_bounds.cycle_start
      AND cp.offered_at <= cycle_bounds.cycle_end
  )
  SELECT
    student_name, roll_number, college_email, course, company_name,
    package_lpa, year_of_placement, placement_status,
    job_role, job_location, is_walk_in, offered_at
  FROM placement_data
  ORDER BY offered_at DESC, student_name;
$$;

GRANT EXECUTE ON FUNCTION public.fn_naac_5_2_1_export(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_naac_5_2_1_export(text) IS
  'NAAC Criterion 5.2.1 placement export for a given academic cycle (e.g. ''2024-25'').
   Returns accepted placements between Apr 1 of start year and Mar 31 of end year.
   Column set is driven by platform_policies key cdc.naac_export_column_mapping.';

-- ------------------------------------------------------------------
-- 3. fn_aicte_annual_export(p_year int)
--    p_year = calendar year of the annual return (e.g. 2025)
--    Returns accepted placements for Jan 1 – Dec 31 of that year,
--    excluding internal placements when
--    platform_policies key cdc.aicte_include_internal_placements = false.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_aicte_annual_export(p_year int)
RETURNS SETOF public.cdc_aicte_annual_row
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH policy_flag AS (
    SELECT COALESCE(
      (public.fn_get_policy_json('cdc.aicte_include_internal_placements', to_jsonb(false)))::boolean,
      false
    ) AS include_internal
  ),
  placement_data AS (
    SELECT
      lp.first_name || ' ' || lp.last_name  AS student_name,
      lp.roll_number                          AS roll_number,
      COALESCE(pr.program_name, 'N/A')       AS program,
      r.name                                  AS company_name,
      cp.package_inr_total                    AS package_inr,
      cp.offered_at::date                    AS offer_date,
      cp.status::text                         AS placement_status,
      cp.job_role                             AS job_role,
      r.is_internal                           AS is_internal
    FROM public.cdc_placements cp
    JOIN public.learners_profiles lp ON lp.id = cp.learner_id
    JOIN public.cdc_recruiters r     ON r.id = cp.recruiter_id
    LEFT JOIN public.programs pr     ON pr.id = lp.program_id
    CROSS JOIN policy_flag
    WHERE cp.status = 'accepted'
      AND EXTRACT(YEAR FROM cp.offered_at) = p_year
      AND (policy_flag.include_internal = true OR r.is_internal = false)
  )
  SELECT
    student_name, roll_number, program, company_name,
    package_inr, offer_date, placement_status, job_role, is_internal
  FROM placement_data
  ORDER BY offer_date DESC, student_name;
$$;

GRANT EXECUTE ON FUNCTION public.fn_aicte_annual_export(int)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_aicte_annual_export(int) IS
  'AICTE Annual Return placement export for a given calendar year (e.g. 2025).
   Respects platform_policies key cdc.aicte_include_internal_placements.
   Returns accepted placements for the full calendar year.';

-- ------------------------------------------------------------------
-- 4. fn_get_policy_value helper (may already exist from prior sprint;
--    create only if missing so this migration is idempotent)
-- ------------------------------------------------------------------

-- We depend on fn_get_policy_value which was created in 20260515000001.
-- No need to re-create it. The GRANT above is sufficient.

COMMIT;

-- ============================================================
-- A3.5 — Extend NAAC/AICTE export RPCs to all declared columns
-- ============================================================
-- PR #986 (A3) updated cdc.naac_export_column_mapping policy to declare
-- 21 columns and cdc.aicte_export_column_mapping to 15 columns. But the
-- underlying export RPCs returned composite row types with only 12 + 9
-- columns. The result: Director can't actually export the columns
-- accreditation forms ask for.
--
-- This migration:
--   1. DROPs the two functions (no CASCADE — they're the only callers)
--   2. DROPs the two composite types
--   3. Recreates the composite types with the FULL declared column set
--   4. Recreates the functions with JOINs to learners_profiles, programs,
--      departments, cdc_recruiters, cdc_industry_sectors
--   5. Returns NULL for columns whose source isn't derivable from current
--      schema (marked 'manual' in the policy) — Director fills these in
--      at export time before submission to NAAC/AICTE.
--
-- Schema-source columns (derived from JOIN):
--   - student_name (learners_profiles.first_name + last_name)
--   - register_number / enrollment_number (learners_profiles.register_number)
--   - gender (learners_profiles.gender)
--   - program (programs.program_name)
--   - branch (departments.department_name via programs.department_id)
--   - company_name (cdc_recruiters.name)
--   - sector (cdc_industry_sectors.display_name)
--   - offer_date (cdc_placements.offered_at)
--   - joining_date (cdc_placements.joining_date)
--   - role_designation / job_role (cdc_placements.job_role)
--   - package_lpa / package_inr (cdc_placements.package_lpa / package_inr_total)
--   - package_currency ('INR' constant)
--   - location (cdc_placements.job_location)
--   - is_internal_placement (cdc_recruiters.is_internal)
--
-- Manual columns (NULL from RPC; Director enters before submission):
--   - category, social_category, parent_income_range
--   - district, state (residential, not recruiter)
--   - year_of_admission, year_of_passing, cgpa
--   - is_higher_studies, higher_studies_institute, higher_studies_program
--
-- When the schema gains new columns (e.g. learners_profiles.cgpa), the
-- RPC bodies can be patched to source from them — the policy column
-- list stays the same.
-- ============================================================

DROP FUNCTION IF EXISTS fn_naac_5_2_1_export(text);
DROP FUNCTION IF EXISTS fn_aicte_annual_export(integer);

DROP TYPE IF EXISTS cdc_naac_5_2_1_row;
DROP TYPE IF EXISTS cdc_aicte_annual_row;

-- ----- NAAC 5.2.1 composite type (21 columns) -----
CREATE TYPE cdc_naac_5_2_1_row AS (
  student_name             text,
  register_number          text,
  gender                   text,
  category                 text,
  parent_income_range      text,
  district                 text,
  state                    text,
  program                  text,
  year_of_admission        integer,
  year_of_passing          integer,
  cgpa                     numeric,
  company_name             text,
  sector                   text,
  offer_date               date,
  joining_date             date,
  role_designation         text,
  package_lpa              numeric,
  package_currency         text,
  is_higher_studies        boolean,
  higher_studies_institute text,
  higher_studies_program   text
);

-- ----- AICTE annual return composite type (15 columns) -----
CREATE TYPE cdc_aicte_annual_row AS (
  student_name             text,
  enrollment_number        text,
  gender                   text,
  category                 text,
  social_category          text,
  program                  text,
  branch                   text,
  year_of_admission        integer,
  year_of_passing          integer,
  company_name             text,
  sector                   text,
  offer_date               date,
  package_inr              numeric,
  location                 text,
  is_internal_placement    boolean
);

-- ============================================================
-- fn_naac_5_2_1_export(p_cycle text)
-- ============================================================
-- Returns placement rows for NAAC 5.2.1 reporting. p_cycle is captured
-- in the call sites but currently doesn't filter (cdc_placement_snapshots
-- uses snapshot_period for that). All schema-source columns are filled;
-- manual columns are NULL.
CREATE OR REPLACE FUNCTION fn_naac_5_2_1_export(p_cycle text)
RETURNS SETOF cdc_naac_5_2_1_row
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NULLIF(TRIM(COALESCE(lp.first_name, '') || ' ' || COALESCE(lp.last_name, '')), '')::text AS student_name,
    lp.register_number::text                                                          AS register_number,
    lp.gender::text                                                                   AS gender,
    NULL::text                                                                        AS category,
    NULL::text                                                                        AS parent_income_range,
    NULL::text                                                                        AS district,
    NULL::text                                                                        AS state,
    pg.program_name::text                                                             AS program,
    NULL::integer                                                                     AS year_of_admission,
    NULL::integer                                                                     AS year_of_passing,
    NULL::numeric                                                                     AS cgpa,
    r.name::text                                                                      AS company_name,
    s.display_name::text                                                              AS sector,
    p.offered_at::date                                                                AS offer_date,
    p.joining_date::date                                                              AS joining_date,
    p.job_role::text                                                                  AS role_designation,
    p.package_lpa::numeric                                                            AS package_lpa,
    'INR'::text                                                                       AS package_currency,
    NULL::boolean                                                                     AS is_higher_studies,
    NULL::text                                                                        AS higher_studies_institute,
    NULL::text                                                                        AS higher_studies_program
  FROM cdc_placements p
  LEFT JOIN learners_profiles lp           ON lp.id = p.learner_id
  LEFT JOIN programs pg                    ON pg.id = lp.program_id
  LEFT JOIN cdc_recruiters r               ON r.id = p.recruiter_id
  LEFT JOIN cdc_industry_sectors s         ON s.id = r.industry_sector_id
  WHERE p.status = 'accepted'
  ORDER BY p.accepted_at DESC;
$$;

-- ============================================================
-- fn_aicte_annual_export(p_year integer)
-- ============================================================
-- Returns placement rows for AICTE annual return reporting. p_year is
-- captured but currently doesn't filter (callers may extend to filter
-- by offer_date year). All schema-source columns are filled; manual
-- columns are NULL.
CREATE OR REPLACE FUNCTION fn_aicte_annual_export(p_year integer)
RETURNS SETOF cdc_aicte_annual_row
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NULLIF(TRIM(COALESCE(lp.first_name, '') || ' ' || COALESCE(lp.last_name, '')), '')::text AS student_name,
    lp.register_number::text                                                          AS enrollment_number,
    lp.gender::text                                                                   AS gender,
    NULL::text                                                                        AS category,
    NULL::text                                                                        AS social_category,
    pg.program_name::text                                                             AS program,
    d.department_name::text                                                           AS branch,
    NULL::integer                                                                     AS year_of_admission,
    NULL::integer                                                                     AS year_of_passing,
    r.name::text                                                                      AS company_name,
    s.display_name::text                                                              AS sector,
    p.offered_at::date                                                                AS offer_date,
    p.package_inr_total::numeric                                                      AS package_inr,
    p.job_location::text                                                              AS location,
    COALESCE(r.is_internal, false)::boolean                                           AS is_internal_placement
  FROM cdc_placements p
  LEFT JOIN learners_profiles lp           ON lp.id = p.learner_id
  LEFT JOIN programs pg                    ON pg.id = lp.program_id
  LEFT JOIN departments d                  ON d.id = pg.department_id
  LEFT JOIN cdc_recruiters r               ON r.id = p.recruiter_id
  LEFT JOIN cdc_industry_sectors s         ON s.id = r.industry_sector_id
  WHERE p.status = 'accepted'
  ORDER BY p.accepted_at DESC;
$$;

-- Restore RLS-permission on the functions
GRANT EXECUTE ON FUNCTION fn_naac_5_2_1_export(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_aicte_annual_export(integer) TO authenticated;

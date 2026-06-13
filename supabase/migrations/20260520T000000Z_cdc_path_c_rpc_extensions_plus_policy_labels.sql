-- ============================================================
-- R5.A — Path C: Extend NAAC/AICTE export RPCs + fix policy labels
-- ============================================================
-- T2.4 audit (PR #1015, docs/audit/cdc-export-manual-columns-2026-05-19.md)
-- found 11 of 14 currently-NULL "manual" columns are actually derivable
-- today via deeper JOINs. Plus platform_policies mislabels several columns:
--   - source='manual' when RPC derives them
--   - source='schema' when RPC returns NULL
--
-- This migration:
--   1. Replaces the two RPC bodies (fn_naac_5_2_1_export, fn_aicte_annual_export)
--      with deeper LEFT JOINs that pull from learners_profiles +
--      community_categories + admission_years + alumni_outcomes.
--   2. Updates platform_policies value JSONB for the two export column-mapping
--      rows to correct policy-vs-reality drift.
--
-- WHAT DOES NOT CHANGE
-- --------------------
--   - cdc_naac_5_2_1_row composite type (still 21 columns)
--   - cdc_aicte_annual_row composite type (still 15 columns)
--   - cdc_placements schema
--   - learners_profiles schema (no new columns)
--   - /cdc/exports UI (consumes JSONB; will automatically reflect new labels)
--   - RLS policies
--
-- COLUMN COVERAGE CHANGES (from T2.4 audit)
-- -----------------------------------------
-- NAAC additions (was NULL, now derived):
--   - category                  ← community_categories.name via FK (95.4 %)
--   - district                  ← learners_profiles.permanent_address_district (90.7 %)
--   - state                     ← learners_profiles.permanent_address_state (90.5 %)
--   - year_of_admission         ← admission_years.program_start_year (59 % FK cov)
--   - year_of_passing           ← admission_years.program_end_year (59 % FK cov)
--   - is_higher_studies         ← alumni_outcomes.outcome_type='higher_studies' (0 % today)
--   - higher_studies_institute  ← alumni_outcomes.institution_name (0 % today)
--   - higher_studies_program    ← alumni_outcomes.course_name (0 % today)
--
-- AICTE additions:
--   - category                  ← same as NAAC
--   - social_category           ← CASE-mapped from community_categories.code
--                                 sc→SC, st→ST, bc/bcm/mbc/bc_cc→OBC, oc/n/a→GEN
--   - year_of_admission         ← admission_years.program_start_year
--   - year_of_passing           ← admission_years.program_end_year
--
-- STILL MANUAL (out of scope this PR; flagged as follow-up):
--   - NAAC cgpa                — no source column anywhere
--   - NAAC parent_income_range — raw annual_income text exists but needs
--                                bucketing logic + bucket-boundary decision
--
-- VERIFIED PRE-APPLY (Management API, 2026-05-19)
-- -----------------------------------------------
--   learners_profiles.community_category_id       (uuid)   — confirmed
--   learners_profiles.permanent_address_district  (text)   — confirmed
--   learners_profiles.permanent_address_state     (text)   — confirmed
--   learners_profiles.admission_year_id           (uuid)   — confirmed
--   community_categories.code, .name              (text)   — confirmed
--   admission_years.program_start_year/_end_year  (int)    — confirmed
--   alumni_outcomes.outcome_type='higher_studies' (enum)   — confirmed
--   alumni_outcomes.institution_name, .course_name (varchar) — confirmed
-- ============================================================

BEGIN;

-- ============================================================
-- Part 1 — Extend RPC bodies with deeper JOINs
-- ============================================================
--
-- The composite TYPES (cdc_naac_5_2_1_row, cdc_aicte_annual_row) keep their
-- A3.5 shapes (21 cols + 15 cols). Only the SELECT bodies change.

-- ----- NAAC 5.2.1 export (now derives 8 previously-NULL columns) -----
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
    cc.name::text                                                                     AS category,
    NULL::text                                                                        AS parent_income_range,
    lp.permanent_address_district::text                                               AS district,
    lp.permanent_address_state::text                                                  AS state,
    pg.program_name::text                                                             AS program,
    ay.program_start_year::integer                                                    AS year_of_admission,
    ay.program_end_year::integer                                                      AS year_of_passing,
    NULL::numeric                                                                     AS cgpa,
    r.name::text                                                                      AS company_name,
    s.display_name::text                                                              AS sector,
    p.offered_at::date                                                                AS offer_date,
    p.joining_date::date                                                              AS joining_date,
    p.job_role::text                                                                  AS role_designation,
    p.package_lpa::numeric                                                            AS package_lpa,
    'INR'::text                                                                       AS package_currency,
    (ao.id IS NOT NULL)::boolean                                                      AS is_higher_studies,
    ao.institution_name::text                                                         AS higher_studies_institute,
    NULLIF(TRIM(COALESCE(ao.course_name, '') ||
                CASE WHEN ao.specialization IS NOT NULL AND ao.specialization <> ''
                     THEN ' - ' || ao.specialization
                     ELSE '' END), '')::text                                          AS higher_studies_program
  FROM cdc_placements p
  LEFT JOIN learners_profiles lp           ON lp.id = p.learner_id
  LEFT JOIN programs pg                    ON pg.id = lp.program_id
  LEFT JOIN cdc_recruiters r               ON r.id = p.recruiter_id
  LEFT JOIN cdc_industry_sectors s         ON s.id = r.industry_sector_id
  LEFT JOIN community_categories cc        ON cc.id = lp.community_category_id
  LEFT JOIN admission_years ay             ON ay.id = lp.admission_year_id
  LEFT JOIN alumni_outcomes ao             ON ao.learner_id = lp.id
                                          AND ao.outcome_type = 'higher_studies'
  WHERE p.status = 'accepted'
  ORDER BY p.accepted_at DESC;
$$;

-- ----- AICTE annual return export (now derives 4 previously-NULL columns) -----
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
    cc.name::text                                                                     AS category,
    CASE
      WHEN cc.code IN ('sc')                       THEN 'SC'
      WHEN cc.code IN ('st')                       THEN 'ST'
      WHEN cc.code IN ('bc','bcm','mbc','bc_cc')   THEN 'OBC'
      WHEN cc.code IN ('oc','not_applicable')      THEN 'GEN'
      WHEN cc.code IN ('sca','dnc','dnt')          THEN 'OBC'
      ELSE NULL
    END::text                                                                         AS social_category,
    pg.program_name::text                                                             AS program,
    d.department_name::text                                                           AS branch,
    ay.program_start_year::integer                                                    AS year_of_admission,
    ay.program_end_year::integer                                                      AS year_of_passing,
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
  LEFT JOIN community_categories cc        ON cc.id = lp.community_category_id
  LEFT JOIN admission_years ay             ON ay.id = lp.admission_year_id
  WHERE p.status = 'accepted'
  ORDER BY p.accepted_at DESC;
$$;

-- Re-grant EXECUTE (idempotent; previous grants survive CREATE OR REPLACE, but
-- explicit grant is documentation that the RPC is meant to be RLS-callable).
GRANT EXECUTE ON FUNCTION fn_naac_5_2_1_export(text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_aicte_annual_export(integer) TO authenticated;

-- ============================================================
-- Part 2 — Correct platform_policies labels to match new reality
-- ============================================================
--
-- NAAC mapping — bump version to 5.2.1_pathc; flip 8 column source labels:
--   manual → schema: district, state, year_of_admission, year_of_passing,
--                    sector, package_currency, is_higher_studies,
--                    higher_studies_institute, higher_studies_program
--   schema (was already correct, RPC now actually delivers): category
--   stays manual: parent_income_range (bucketing TODO), cgpa (no source)

UPDATE platform_policies
SET value = jsonb_build_object(
  'version', '5.2.1_pathc',
  'updated_at', '2026-05-20',
  'columns', jsonb_build_array(
    jsonb_build_object('name', 'student_name',              'label', 'Student Name',                  'source', 'schema'),
    jsonb_build_object('name', 'register_number',           'label', 'Register / Roll Number',        'source', 'schema'),
    jsonb_build_object('name', 'gender',                    'label', 'Gender',                        'source', 'schema'),
    jsonb_build_object('name', 'category',                  'label', 'Category (community)',          'source', 'schema'),
    jsonb_build_object('name', 'parent_income_range',       'label', 'Parent Income Range',           'source', 'manual'),
    jsonb_build_object('name', 'district',                  'label', 'District',                      'source', 'schema'),
    jsonb_build_object('name', 'state',                     'label', 'State',                         'source', 'schema'),
    jsonb_build_object('name', 'program',                   'label', 'Program / Course',              'source', 'schema'),
    jsonb_build_object('name', 'year_of_admission',         'label', 'Year of Admission',             'source', 'schema'),
    jsonb_build_object('name', 'year_of_passing',           'label', 'Year of Passing',               'source', 'schema'),
    jsonb_build_object('name', 'cgpa',                      'label', 'CGPA',                          'source', 'manual'),
    jsonb_build_object('name', 'company_name',              'label', 'Company Name',                  'source', 'schema'),
    jsonb_build_object('name', 'sector',                    'label', 'Sector',                        'source', 'schema'),
    jsonb_build_object('name', 'offer_date',                'label', 'Offer Date',                    'source', 'schema'),
    jsonb_build_object('name', 'joining_date',              'label', 'Joining Date',                  'source', 'schema'),
    jsonb_build_object('name', 'role_designation',          'label', 'Role / Designation',            'source', 'schema'),
    jsonb_build_object('name', 'package_lpa',               'label', 'Package (LPA)',                 'source', 'schema'),
    jsonb_build_object('name', 'package_currency',          'label', 'Package Currency',              'source', 'schema'),
    jsonb_build_object('name', 'is_higher_studies',         'label', 'Higher Studies?',               'source', 'schema'),
    jsonb_build_object('name', 'higher_studies_institute',  'label', 'Higher Studies Institute',      'source', 'schema'),
    jsonb_build_object('name', 'higher_studies_program',    'label', 'Higher Studies Program',        'source', 'schema')
  )
)
WHERE policy_key = 'cdc.naac_export_column_mapping';

-- AICTE mapping — bump version; flip 5 column source labels:
--   manual → schema: branch, year_of_admission, year_of_passing, sector
--   schema (was already labeled correctly; RPC now actually delivers):
--     category, social_category

UPDATE platform_policies
SET value = jsonb_build_object(
  'version', 'annual_return_2025_26_pathc',
  'updated_at', '2026-05-20',
  'columns', jsonb_build_array(
    jsonb_build_object('name', 'student_name',              'label', 'Student Name',                  'source', 'schema'),
    jsonb_build_object('name', 'enrollment_number',         'label', 'Enrollment Number',             'source', 'schema'),
    jsonb_build_object('name', 'gender',                    'label', 'Gender',                        'source', 'schema'),
    jsonb_build_object('name', 'category',                  'label', 'Category',                      'source', 'schema'),
    jsonb_build_object('name', 'social_category',           'label', 'Social Category (SC/ST/OBC/GEN)','source', 'schema'),
    jsonb_build_object('name', 'program',                   'label', 'Program',                       'source', 'schema'),
    jsonb_build_object('name', 'branch',                    'label', 'Branch / Discipline',           'source', 'schema'),
    jsonb_build_object('name', 'year_of_admission',         'label', 'Year of Admission',             'source', 'schema'),
    jsonb_build_object('name', 'year_of_passing',           'label', 'Year of Passing',               'source', 'schema'),
    jsonb_build_object('name', 'company_name',              'label', 'Company Name',                  'source', 'schema'),
    jsonb_build_object('name', 'sector',                    'label', 'Sector',                        'source', 'schema'),
    jsonb_build_object('name', 'offer_date',                'label', 'Offer Date',                    'source', 'schema'),
    jsonb_build_object('name', 'package_inr',               'label', 'Package (INR)',                 'source', 'schema'),
    jsonb_build_object('name', 'location',                  'label', 'Job Location',                  'source', 'schema'),
    jsonb_build_object('name', 'is_internal_placement',     'label', 'Internal Placement?',           'source', 'schema')
  )
)
WHERE policy_key = 'cdc.aicte_export_column_mapping';

-- Verification — fail loud per CLAUDE.md if policy rows missing
DO $$
DECLARE
  v_naac_count int;
  v_aicte_count int;
  v_naac_version text;
  v_aicte_version text;
BEGIN
  SELECT jsonb_array_length(value->'columns'), value->>'version'
  INTO v_naac_count, v_naac_version
  FROM platform_policies
  WHERE policy_key = 'cdc.naac_export_column_mapping';

  SELECT jsonb_array_length(value->'columns'), value->>'version'
  INTO v_aicte_count, v_aicte_version
  FROM platform_policies
  WHERE policy_key = 'cdc.aicte_export_column_mapping';

  IF v_naac_count IS NULL THEN
    RAISE EXCEPTION 'cdc.naac_export_column_mapping row missing';
  END IF;
  IF v_aicte_count IS NULL THEN
    RAISE EXCEPTION 'cdc.aicte_export_column_mapping row missing';
  END IF;
  IF v_naac_count <> 21 THEN
    RAISE EXCEPTION 'NAAC column count drift — expected 21, got %', v_naac_count;
  END IF;
  IF v_aicte_count <> 15 THEN
    RAISE EXCEPTION 'AICTE column count drift — expected 15, got %', v_aicte_count;
  END IF;
  IF v_naac_version <> '5.2.1_pathc' THEN
    RAISE EXCEPTION 'NAAC version did not bump — got %', v_naac_version;
  END IF;
  IF v_aicte_version <> 'annual_return_2025_26_pathc' THEN
    RAISE EXCEPTION 'AICTE version did not bump — got %', v_aicte_version;
  END IF;
END;
$$;

COMMIT;

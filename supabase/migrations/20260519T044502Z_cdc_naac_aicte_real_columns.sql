-- ============================================================================
-- CDC — Real NAAC 5.2.1 and AICTE Annual Return column mappings (A3)
-- ============================================================================
--
-- WHAT THIS DOES
-- --------------
-- Replaces placeholder 5-column lists on two platform_policies rows with the
-- full column lists required by:
--
--   * NAAC 5.2.1 (placement reporting, SSR Criterion 5.2.1)  — 21 columns
--   * AICTE Annual Return 2025-26 (placement section)        — 15 columns
--
-- These policies are intent/template metadata used by the export hub at
--   /admin/cdc/policies   (read by /cdc/exports for column-list display + audit)
--
-- The actual export CSV/XLSX is produced by two SQL RPCs:
--   * public.fn_naac_5_2_1_export(p_cycle text)
--   * public.fn_aicte_annual_export(p_year integer)
--
-- Today the RPCs return a narrower row shape (12 NAAC cols / 9 AICTE cols)
-- than the full accreditation templates. The column-mapping policy declares
-- the FULL template; columns marked source='manual' in the mapping are not
-- yet derived from cdc_placements / learners_profiles and must be filled in
-- by the Director before submission (or, in a later sprint, the RPC bodies
-- + composite row types can be extended to populate them automatically).
--
-- IF NAAC 5.2.1 OR AICTE TEMPLATE CHANGES AGAIN
-- ---------------------------------------------
-- Edit the JSONB at /admin/cdc/policies — zero deploys. The policy versions
-- below ('5.2.1' / 'annual_return_2025_26') should bump alongside any change.
--
-- DOES NOT TOUCH
-- --------------
--   - cdc_placements schema
--   - any cdc_* table
--   - the /admin/cdc/policies page UI logic
--   - the export RPC function bodies
--   - the cdc_naac_5_2_1_row / cdc_aicte_annual_row composite types
--
-- The substrate migration (20260518_cdc_substrate_01) seeded the placeholder
-- values; this migration is the first real-template swap.
--
-- VERIFIED PRE-APPLY
-- ------------------
-- SELECT policy_key, value FROM platform_policies
-- WHERE policy_key IN ('cdc.naac_export_column_mapping',
--                      'cdc.aicte_export_column_mapping');
-- → both rows present with placeholder 5-column lists (verified 2026-05-19).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- NAAC 5.2.1 — 20-column placement template
-- Source notes per column:
--   schema = derived from cdc_placements + learners_profiles (+ joins) today
--   manual = not yet derivable from current schema; Director fills before submit
-- ---------------------------------------------------------------------------
UPDATE platform_policies
SET value = jsonb_build_object(
  'version', '5.2.1',
  'updated_at', '2026-05-19',
  'columns', jsonb_build_array(
    jsonb_build_object('name', 'student_name',              'label', 'Student Name',                  'source', 'schema'),
    jsonb_build_object('name', 'register_number',           'label', 'Register / Roll Number',        'source', 'schema'),
    jsonb_build_object('name', 'gender',                    'label', 'Gender',                        'source', 'schema'),
    jsonb_build_object('name', 'category',                  'label', 'Category (community)',          'source', 'schema'),
    jsonb_build_object('name', 'parent_income_range',       'label', 'Parent Income Range',           'source', 'schema'),
    jsonb_build_object('name', 'district',                  'label', 'District',                      'source', 'manual'),
    jsonb_build_object('name', 'state',                     'label', 'State',                         'source', 'manual'),
    jsonb_build_object('name', 'program',                   'label', 'Program / Course',              'source', 'schema'),
    jsonb_build_object('name', 'year_of_admission',         'label', 'Year of Admission',             'source', 'manual'),
    jsonb_build_object('name', 'year_of_passing',           'label', 'Year of Passing',               'source', 'manual'),
    jsonb_build_object('name', 'cgpa',                      'label', 'CGPA',                          'source', 'manual'),
    jsonb_build_object('name', 'company_name',              'label', 'Company Name',                  'source', 'schema'),
    jsonb_build_object('name', 'sector',                    'label', 'Sector',                        'source', 'manual'),
    jsonb_build_object('name', 'offer_date',                'label', 'Offer Date',                    'source', 'schema'),
    jsonb_build_object('name', 'joining_date',              'label', 'Joining Date',                  'source', 'schema'),
    jsonb_build_object('name', 'role_designation',          'label', 'Role / Designation',            'source', 'schema'),
    jsonb_build_object('name', 'package_lpa',               'label', 'Package (LPA)',                 'source', 'schema'),
    jsonb_build_object('name', 'package_currency',          'label', 'Package Currency',              'source', 'manual'),
    jsonb_build_object('name', 'is_higher_studies',         'label', 'Higher Studies?',               'source', 'manual'),
    jsonb_build_object('name', 'higher_studies_institute',  'label', 'Higher Studies Institute',      'source', 'manual'),
    jsonb_build_object('name', 'higher_studies_program',    'label', 'Higher Studies Program',        'source', 'manual')
  )
)
WHERE policy_key = 'cdc.naac_export_column_mapping';

-- ---------------------------------------------------------------------------
-- AICTE Annual Return 2025-26 — 15-column placement template
-- ---------------------------------------------------------------------------
UPDATE platform_policies
SET value = jsonb_build_object(
  'version', 'annual_return_2025_26',
  'updated_at', '2026-05-19',
  'columns', jsonb_build_array(
    jsonb_build_object('name', 'student_name',              'label', 'Student Name',                  'source', 'schema'),
    jsonb_build_object('name', 'enrollment_number',         'label', 'Enrollment Number',             'source', 'schema'),
    jsonb_build_object('name', 'gender',                    'label', 'Gender',                        'source', 'schema'),
    jsonb_build_object('name', 'category',                  'label', 'Category',                      'source', 'schema'),
    jsonb_build_object('name', 'social_category',           'label', 'Social Category (SC/ST/OBC/GEN)','source', 'schema'),
    jsonb_build_object('name', 'program',                   'label', 'Program',                       'source', 'schema'),
    jsonb_build_object('name', 'branch',                    'label', 'Branch / Discipline',           'source', 'manual'),
    jsonb_build_object('name', 'year_of_admission',         'label', 'Year of Admission',             'source', 'manual'),
    jsonb_build_object('name', 'year_of_passing',           'label', 'Year of Passing',               'source', 'manual'),
    jsonb_build_object('name', 'company_name',              'label', 'Company Name',                  'source', 'schema'),
    jsonb_build_object('name', 'sector',                    'label', 'Sector',                        'source', 'manual'),
    jsonb_build_object('name', 'offer_date',                'label', 'Offer Date',                    'source', 'schema'),
    jsonb_build_object('name', 'package_inr',               'label', 'Package (INR)',                 'source', 'schema'),
    jsonb_build_object('name', 'location',                  'label', 'Job Location',                  'source', 'schema'),
    jsonb_build_object('name', 'is_internal_placement',     'label', 'Internal Placement?',           'source', 'schema')
  )
)
WHERE policy_key = 'cdc.aicte_export_column_mapping';

-- Verification probe (raises if either row missing — fail-loud per CLAUDE.md)
DO $$
DECLARE
  v_naac_count int;
  v_aicte_count int;
BEGIN
  SELECT jsonb_array_length(value->'columns')
  INTO v_naac_count
  FROM platform_policies
  WHERE policy_key = 'cdc.naac_export_column_mapping';

  SELECT jsonb_array_length(value->'columns')
  INTO v_aicte_count
  FROM platform_policies
  WHERE policy_key = 'cdc.aicte_export_column_mapping';

  IF v_naac_count IS NULL THEN
    RAISE EXCEPTION 'cdc.naac_export_column_mapping row missing — substrate migration not applied?';
  END IF;
  IF v_aicte_count IS NULL THEN
    RAISE EXCEPTION 'cdc.aicte_export_column_mapping row missing — substrate migration not applied?';
  END IF;
  IF v_naac_count <> 21 THEN
    RAISE EXCEPTION 'NAAC column count mismatch — expected 21, got %', v_naac_count;
  END IF;
  IF v_aicte_count <> 15 THEN
    RAISE EXCEPTION 'AICTE column count mismatch — expected 15, got %', v_aicte_count;
  END IF;
END;
$$;

COMMIT;

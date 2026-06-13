-- ============================================================================
-- Migration: 20260603_hr_roles_academic_seeds
-- Wave 3 — M2: Roles + academic + teaching artifacts (3 policies × 2 institutions = 6 rows)
-- ============================================================================
-- Policies seeded:
--   1. hr.roles_responsibilities — scope=institution; 14 designations per inst (placeholders)
--   2. hr.academic_scope          — scope=institution (was global; per Director lock 2026-05-15)
--   3. hr.teaching_artifacts      — scope=institution (was global; per Director lock 2026-05-15)
--
-- Director-lock summary (see specs/hr-policy-jsonb-structures-2026-05-15.md):
--   - ALL configs per-institution by default; 6-month identical-detection job
--     auto-promotes to global with Director confirmation.
--   - Default classification='major' (Director-only edit); CAO can edit
--     rows where classification='operational'.
--   - Default publication_state='published'; admin UI flips to draft_pending.
--
-- W3-M0 dependency: this migration assumes the `classification`,
-- `draft_value`, `publication_state` columns from
-- 20260601_hr_policy_substrate_extensions.sql have been applied. They have
-- sensible defaults so INSERT-without-those-columns is safe.
--
-- Institution UUIDs (sourced from 20260422_privilege_groups_dynamic_source.sql):
--   - ENGG:   5de4fba1-4564-41ed-8c73-5d948b74b843  (JKKN College of Engineering and Technology)
--   - DENTAL: e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5  (JKKN Dental College and Hospital)
--
-- Idempotent via ON CONFLICT against uq_platform_policies_key_scope.
-- TIER-0 safe-additive. Inline DO $$ smoke test at the bottom.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. hr.roles_responsibilities — Engineering
-- 14 designations; responsibilities seeded as ["TBD - Director input pending"]
-- so admin UI loads with editable cards. Director replaces via
-- /admin/hr/policies/roles-responsibilities page after Wave 3 ships.
-- ----------------------------------------------------------------------------
INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system)
VALUES
('hr.roles_responsibilities', 'institution',
 '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
 jsonb_build_object(
   'designations', jsonb_build_array(
     jsonb_build_object(
       'role_code', 'principal_iqac_chairman',
       'title', 'Principal',
       'aliases', jsonb_build_array('IQAC Chairman'),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'managing_director',
       'direct_reports', jsonb_build_array('vice_principal_iqac_coordinator', 'hod'),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'vice_principal_iqac_coordinator',
       'title', 'Vice Principal',
       'aliases', jsonb_build_array('IQAC Coordinator'),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'principal_iqac_chairman',
       'direct_reports', jsonb_build_array('hod'),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'hod',
       'title', 'Head of Department',
       'aliases', jsonb_build_array('HOD'),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'vice_principal_iqac_coordinator',
       'direct_reports', jsonb_build_array('professor', 'associate_professor', 'assistant_professor'),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'professor',
       'title', 'Professor',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'hod',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'associate_professor',
       'title', 'Associate Professor',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'hod',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'assistant_professor',
       'title', 'Assistant Professor',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'hod',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'administrative_officer',
       'title', 'Administrative Officer',
       'aliases', jsonb_build_array('AO'),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'principal_iqac_chairman',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'physical_educator',
       'title', 'Physical Educator',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'principal_iqac_chairman',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'exam_cell_in_charge',
       'title', 'Exam Cell In-Charge',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'principal_iqac_chairman',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'lab_in_charge',
       'title', 'Lab In-Charge',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'hod',
       'direct_reports', jsonb_build_array('lab_technician'),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'lab_technician',
       'title', 'Lab Technician',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'lab_in_charge',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'librarian',
       'title', 'Librarian',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'principal_iqac_chairman',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'placement_officer',
       'title', 'Placement Officer',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'principal_iqac_chairman',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'office_assistant',
       'title', 'Office Assistant',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('engineering'),
       'reports_to', 'administrative_officer',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     )
   )
 ),
 'Designation hierarchy + per-role responsibilities for Engineering institution. Edit via /admin/hr/policies/roles-responsibilities.',
 'object', true),

-- ----------------------------------------------------------------------------
-- 2. hr.roles_responsibilities — Dental
-- Mostly same shape as Engineering, with controller_of_examiner instead of
-- exam_cell_in_charge (Dental nomenclature per spec §2).
-- ----------------------------------------------------------------------------
('hr.roles_responsibilities', 'institution',
 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
 jsonb_build_object(
   'designations', jsonb_build_array(
     jsonb_build_object(
       'role_code', 'principal_iqac_chairman',
       'title', 'Principal',
       'aliases', jsonb_build_array('IQAC Chairman'),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'managing_director',
       'direct_reports', jsonb_build_array('vice_principal_iqac_coordinator', 'hod'),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'vice_principal_iqac_coordinator',
       'title', 'Vice Principal',
       'aliases', jsonb_build_array('IQAC Coordinator'),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'principal_iqac_chairman',
       'direct_reports', jsonb_build_array('hod'),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'hod',
       'title', 'Head of Department',
       'aliases', jsonb_build_array('HOD'),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'vice_principal_iqac_coordinator',
       'direct_reports', jsonb_build_array('professor', 'associate_professor', 'assistant_professor'),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'professor',
       'title', 'Professor',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'hod',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'associate_professor',
       'title', 'Associate Professor',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'hod',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'assistant_professor',
       'title', 'Assistant Professor',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'hod',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'administrative_officer',
       'title', 'Administrative Officer',
       'aliases', jsonb_build_array('AO'),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'principal_iqac_chairman',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'controller_of_examiner',
       'title', 'Controller of Examiner',
       'aliases', jsonb_build_array('COE'),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'principal_iqac_chairman',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'physical_educator',
       'title', 'Physical Educator',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'principal_iqac_chairman',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'clinical_in_charge',
       'title', 'Clinical In-Charge',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'hod',
       'direct_reports', jsonb_build_array('clinical_assistant'),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'clinical_assistant',
       'title', 'Clinical Assistant',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'clinical_in_charge',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'librarian',
       'title', 'Librarian',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'principal_iqac_chairman',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'placement_officer',
       'title', 'Placement Officer',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'principal_iqac_chairman',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     ),
     jsonb_build_object(
       'role_code', 'office_assistant',
       'title', 'Office Assistant',
       'aliases', jsonb_build_array(),
       'applies_to_institutions', jsonb_build_array('dental'),
       'reports_to', 'administrative_officer',
       'direct_reports', jsonb_build_array(),
       'external_form_ref', NULL,
       'responsibilities', jsonb_build_array('TBD - Director input pending')
     )
   )
 ),
 'Designation hierarchy + per-role responsibilities for Dental institution. Edit via /admin/hr/policies/roles-responsibilities.',
 'object', true),

-- ----------------------------------------------------------------------------
-- 3. hr.academic_scope — Engineering
-- Per JSONB spec §4. Director lock: was global, now scope=institution.
-- ----------------------------------------------------------------------------
('hr.academic_scope', 'institution',
 '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
 jsonb_build_object(
   'responsibilities', jsonb_build_array(
     'classroom_teaching_modern_aids',
     'student_evaluation_and_assessment',
     'lab_development_modern_techniques',
     'lab_instructions_master_reading',
     'curricular_co_curricular_participation',
     'student_guidance_counselling_career',
     'character_development'
   ),
   'career_development_channels', jsonb_build_array(
     'QIP',
     'professional_association',
     'knowledge_skills'
   )
 ),
 'Academic scope: faculty responsibilities + career development channels (Engineering).',
 'object', true),

-- ----------------------------------------------------------------------------
-- 4. hr.academic_scope — Dental
-- ----------------------------------------------------------------------------
('hr.academic_scope', 'institution',
 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
 jsonb_build_object(
   'responsibilities', jsonb_build_array(
     'classroom_teaching_modern_aids',
     'student_evaluation_and_assessment',
     'lab_development_modern_techniques',
     'lab_instructions_master_reading',
     'curricular_co_curricular_participation',
     'student_guidance_counselling_career',
     'character_development'
   ),
   'career_development_channels', jsonb_build_array(
     'QIP',
     'professional_association',
     'knowledge_skills'
   )
 ),
 'Academic scope: faculty responsibilities + career development channels (Dental).',
 'object', true),

-- ----------------------------------------------------------------------------
-- 5. hr.teaching_artifacts — Engineering
-- Per JSONB spec §13. Director lock: was global, now scope=institution.
-- ----------------------------------------------------------------------------
('hr.teaching_artifacts', 'institution',
 '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
 jsonb_build_object(
   'required_artifacts', jsonb_build_array(
     'course_plan',
     'lesson_plan',
     'micro_plan',
     'ppt',
     'web_downloads',
     'self_learning_material',
     'e_learning_material',
     'journals',
     'magazines',
     'industrial_visit_specialisation'
   )
 ),
 'Required teaching artifacts faculty must prepare/maintain (Engineering).',
 'object', true),

-- ----------------------------------------------------------------------------
-- 6. hr.teaching_artifacts — Dental
-- ----------------------------------------------------------------------------
('hr.teaching_artifacts', 'institution',
 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
 jsonb_build_object(
   'required_artifacts', jsonb_build_array(
     'course_plan',
     'lesson_plan',
     'micro_plan',
     'ppt',
     'web_downloads',
     'self_learning_material',
     'e_learning_material',
     'journals',
     'magazines',
     'industrial_visit_specialisation'
   )
 ),
 'Required teaching artifacts faculty must prepare/maintain (Dental).',
 'object', true)

ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Smoke test: verify 6 rows seeded across 3 keys × 2 institutions.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_roles_count INT;
  v_academic_count INT;
  v_artifacts_count INT;
  v_total_count INT;
BEGIN
  SELECT count(*) INTO v_roles_count
  FROM platform_policies
  WHERE policy_key = 'hr.roles_responsibilities'
    AND scope_type = 'institution'
    AND scope_id IN (
      '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
      'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid
    );

  SELECT count(*) INTO v_academic_count
  FROM platform_policies
  WHERE policy_key = 'hr.academic_scope'
    AND scope_type = 'institution'
    AND scope_id IN (
      '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
      'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid
    );

  SELECT count(*) INTO v_artifacts_count
  FROM platform_policies
  WHERE policy_key = 'hr.teaching_artifacts'
    AND scope_type = 'institution'
    AND scope_id IN (
      '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
      'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid
    );

  v_total_count := v_roles_count + v_academic_count + v_artifacts_count;

  IF v_roles_count <> 2 THEN
    RAISE EXCEPTION 'W3-M2 seed FAILED: expected 2 hr.roles_responsibilities rows, got %', v_roles_count;
  END IF;
  IF v_academic_count <> 2 THEN
    RAISE EXCEPTION 'W3-M2 seed FAILED: expected 2 hr.academic_scope rows, got %', v_academic_count;
  END IF;
  IF v_artifacts_count <> 2 THEN
    RAISE EXCEPTION 'W3-M2 seed FAILED: expected 2 hr.teaching_artifacts rows, got %', v_artifacts_count;
  END IF;

  RAISE NOTICE 'W3-M2 seed OK: % rows (% roles + % academic + % artifacts)',
    v_total_count, v_roles_count, v_academic_count, v_artifacts_count;
END $$;

COMMIT;

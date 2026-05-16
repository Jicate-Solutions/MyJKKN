-- ============================================================================
-- Migration: 20260608_hr_governance_part1_seeds (Wave 3 — M6a Governance Part 1)
-- TIER-0 safe-additive: data-only INSERT into platform_policies. No DDL.
-- ============================================================================
--
-- Adds 4 governance policies × 2 institutions = 8 rows so the HR policy
-- manual can drive staff-development, feedback, memo/termination triggers,
-- and performance review decisions from platform_policies instead of
-- hard-coded constants:
--
--   1. hr.staff_development             (scope=institution, per JSONB §14)
--   2. hr.feedback_evaluation           (scope=institution, per JSONB §15)
--   3. hr.memo_and_termination_triggers (scope=institution, per JSONB §26)
--   4. hr.performance_review            (scope=institution, per JSONB §27)
--
-- Institutions seeded (same UUIDs as W3-M3/M4/M5):
--   Engineering institution_id = 5de4fba1-4564-41ed-8c73-5d948b74b843
--   Dental      institution_id = e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5
--
-- Per Director lock (2026-05-15): scope_type='institution' for ALL HR policies
-- even when the underlying spec section says scope=global. Each institution
-- can customise. Wave 3 manual exporter aggregates per-institution rows.
--
-- Director's framing (memory: reference_platform_policies_director_view_pattern.md):
--   3 layers — (1) platform_policies row, (2) fn_get_policy_* reader, (3) admin UI.
--   Editors render English consequences, NEVER raw JSONB.
--
-- classification='major', publication_state='published' for initial seeds —
-- governance decisions are sensitive (memo triggers, termination process,
-- appraisal flow) so they default to Director-only edit until reclassified.
--
-- Idempotent via ON CONFLICT on (policy_key, scope_type, scope_id).
-- ============================================================================

INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system,
   classification, publication_state)
VALUES
-- ===========================================================================
-- 14. hr.staff_development — Engineering
-- ===========================================================================
(
  'hr.staff_development',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "sedc": {
      "member_count": 7,
      "chairperson_role_code": null,
      "evaluation_scope": "below_manager_level"
    },
    "annual_incentives": {
      "annual_amount_authority": "SEDC",
      "director_special_amount_authority": ["SEDC", "Director"],
      "tenure_extension_based_on_perf": true,
      "monthly_honorarium_authority": "SEDC",
      "monthly_honorarium_basis": "additional_responsibilities"
    },
    "training_categories": {
      "induction": {"coverage": "all_departments", "target": "newly_recruited_employee"},
      "internal": {"scope": "current_job_and_related"},
      "specialised": {"external_faculty": true, "request_routed_to": "CAO", "feedback_required": true, "records_owner": "HR"}
    }
  }'::jsonb,
  'JKKN Engineering — Staff Development. SEDC = 7-member committee evaluating below-manager-level staff. Annual incentives authority sits with SEDC; Director-special amounts need both SEDC + Director sign-off. Three training categories: induction (all departments, new recruits), internal (current-job-related), specialised (external faculty, requests through CAO, feedback mandatory, HR keeps records). Edit via /admin/hr/policies/staff-development.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 14. hr.staff_development — Dental
-- ===========================================================================
(
  'hr.staff_development',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "sedc": {
      "member_count": 7,
      "chairperson_role_code": null,
      "evaluation_scope": "below_manager_level"
    },
    "annual_incentives": {
      "annual_amount_authority": "SEDC",
      "director_special_amount_authority": ["SEDC", "Director"],
      "tenure_extension_based_on_perf": true,
      "monthly_honorarium_authority": "SEDC",
      "monthly_honorarium_basis": "additional_responsibilities"
    },
    "training_categories": {
      "induction": {"coverage": "all_departments", "target": "newly_recruited_employee"},
      "internal": {"scope": "current_job_and_related"},
      "specialised": {"external_faculty": true, "request_routed_to": "CAO", "feedback_required": true, "records_owner": "HR"}
    }
  }'::jsonb,
  'JKKN Dental — Staff Development. SEDC = 7-member committee evaluating below-manager-level staff. Annual incentives authority sits with SEDC; Director-special amounts need both SEDC + Director sign-off. Three training categories: induction (all departments, new recruits), internal (current-job-related), specialised (external faculty, requests through CAO, feedback mandatory, HR keeps records). Edit via /admin/hr/policies/staff-development.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 15. hr.feedback_evaluation — Engineering
-- ===========================================================================
(
  'hr.feedback_evaluation',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "student_feedback_frequency_per_semester": 2,
    "format": "computerised_structure",
    "teaching_dimensions": [
      "punctuality",
      "regularity",
      "teacher_control",
      "class_test_conduct",
      "tutorials_quality",
      "assignments_quality",
      "syllabus_coverage"
    ],
    "env_dimensions": [
      "environment",
      "cleanliness_sanitation",
      "library",
      "canteen",
      "water_supply",
      "games_sports",
      "transport",
      "hod_attitude",
      "principal_grievance_response",
      "management_support"
    ]
  }'::jsonb,
  'JKKN Engineering — Student Feedback & Evaluation. Students give structured computerised feedback twice per semester across 7 teaching dimensions (punctuality, regularity, control, class-tests, tutorials, assignments, syllabus coverage) and 10 environmental dimensions (cleanliness, library, canteen, water, games, transport, HOD attitude, grievance response, management support). Edit via /admin/hr/policies/feedback-evaluation.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 15. hr.feedback_evaluation — Dental
-- ===========================================================================
(
  'hr.feedback_evaluation',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "student_feedback_frequency_per_semester": 2,
    "format": "computerised_structure",
    "teaching_dimensions": [
      "punctuality",
      "regularity",
      "teacher_control",
      "class_test_conduct",
      "tutorials_quality",
      "assignments_quality",
      "syllabus_coverage"
    ],
    "env_dimensions": [
      "environment",
      "cleanliness_sanitation",
      "library",
      "canteen",
      "water_supply",
      "games_sports",
      "transport",
      "hod_attitude",
      "principal_grievance_response",
      "management_support"
    ]
  }'::jsonb,
  'JKKN Dental — Student Feedback & Evaluation. Students give structured computerised feedback twice per semester across 7 teaching dimensions and 10 environmental dimensions. Edit via /admin/hr/policies/feedback-evaluation.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 26. hr.memo_and_termination_triggers — Engineering
-- ===========================================================================
(
  'hr.memo_and_termination_triggers',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "memo_triggers": [
      "leave_before_approval",
      "2plus_lops_per_month"
    ],
    "memo_threshold_for_termination": 3,
    "memo_notice_format_template_ref": null,
    "termination_triggers": {
      "3plus_memos_immediate": true,
      "unannounced_leave_week_threshold_days": 7
    },
    "termination_5_step_process": [
      "identify_and_document_issues",
      "coach_employees_to_rectify",
      "create_performance_improvement_plan",
      "terminate_the_employee",
      "have_hr_conduct_exit_interview"
    ]
  }'::jsonb,
  'JKKN Engineering — Memo & Termination Triggers. Memos are issued when staff take leave before approval or accumulate 2+ LOPs in a month. Three memos cumulatively trigger termination. Immediate termination triggers: 3+ memos already on record OR unannounced leave exceeding 7 days. Termination follows the 5-step process: document issues, coach to rectify, performance improvement plan, terminate, HR exit interview. Edit via /admin/hr/policies/memo-termination.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 26. hr.memo_and_termination_triggers — Dental
-- ===========================================================================
(
  'hr.memo_and_termination_triggers',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "memo_triggers": [
      "leave_before_approval",
      "2plus_lops_per_month"
    ],
    "memo_threshold_for_termination": 3,
    "memo_notice_format_template_ref": null,
    "termination_triggers": {
      "3plus_memos_immediate": true,
      "unannounced_leave_week_threshold_days": 7
    },
    "termination_5_step_process": [
      "identify_and_document_issues",
      "coach_employees_to_rectify",
      "create_performance_improvement_plan",
      "terminate_the_employee",
      "have_hr_conduct_exit_interview"
    ]
  }'::jsonb,
  'JKKN Dental — Memo & Termination Triggers. Memos issued on leave-before-approval or 2+ LOPs/month; 3 memos cumulatively trigger termination. Immediate termination: 3+ memos already on record OR unannounced leave exceeding 7 days. 5-step termination process: document, coach, PIP, terminate, HR exit interview. Edit via /admin/hr/policies/memo-termination.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 27. hr.performance_review — Engineering
-- ===========================================================================
(
  'hr.performance_review',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "appraisal_form_distribution_month": "June",
    "distribution_on_term_completion": true,
    "min_service_months_for_review": 6,
    "period_start": "07-01",
    "period_end": "06-30",
    "self_appraisal_required": true,
    "review_committee": "SEDC",
    "final_approver": "Director",
    "facilitator_grading_doc_ref": null
  }'::jsonb,
  'JKKN Engineering — Performance Review. Appraisal forms go out every June (also on completion of a contract term). Staff need 6+ months of service to be reviewed. Review period runs July 1 to June 30. Self-appraisal is mandatory. SEDC reviews; Director gives final approval. Edit via /admin/hr/policies/performance-review.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 27. hr.performance_review — Dental
-- ===========================================================================
(
  'hr.performance_review',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "appraisal_form_distribution_month": "June",
    "distribution_on_term_completion": true,
    "min_service_months_for_review": 6,
    "period_start": "07-01",
    "period_end": "06-30",
    "self_appraisal_required": true,
    "review_committee": "SEDC",
    "final_approver": "Director",
    "facilitator_grading_doc_ref": null
  }'::jsonb,
  'JKKN Dental — Performance Review. Appraisal forms go out every June; staff need 6+ months of service. Review period July 1 to June 30. Self-appraisal mandatory. SEDC reviews; Director gives final approval. Edit via /admin/hr/policies/performance-review.',
  'object',
  true,
  'major',
  'published'
)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ============================================================================
-- Inline smoke-test: assert exactly 8 institution-scoped rows landed across
-- the 4 governance policy keys. Fails the migration loudly if drift.
-- ============================================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM platform_policies
  WHERE policy_key IN (
      'hr.staff_development',
      'hr.feedback_evaluation',
      'hr.memo_and_termination_triggers',
      'hr.performance_review'
    )
    AND scope_type = 'institution'
    AND scope_id IN (
      '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
      'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid
    );

  IF v_count <> 8 THEN
    RAISE EXCEPTION 'W3-M6a seed smoke-test FAILED: expected 8 governance policy rows (4 keys × 2 institutions), got %', v_count;
  END IF;

  RAISE NOTICE 'W3-M6a seed smoke-test PASSED: 8 governance policy rows present.';
END $$;

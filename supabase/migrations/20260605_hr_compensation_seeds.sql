-- ============================================================================
-- Migration: 20260605_hr_compensation_seeds (Wave 3 — M4 Compensation)
-- TIER-0 safe-additive: data-only INSERT into platform_policies. No DDL.
-- ============================================================================
--
-- Adds 3 compensation policies × 2 institutions = 6 rows so the HR policy
-- manual can drive pay, allowance, and motivation-fund decisions from
-- platform_policies instead of hard-coded constants:
--
--   1. hr.pay_scales                  (scope=institution, per JSONB §10)
--   2. hr.allowances_and_increments   (scope=institution, per JSONB §11)
--   3. hr.motivation_fund             (scope=institution, per JSONB §16)
--
-- Institutions seeded:
--   Engineering institution_id = 5de4fba1-4564-41ed-8c73-5d948b74b843
--   Dental      institution_id = e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5
--
-- Director's framing (memory: reference_platform_policies_director_view_pattern.md):
--   3 layers — (1) platform_policies row, (2) fn_get_policy_* reader, (3) admin UI.
--   Editors render English consequences, NEVER raw JSONB.
--
-- W3-M0 substrate (`classification`, `draft_value`, `publication_state` columns)
-- is shipped in a sibling PR by Agent W3-M0. This migration stays on the
-- current platform_policies schema (just `value` JSONB) so the seeds apply
-- regardless of merge ordering. Once M0 lands, classification='major' can be
-- backfilled in a follow-up sweep.
--
-- Idempotent via ON CONFLICT on (policy_key, scope_type, scope_id).
-- ============================================================================

INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system)
VALUES
-- ---------------------------------------------------------------------------
-- 10. hr.pay_scales — Engineering
-- ---------------------------------------------------------------------------
(
  'hr.pay_scales',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "pay_matrix": [
      {"designation": "Assistant Professor", "qualification": "M.E (CSE/IT)", "basic_pay": 20000},
      {"designation": "Assistant Professor", "qualification": "M.E (Mech/EEE/ECE)", "basic_pay": 18000},
      {"designation": "Assistant Professor", "qualification": "B.E./M.Sc./MCA", "basic_pay": 13000},
      {"designation": "Assistant Professor", "qualification": "MBA/M.Phil", "basic_pay": 14000},
      {"designation": "Associate Professor", "qualification": null, "basic_pay": 31000},
      {"designation": "Professor", "qualification": null, "basic_pay": 40000},
      {"designation": "Lab Instructor", "qualification": "Diploma", "basic_pay": 8000},
      {"designation": "Lab Instructor", "qualification": "B.E./M.Sc", "basic_pay": 11000},
      {"designation": "Librarian", "qualification": null, "basic_pay": 12000},
      {"designation": "Typist", "qualification": null, "basic_pay": 6500},
      {"designation": "Physical Educator", "qualification": null, "basic_pay": 12000}
    ],
    "overrides": {"net_set_basic": 15000},
    "fixation_basis": ["qualification", "experience"],
    "selection_committee_authority": true,
    "higher_pay_package_approver": "Trust Secretary"
  }'::jsonb,
  'JKKN Engineering — Pay Scale Matrix. Per-designation × per-qualification basic_pay (INR/month). Overrides.net_set_basic is the minimum guaranteed basic. Fixation_basis lists axes used by the selection committee. Higher_pay_package_approver names the role authorised to override the matrix. Edit via /admin/hr/policies/pay-scales.',
  'object',
  true
),
-- ---------------------------------------------------------------------------
-- 10. hr.pay_scales — Dental
-- ---------------------------------------------------------------------------
(
  'hr.pay_scales',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "pay_matrix": [
      {"designation": "Professor", "qualification": null, "basic_pay": 100000},
      {"designation": "Associate Professor", "qualification": null, "basic_pay": 75000},
      {"designation": "Assistant Professor", "qualification": null, "basic_pay": 30000}
    ],
    "overrides": {"net_set_basic": 15000},
    "fixation_basis": ["qualification", "experience"],
    "selection_committee_authority": true,
    "higher_pay_package_approver": "Trust Secretary"
  }'::jsonb,
  'JKKN Dental — Pay Scale Matrix. Per-designation basic_pay (INR/month). Overrides.net_set_basic is the minimum guaranteed basic. Higher_pay_package_approver names the role authorised to override the matrix. Edit via /admin/hr/policies/pay-scales.',
  'object',
  true
),
-- ---------------------------------------------------------------------------
-- 11. hr.allowances_and_increments — Engineering
-- ---------------------------------------------------------------------------
(
  'hr.allowances_and_increments',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "allowances": {
      "hod": 3000,
      "other_per_designation": {}
    },
    "allowance_aicte_university_government_aligned": true,
    "allowance_governing_body_decision_authority": true,
    "increments": {
      "annual_window_months": 12,
      "approver_default": "Principal",
      "approver_for_principal": ["Chairman", "Secretary"],
      "satisfactory_performance_required": true,
      "head_of_dept_recommendation_required": true,
      "withholding_triggers": ["poor_conduct", "unsatisfactory_work"]
    },
    "yearly_increment_factors": [
      "contributions",
      "univ_results",
      "feedback",
      "research",
      "entrepreneurship",
      "innovation",
      "startups",
      "journal_pubs"
    ],
    "discretion": "management"
  }'::jsonb,
  'JKKN Engineering — Allowances & Increments. Allowances.hod is the monthly HOD allowance (INR). Increments are annual (12 months window) approved by Principal; Principal increment routes to Chairman/Secretary. Yearly factors list the performance dimensions considered. Edit via /admin/hr/policies/allowances-and-increments.',
  'object',
  true
),
-- ---------------------------------------------------------------------------
-- 11. hr.allowances_and_increments — Dental
-- ---------------------------------------------------------------------------
(
  'hr.allowances_and_increments',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "allowances": {
      "hod": null,
      "other_per_designation": {}
    },
    "allowance_aicte_university_government_aligned": true,
    "allowance_governing_body_decision_authority": true,
    "increments": {
      "annual_window_months": 12,
      "approver_default": "Principal",
      "approver_for_principal": ["Chairman", "Secretary"],
      "satisfactory_performance_required": true,
      "head_of_dept_recommendation_required": true,
      "withholding_triggers": ["poor_conduct", "unsatisfactory_work"]
    },
    "yearly_increment_factors": [
      "contributions",
      "univ_results",
      "feedback",
      "research",
      "entrepreneurship",
      "innovation",
      "startups",
      "journal_pubs"
    ],
    "discretion": "management"
  }'::jsonb,
  'JKKN Dental — Allowances & Increments. Dental manual does not specify a fixed HOD allowance amount (null). Increments are annual (12 months window) approved by Principal; Principal increment routes to Chairman/Secretary. Edit via /admin/hr/policies/allowances-and-increments.',
  'object',
  true
),
-- ---------------------------------------------------------------------------
-- 16. hr.motivation_fund — Engineering
-- ---------------------------------------------------------------------------
(
  'hr.motivation_fund',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "epf": {
      "employee_contribution_pct": 12.0,
      "employer_contribution_pct": 12.0,
      "deposit_to_govt_dept_timely": true
    },
    "awards": {
      "categories": ["faculty", "supporting_staff"],
      "variables": ["academic_perf", "student_feedback", "pass_pct", "top_ranks", "grade"],
      "forms": ["cash", "appreciation_letter", "commending_letter", "promotion", "increment"],
      "top_ranks_at_university_level": true
    },
    "consultancy": {
      "problems_referred_by": ["industries", "government_agencies"],
      "uses_faculty_expertise_and_infra": true
    }
  }'::jsonb,
  'JKKN Engineering — Motivation Fund. EPF: both employee + employer contribute 12%, deposited timely to govt. Awards reward faculty + supporting staff across academic dimensions in cash / letters / promotion / increment. Consultancy lets faculty take work from industries + govt agencies using JKKN infra. Edit via /admin/hr/policies/motivation-fund.',
  'object',
  true
),
-- ---------------------------------------------------------------------------
-- 16. hr.motivation_fund — Dental
-- ---------------------------------------------------------------------------
(
  'hr.motivation_fund',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "epf": {
      "employee_contribution_pct": 12.0,
      "employer_contribution_pct": 12.0,
      "deposit_to_govt_dept_timely": true
    },
    "awards": {
      "categories": ["faculty", "supporting_staff"],
      "variables": ["academic_perf", "student_feedback", "pass_pct", "top_ranks", "grade"],
      "forms": ["cash", "appreciation_letter", "commending_letter", "promotion", "increment"],
      "top_ranks_at_university_level": true
    },
    "consultancy": {
      "problems_referred_by": ["industries", "government_agencies"],
      "uses_faculty_expertise_and_infra": true
    }
  }'::jsonb,
  'JKKN Dental — Motivation Fund. EPF: both employee + employer contribute 12%, deposited timely to govt. Awards reward faculty + supporting staff across academic dimensions in cash / letters / promotion / increment. Consultancy lets faculty take work from industries + govt agencies using JKKN infra. Edit via /admin/hr/policies/motivation-fund.',
  'object',
  true
)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ============================================================================
-- Inline smoke-test: assert exactly 6 institution-scoped rows landed across
-- the 3 compensation policy keys. Fails the migration loudly if drift.
-- ============================================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM platform_policies
  WHERE policy_key IN ('hr.pay_scales', 'hr.allowances_and_increments', 'hr.motivation_fund')
    AND scope_type = 'institution'
    AND scope_id IN (
      '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
      'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid
    );

  IF v_count <> 6 THEN
    RAISE EXCEPTION 'W3-M4 seed smoke-test FAILED: expected 6 compensation policy rows (3 keys × 2 institutions), got %', v_count;
  END IF;

  RAISE NOTICE 'W3-M4 seed smoke-test PASSED: 6 compensation policy rows present.';
END $$;

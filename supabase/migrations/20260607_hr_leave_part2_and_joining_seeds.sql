-- ============================================================================
-- Migration: 20260607_hr_leave_part2_and_joining_seeds (Wave 3 — M5b)
-- TIER-0 safe-additive: data-only INSERT into platform_policies. No DDL.
-- ============================================================================
--
-- Wave 3 M5b — the SECOND half of M5. Seeds 4 policies × 2 institutions = 8
-- rows so the HR policy manual can drive joining/appointment + 3 leave
-- categories from platform_policies instead of hard-coded constants:
--
--   1. hr.joining_and_appointment    (scope=institution, per JSONB §12)
--      — Required documents catalog + appointment defaults + appointing authority
--   2. hr.leave.on_duty              (scope=institution, per JSONB §23)
--      — 4 categories including higher_study_research per audit-gap lock
--   3. hr.leave.marriage             (scope=institution, per JSONB §24)
--      — Dental: 10 days. Engineering: not applicable.
--   4. hr.leave.holidays_and_lop     (scope=institution, per JSONB §25)
--      — Public/restricted holidays catalog + half-day windows + LOP rules
--
-- Institutions seeded:
--   Engineering institution_id = 5de4fba1-4564-41ed-8c73-5d948b74b843
--   Dental      institution_id = e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5
--
-- Director's framing (memory: reference_platform_policies_director_view_pattern.md):
--   3 layers — (1) platform_policies row, (2) fn_get_policy_* reader, (3) admin UI.
--   Editors render English consequences, NEVER raw JSONB.
--
-- W3-M0 substrate (`classification`, `draft_value`, `publication_state`) is
-- assumed live (shipped in 20260601_hr_policy_substrate_extensions). All seeds
-- land with classification='major' and publication_state='published'.
--
-- Notes per Director audit-gap lock 2026-05-15:
--   - hr.leave.on_duty per-institution rows encode whether higher_study_research
--     applies (Engineering: applies=true, 6 days/year; Dental: applies=false).
--   - hr.leave.marriage Dental row is full structure (10 days). Engineering row
--     is {applies: false}. _manual_contradiction_note removed (10 days definitive).
--   - hr.joining_and_appointment seeded per-institution (not global) to allow
--     institution-specific document overrides if needed later. Required-documents
--     catalog matches §12 (11 items). The existing /admin/hr/required-documents
--     page (Wave 1.5) reads from hr_required_documents table — refactor to read
--     from this policy is scheduled in W3-M10 (see PR body).
--
-- Idempotent via ON CONFLICT on (policy_key, scope_type, scope_id).
-- ============================================================================

INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system,
   classification, publication_state)
VALUES
-- ===========================================================================
-- 12. hr.joining_and_appointment — Engineering
-- ===========================================================================
(
  'hr.joining_and_appointment',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "required_documents": [
      { "key": "candidate_statement_declaration_form", "required": true },
      { "key": "mark_sheets_10th_to_last_qualifying", "required": true },
      { "key": "passing_certificates", "required": true },
      { "key": "birth_certificate", "required": true },
      { "key": "present_address_proof", "required": true },
      { "key": "permanent_address_proof", "required": true },
      { "key": "relieving_letter_previous_org", "required": true },
      { "key": "latest_salary_slip_previous_org", "required": true },
      { "key": "medical_fitness_certificate", "required": true },
      { "key": "photo_id", "required": true, "any_one_of": ["Aadhar", "PAN", "Passport", "DL", "Voter ID", "other Govt-issued"] },
      { "key": "photographs", "required": true, "count": 2 }
    ],
    "appointment": {
      "default_type": "tenure_based_scaled_contract",
      "outsourcing_to_contract_approver": "Director",
      "reservation_compliance": "Government_guidelines",
      "nondiscrimination_axes": ["race", "sex", "religion"],
      "letter_termination_notice_clause": true,
      "naac_guideline_alignment_required": true
    },
    "process_steps": [
      "collect_candidate_statement",
      "verify_documents",
      "collect_joining_report",
      "issue_joining_memorandum",
      "intro_to_avp_hr",
      "issue_id_card"
    ],
    "appointing_authority": {
      "primary": "Principal",
      "approver": "MD",
      "committee_recommendation_required": true
    }
  }'::jsonb,
  'JKKN Engineering — Joining & Appointment. Lists every document a new hire must submit, the default contract style (tenure-based scaled), the equity/anti-discrimination commitments, the joining process steps, and who appoints (Principal proposes; MD approves; committee recommends). Edit via /admin/hr/policies/joining-and-appointment.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 12. hr.joining_and_appointment — Dental
-- ===========================================================================
(
  'hr.joining_and_appointment',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "required_documents": [
      { "key": "candidate_statement_declaration_form", "required": true },
      { "key": "mark_sheets_10th_to_last_qualifying", "required": true },
      { "key": "passing_certificates", "required": true },
      { "key": "birth_certificate", "required": true },
      { "key": "present_address_proof", "required": true },
      { "key": "permanent_address_proof", "required": true },
      { "key": "relieving_letter_previous_org", "required": true },
      { "key": "latest_salary_slip_previous_org", "required": true },
      { "key": "medical_fitness_certificate", "required": true },
      { "key": "photo_id", "required": true, "any_one_of": ["Aadhar", "PAN", "Passport", "DL", "Voter ID", "other Govt-issued"] },
      { "key": "photographs", "required": true, "count": 2 }
    ],
    "appointment": {
      "default_type": "tenure_based_scaled_contract",
      "outsourcing_to_contract_approver": "Director",
      "reservation_compliance": "Government_guidelines",
      "nondiscrimination_axes": ["race", "sex", "religion"],
      "letter_termination_notice_clause": true,
      "naac_guideline_alignment_required": true
    },
    "process_steps": [
      "collect_candidate_statement",
      "verify_documents",
      "collect_joining_report",
      "issue_joining_memorandum",
      "intro_to_avp_hr",
      "issue_id_card"
    ],
    "appointing_authority": {
      "primary": "Principal",
      "approver": "MD",
      "committee_recommendation_required": true
    }
  }'::jsonb,
  'JKKN Dental — Joining & Appointment. Same document catalog and joining process as the engineering institution; institution-scoped so document overrides remain possible later. Edit via /admin/hr/policies/joining-and-appointment.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 23. hr.leave.on_duty — Engineering (includes higher_study_research per audit-gap)
-- ===========================================================================
(
  'hr.leave.on_duty',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "categories": [
      { "key": "conferences_seminars_workshops", "max_per_year": 6, "applies": true },
      { "key": "exam_supervision", "cap": "uncapped", "applies": true },
      { "key": "other_institution_work", "max_per_year": 6, "applies": true },
      { "key": "higher_study_research", "max_per_year": 6, "applies": true }
    ],
    "approval_chain": ["HoD", "Principal"],
    "fdp_outcome_demonstration_window_days": 15,
    "rejection_on_no_outcome": true,
    "form_required": true
  }'::jsonb,
  'JKKN Engineering — On-duty (OD) Leave. Faculty may take OD across 4 categories: conferences/seminars/workshops (6/yr), exam supervision (uncapped), other-institution work (6/yr), higher-study-research (6/yr). Approval routes HoD → Principal. FDP outcome demonstration required within 15 days; rejection if no outcome. Edit via /admin/hr/policies/leave/on-duty.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 23. hr.leave.on_duty — Dental (higher_study_research not applicable)
-- ===========================================================================
(
  'hr.leave.on_duty',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "categories": [
      { "key": "conferences_seminars_workshops", "max_per_year": 6, "applies": true },
      { "key": "exam_supervision", "cap": "uncapped", "applies": true },
      { "key": "other_institution_work", "max_per_year": 6, "applies": true },
      { "key": "higher_study_research", "max_per_year": 6, "applies": false }
    ],
    "approval_chain": ["HoD", "Principal"],
    "fdp_outcome_demonstration_window_days": 15,
    "rejection_on_no_outcome": true,
    "form_required": true
  }'::jsonb,
  'JKKN Dental — On-duty (OD) Leave. Faculty may take OD across 3 categories: conferences/seminars/workshops (6/yr), exam supervision (uncapped), other-institution work (6/yr). Higher-study-research is NOT applicable to dental staff. Approval routes HoD → Principal. FDP outcome demonstration required within 15 days; rejection if no outcome. Edit via /admin/hr/policies/leave/on-duty.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 24. hr.leave.marriage — Engineering (NOT APPLICABLE)
-- ===========================================================================
(
  'hr.leave.marriage',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "applies": false
  }'::jsonb,
  'JKKN Engineering — Marriage Leave. The engineering manual does not provide marriage leave. Staff who marry use vacation/casual leave instead. Edit via /admin/hr/policies/leave/marriage to introduce a policy.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 24. hr.leave.marriage — Dental (10 days, per audit-gap lock 2026-05-15)
-- ===========================================================================
(
  'hr.leave.marriage',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "applies": true,
    "days": 10,
    "min_service_years": 1,
    "advance_application_required": true,
    "can_prefix_suffix_holidays": true,
    "deducted_from_vacation": true
  }'::jsonb,
  'JKKN Dental — Marriage Leave. 10 days for an employees own marriage (manual contradiction between 1 week and 10 days resolved as 10 days per Director audit 2026-05-15). Minimum 1 year of service. Must apply in advance. May prefix or suffix with public holidays. Deducted from the annual vacation balance. Edit via /admin/hr/policies/leave/marriage.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 25. hr.leave.holidays_and_lop — Engineering
-- ===========================================================================
(
  'hr.leave.holidays_and_lop',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "public_holidays_source": "Govt_of_India_list_approved_by_Director",
    "restricted_holidays_list": [],
    "half_day_windows": {
      "forenoon_start": "09:00",
      "forenoon_end": "13:00",
      "afternoon_start": "12:30",
      "afternoon_end": "16:30"
    },
    "lop": {
      "max_days_per_year": 15,
      "2plus_per_month_triggers_memo": true,
      "principal_prior_approval_required": true
    }
  }'::jsonb,
  'JKKN Engineering — Holidays & Loss of Pay (LOP). Public holidays follow the Govt of India list as approved annually by the Director. Half-day windows split the working day into forenoon (09:00-13:00) and afternoon (12:30-16:30). LOP capped at 15 days/year; 2+ LOPs in a single month triggers a memo; LOP needs Principal pre-approval. Edit via /admin/hr/policies/leave/holidays-and-lop.',
  'object',
  true,
  'major',
  'published'
),
-- ===========================================================================
-- 25. hr.leave.holidays_and_lop — Dental
-- ===========================================================================
(
  'hr.leave.holidays_and_lop',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "public_holidays_source": "Govt_of_India_list_approved_by_Director",
    "restricted_holidays_list": [],
    "half_day_windows": {
      "forenoon_start": "09:00",
      "forenoon_end": "13:00",
      "afternoon_start": "12:30",
      "afternoon_end": "16:30"
    },
    "lop": {
      "max_days_per_year": 15,
      "2plus_per_month_triggers_memo": true,
      "principal_prior_approval_required": true
    }
  }'::jsonb,
  'JKKN Dental — Holidays & Loss of Pay (LOP). Public holidays follow the Govt of India list as approved annually by the Director. Half-day windows are identical to engineering for now (override per-institution as dental clinic hours diverge). LOP capped at 15 days/year; 2+ LOPs in a single month triggers a memo; LOP needs Principal pre-approval. Edit via /admin/hr/policies/leave/holidays-and-lop.',
  'object',
  true,
  'major',
  'published'
)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ============================================================================
-- Inline smoke-test: assert exactly 8 institution-scoped rows landed across
-- the 4 policy keys. Fails the migration loudly if drift.
-- ============================================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM platform_policies
  WHERE policy_key IN (
      'hr.joining_and_appointment',
      'hr.leave.on_duty',
      'hr.leave.marriage',
      'hr.leave.holidays_and_lop'
    )
    AND scope_type = 'institution'
    AND scope_id IN (
      '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
      'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid
    );

  IF v_count <> 8 THEN
    RAISE EXCEPTION 'W3-M5b seed smoke-test FAILED: expected 8 leave/joining policy rows (4 keys × 2 institutions), got %', v_count;
  END IF;

  RAISE NOTICE 'W3-M5b seed smoke-test PASSED: 8 leave/joining policy rows present.';
END $$;

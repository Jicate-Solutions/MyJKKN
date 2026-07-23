-- ============================================================================
-- Migration: 20260609_hr_governance_part2_seeds (Wave 3 — M6b Governance Part 2)
-- TIER-0 safe-additive: data-only INSERT into platform_policies. No DDL.
-- ============================================================================
--
-- Adds 4 governance policies × 2 institutions = 8 rows so the HR policy
-- manual can drive merit-based promotion, code-of-conduct framing,
-- disciplinary action ladder, and grievance escalation from
-- platform_policies instead of hard-coded constants:
--
--   1. hr.promotion_policy      (scope=institution, per JSONB §28)
--   2. hr.code_of_conduct       (scope=institution, per JSONB §29)
--   3. hr.disciplinary_action   (scope=institution, per JSONB §30)
--   4. hr.grievance_cell        (scope=institution, per JSONB §31)
--
-- Institutions seeded:
--   Engineering institution_id = 5de4fba1-4564-41ed-8c73-5d948b74b843
--   Dental      institution_id = e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5
--
-- Director's framing (memory: reference_platform_policies_director_view_pattern.md):
--   3 layers — (1) platform_policies row, (2) fn_get_policy_* reader, (3) admin UI.
--   Editors render English consequences, NEVER raw JSONB.
--
-- All 4 keys are classified 'major' (sensitive — touches disciplinary outcomes,
-- pay-impacting promotions, harassment governance) so only super-admin can edit
-- via the W3-M0 substrate. Until W3-M0 lands the `classification` column may
-- not exist on every environment — defensive INSERT keeps to the legacy
-- columns (`value`, `description`, `data_type`, `is_system`) and falls through
-- via ON CONFLICT.
--
-- Idempotent via ON CONFLICT on (policy_key, scope_type, scope_id).
-- ============================================================================

INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system)
VALUES
-- ---------------------------------------------------------------------------
-- 28. hr.promotion_policy — Engineering
-- ---------------------------------------------------------------------------
(
  'hr.promotion_policy',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "max_merit_points": 50,
    "merit_score_formula": "appraisal_score / 10",
    "sedc_score_normalization_allowed": true,
    "delay_lookback_years": 5,
    "api_score_required": true,
    "seniority_tiebreaker": true,
    "is_reward_incentive_growth": true,
    "qualification_points_max": 10,
    "qualification_point_scale": {
      "masters_completed": 4,
      "graduation_pg_diploma_min_1yr": 3,
      "diploma_iti_min_1yr": 2,
      "training_per_5_days": 1,
      "book_publication": 2,
      "article_publication": 1
    }
  }'::jsonb,
  'JKKN Engineering — Promotion Policy. Merit-based: candidates score up to 50 merit points (computed from appraisal_score / 10). Qualifications add up to 10 points using the qualification_point_scale (Masters=4, PG Diploma=3, Diploma/ITI=2, Training=1 per 5 days, Book=2, Article=1). Senior service breaks ties. Edit via /admin/hr/policies/promotion-policy.',
  'object',
  true
),
-- ---------------------------------------------------------------------------
-- 28. hr.promotion_policy — Dental
-- ---------------------------------------------------------------------------
(
  'hr.promotion_policy',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "max_merit_points": 50,
    "merit_score_formula": "appraisal_score / 10",
    "sedc_score_normalization_allowed": true,
    "delay_lookback_years": 5,
    "api_score_required": true,
    "seniority_tiebreaker": true,
    "is_reward_incentive_growth": true,
    "qualification_points_max": 10,
    "qualification_point_scale": {
      "masters_completed": 4,
      "graduation_pg_diploma_min_1yr": 3,
      "diploma_iti_min_1yr": 2,
      "training_per_5_days": 1,
      "book_publication": 2,
      "article_publication": 1
    }
  }'::jsonb,
  'JKKN Dental — Promotion Policy. Merit-based: candidates score up to 50 merit points (computed from appraisal_score / 10). Qualifications add up to 10 points using the qualification_point_scale. Senior service breaks ties. Edit via /admin/hr/policies/promotion-policy.',
  'object',
  true
),
-- ---------------------------------------------------------------------------
-- 29. hr.code_of_conduct — Engineering
-- ---------------------------------------------------------------------------
(
  'hr.code_of_conduct',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "engagement_rules": {
      "whole_time_service_required": true,
      "external_trade_or_other_institution_prohibited": true,
      "private_coaching_for_remuneration_prohibited": true,
      "honorary_work_requires_permission": true,
      "enquiry_board_constituted_by": "Director_or_Principal",
      "one_appeal_to_appellate_authority": true,
      "appellate_decision_final": true
    },
    "speech_presentations": {
      "prior_approval_required": true,
      "required_fields": ["date_venue", "purpose_theme", "outline", "audience", "reason"],
      "post_event_report_required": true
    },
    "media_communications": {
      "handler_role": "General_Manager_Communications",
      "direct_press_authority": "Director_only",
      "authorization_required": true,
      "social_sensitive_info_allowed": false
    },
    "drugs_smoking_alcohol": {
      "disciplinary_action_applies": true,
      "testing_on_suspicion": true,
      "refusal_to_test_penalty": "termination"
    },
    "sexual_harassment_cmgi": {
      "committee_name": "Committee for Managing Gender Issues",
      "chairperson": "Principal",
      "scope": ["women", "other_genders", "awareness", "sensitisation", "counselling", "education"],
      "act_compliance": true
    },
    "dos": [
      "Maintain absolute integrity and devotion to duty",
      "Attend college regularly and punctually",
      "Engage classes (theory and practical) punctually and effectively",
      "No external editing/management without sanction",
      "Correct assignments and lab records systematically",
      "Submit question papers and internal test marks",
      "Conduct guest/expert lectures",
      "Valuation of internal and external examinations",
      "Attend internal/external invigilator duty",
      "Attend FDPs, workshops, seminars, industrial visits, tours",
      "Download e-material from digital library and authorised online journals",
      "Prepare soft/hard copy of course files, delivery sheets, web materials",
      "Monitor and counsel students",
      "Be honest and impartial in dealing with others",
      "Abide by rules and regulations",
      "Promote decency, decorum, dignity, discipline",
      "Acquire and develop professional/interpersonal skills",
      "Build teamwork and team efficiency",
      "Administrative compliance",
      "Publication of papers in seminars/conferences/journals/magazines",
      "Attend FDPs/workshops/conferences/symposiums/conventions",
      "Professional, rational, intellectual behaviour like academics",
      "Every employee shall be regular during working hours unless permitted otherwise"
    ],
    "donts": [
      "Gross negligence of duties and responsibility",
      "Propagation of religious/communal/anti-social/language/cultural background",
      "Encourage any form of malpractice/unfair practices in exams",
      "Leaving campus without proper prior permission",
      "Absconding from the institution",
      "Undertake private assignment (remunerative or not)",
      "Cause damage to institutional/stakeholder property",
      "Encourage or be involved in immoral practice with stakeholder",
      "Organise/attend duty outside the college without proper approval",
      "Any act detrimental to the interest of the institution"
    ]
  }'::jsonb,
  'JKKN Engineering — Code of Conduct. Whole-time service expected; external trade/coaching prohibited. Speeches and media communications need prior approval through Communications GM (only Director may speak directly to press). Drugs/smoking/alcohol trigger disciplinary action with termination on refusal-to-test. CMGI (Committee for Managing Gender Issues) handles sexual harassment under Principal. Includes a 23-item Do list and 10-item Don''t list. Edit via /admin/hr/policies/code-of-conduct.',
  'object',
  true
),
-- ---------------------------------------------------------------------------
-- 29. hr.code_of_conduct — Dental
-- ---------------------------------------------------------------------------
(
  'hr.code_of_conduct',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "engagement_rules": {
      "whole_time_service_required": true,
      "external_trade_or_other_institution_prohibited": true,
      "private_coaching_for_remuneration_prohibited": true,
      "honorary_work_requires_permission": true,
      "enquiry_board_constituted_by": "Director_or_Principal",
      "one_appeal_to_appellate_authority": true,
      "appellate_decision_final": true
    },
    "speech_presentations": {
      "prior_approval_required": true,
      "required_fields": ["date_venue", "purpose_theme", "outline", "audience", "reason"],
      "post_event_report_required": true
    },
    "media_communications": {
      "handler_role": "General_Manager_Communications",
      "direct_press_authority": "Director_only",
      "authorization_required": true,
      "social_sensitive_info_allowed": false
    },
    "drugs_smoking_alcohol": {
      "disciplinary_action_applies": true,
      "testing_on_suspicion": true,
      "refusal_to_test_penalty": "termination"
    },
    "sexual_harassment_cmgi": {
      "committee_name": "Committee for Managing Gender Issues",
      "chairperson": "Principal",
      "scope": ["women", "other_genders", "awareness", "sensitisation", "counselling", "education"],
      "act_compliance": true
    },
    "dos": [
      "Maintain absolute integrity and devotion to duty",
      "Attend college regularly and punctually",
      "Engage classes (theory and practical) punctually and effectively",
      "No external editing/management without sanction",
      "Correct assignments and lab records systematically",
      "Submit question papers and internal test marks",
      "Conduct guest/expert lectures",
      "Valuation of internal and external examinations",
      "Attend internal/external invigilator duty",
      "Attend FDPs, workshops, seminars, industrial visits, tours",
      "Download e-material from digital library and authorised online journals",
      "Prepare soft/hard copy of course files, delivery sheets, web materials",
      "Monitor and counsel students",
      "Be honest and impartial in dealing with others",
      "Abide by rules and regulations",
      "Promote decency, decorum, dignity, discipline",
      "Acquire and develop professional/interpersonal skills",
      "Build teamwork and team efficiency",
      "Administrative compliance",
      "Publication of papers in seminars/conferences/journals/magazines",
      "Attend FDPs/workshops/conferences/symposiums/conventions",
      "Professional, rational, intellectual behaviour like academics",
      "Every employee shall be regular during working hours unless permitted otherwise"
    ],
    "donts": [
      "Gross negligence of duties and responsibility",
      "Propagation of religious/communal/anti-social/language/cultural background",
      "Encourage any form of malpractice/unfair practices in exams",
      "Leaving campus without proper prior permission",
      "Absconding from the institution",
      "Undertake private assignment (remunerative or not)",
      "Cause damage to institutional/stakeholder property",
      "Encourage or be involved in immoral practice with stakeholder",
      "Organise/attend duty outside the college without proper approval",
      "Any act detrimental to the interest of the institution"
    ]
  }'::jsonb,
  'JKKN Dental — Code of Conduct. Whole-time service; external trade and coaching prohibited. Speech and media communications gated through Communications GM (Director-only press authority). Drugs/smoking/alcohol cases trigger disciplinary action; refusal-to-test = termination. CMGI handles gender issues. 23-item Do list and 10-item Don''t list. Edit via /admin/hr/policies/code-of-conduct.',
  'object',
  true
),
-- ---------------------------------------------------------------------------
-- 30. hr.disciplinary_action — Engineering
-- ---------------------------------------------------------------------------
(
  'hr.disciplinary_action',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "employee_classifications": [
      {"key": "tenure_based_scaled_contract", "description": "fixed-tenure pay-scale employees"},
      {"key": "outsourced", "description": "hired via outsourcing agency/contractor; excludes contractor employees in security/housekeeping"}
    ],
    "minor_penalties": [
      "withhold_promotion",
      "pecuniary_loss_recovery",
      "reduction_lower_stage_max_3_years_no_cumulative_no_pension_effect",
      "withhold_increment"
    ],
    "major_penalties": [
      "reduction_specified_period_with_directions",
      "reduction_lower_timescale_with_directions",
      "removal_no_future_employment_disqualification",
      "dismissal_with_future_employment_disqualification"
    ],
    "suspension": {
      "triggers": ["pending_disciplinary", "state_security_prejudicial", "criminal_under_investigation"],
      "lower_authority_report_required": true,
      "deemed_custody_exceeding_hours": 48,
      "deemed_conviction_imprisonment_exceeding_hours": 48
    }
  }'::jsonb,
  'JKKN Engineering — Disciplinary Action ladder. Applies to two employee classifications: tenure-based-scaled-contract and outsourced (excluding security/housekeeping contractor staff). Four minor penalties (withhold promotion/increment, pecuniary recovery, 3-year reduction). Four major penalties (timed reduction, lower-timescale reduction, removal, dismissal). Suspension triggered by pending enquiry / state-security / criminal investigation; deemed suspension auto-fires if custody or imprisonment exceeds 48 hours. Edit via /admin/hr/policies/disciplinary-action.',
  'object',
  true
),
-- ---------------------------------------------------------------------------
-- 30. hr.disciplinary_action — Dental
-- ---------------------------------------------------------------------------
(
  'hr.disciplinary_action',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "employee_classifications": [
      {"key": "tenure_based_scaled_contract", "description": "fixed-tenure pay-scale employees"},
      {"key": "outsourced", "description": "hired via outsourcing agency/contractor; excludes contractor employees in security/housekeeping"}
    ],
    "minor_penalties": [
      "withhold_promotion",
      "pecuniary_loss_recovery",
      "reduction_lower_stage_max_3_years_no_cumulative_no_pension_effect",
      "withhold_increment"
    ],
    "major_penalties": [
      "reduction_specified_period_with_directions",
      "reduction_lower_timescale_with_directions",
      "removal_no_future_employment_disqualification",
      "dismissal_with_future_employment_disqualification"
    ],
    "suspension": {
      "triggers": ["pending_disciplinary", "state_security_prejudicial", "criminal_under_investigation"],
      "lower_authority_report_required": true,
      "deemed_custody_exceeding_hours": 48,
      "deemed_conviction_imprisonment_exceeding_hours": 48
    }
  }'::jsonb,
  'JKKN Dental — Disciplinary Action ladder. Two employee classifications, four minor penalties, four major penalties, suspension rules (48-hour deemed custody/imprisonment threshold). Edit via /admin/hr/policies/disciplinary-action.',
  'object',
  true
),
-- ---------------------------------------------------------------------------
-- 31. hr.grievance_cell — Engineering
-- ---------------------------------------------------------------------------
(
  'hr.grievance_cell',
  'institution',
  '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
  '{
    "dept_level_constituted_by": "HOD",
    "institution_level_constituted_by": "Principal",
    "gic": {
      "chairperson": "Principal",
      "member_composition": "per_statutes",
      "against_workplace_harassment": true
    }
  }'::jsonb,
  'JKKN Engineering — Grievance Cell. Department-level grievance committees are constituted by HOD; institution-level by Principal. The Grievance Investigation Committee (GIC) is chaired by Principal with member composition per statutes and handles workplace harassment complaints. Edit via /admin/hr/policies/grievance-cell.',
  'object',
  true
),
-- ---------------------------------------------------------------------------
-- 31. hr.grievance_cell — Dental
-- ---------------------------------------------------------------------------
(
  'hr.grievance_cell',
  'institution',
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid,
  '{
    "dept_level_constituted_by": "HOD",
    "institution_level_constituted_by": "Principal",
    "gic": {
      "chairperson": "Principal",
      "member_composition": "per_statutes",
      "against_workplace_harassment": true
    }
  }'::jsonb,
  'JKKN Dental — Grievance Cell. Dept-level grievances under HOD; institution-level under Principal. Grievance Investigation Committee (GIC) chaired by Principal handles workplace harassment per statutes. Edit via /admin/hr/policies/grievance-cell.',
  'object',
  true
)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ============================================================================
-- Best-effort classification backfill — only runs if W3-M0 substrate is live.
-- All 4 governance keys are 'major' (sensitive: pay-affecting promotions,
-- termination ladder, harassment governance).
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_policies' AND column_name = 'classification'
  ) THEN
    UPDATE platform_policies
    SET classification = 'major'
    WHERE policy_key IN (
      'hr.promotion_policy',
      'hr.code_of_conduct',
      'hr.disciplinary_action',
      'hr.grievance_cell'
    )
      AND scope_type = 'institution'
      AND classification IS DISTINCT FROM 'major';
    RAISE NOTICE 'W3-M6b: classification=major backfilled on governance keys.';
  ELSE
    RAISE NOTICE 'W3-M6b: classification column absent (W3-M0 not yet applied); skipping backfill.';
  END IF;
END $$;

-- ============================================================================
-- Inline smoke-test: assert exactly 8 institution-scoped governance rows
-- landed across the 4 keys. Fails the migration loudly if drift.
-- ============================================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM platform_policies
  WHERE policy_key IN (
      'hr.promotion_policy',
      'hr.code_of_conduct',
      'hr.disciplinary_action',
      'hr.grievance_cell'
    )
    AND scope_type = 'institution'
    AND scope_id IN (
      '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid,
      'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid
    );

  IF v_count <> 8 THEN
    RAISE EXCEPTION 'W3-M6b seed smoke-test FAILED: expected 8 governance policy rows (4 keys x 2 institutions), got %', v_count;
  END IF;

  RAISE NOTICE 'W3-M6b seed smoke-test PASSED: 8 governance policy rows present.';
END $$;

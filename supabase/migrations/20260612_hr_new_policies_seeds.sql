-- ============================================================================
-- Migration: 20260612_hr_new_policies_seeds
-- Wave 3 (M8) — Seed 4 NEW HR policies × 2 institutions with starter drafts
-- ============================================================================
-- HR Policy Manual replacement substrate (NEW policies chapter): surface 4
-- modern HR policies that had no prior JKKN manual content. Seeded with
-- industry-standard starter drafts (Director + CAO will review and customize
-- before publish, per Director lock R3-Q4).
--
-- Per Director lock (2026-05-15): scope_type='institution', classification='major',
-- publication_state='draft_only' (NOT 'published' — starter drafts await Director
-- review). Engineering + Dental institutions resolved by name LIKE pattern
-- (matches sibling M1/M3/M4 pattern).
--
-- Seeds (4 × 2 = 8 rows):
--   1. hr.new.remote_hybrid_work         — Indian higher-ed hybrid work norms
--   2. hr.new.genai_usage                — NIST AI RMF + UGC AI guidelines
--   3. hr.new.social_media_conduct       — personal account boundaries
--   4. hr.new.data_privacy_it_acceptable_use — DPDP Act 2023 compliance
--
-- Starter-content sources cited inline so Director can audit basis:
--   - Indian higher-ed hybrid work norms 2024-2026 (UGC + AICTE post-COVID)
--   - NIST AI Risk Management Framework (NIST AI RMF 1.0, Jan 2023)
--   - UGC AI usage advisory (2023-2024 + IIT Madras institutional AI policy)
--   - Digital Personal Data Protection Act 2023 (Ministry of Electronics & IT)
--
-- TIER 0 — safe-additive (INSERT only with ON CONFLICT DO NOTHING).
-- Idempotent. Safe to re-apply.
--
-- Companion: 4 admin pages at app/(routes)/admin/hr/policies/new/*. Each
-- shows a prominent "Draft Starter Content — Pending Director Review" banner
-- until publication_state flips to 'published'.
-- ============================================================================

DO $migration$
DECLARE
  v_engg_id UUID;
  v_dental_id UUID;
  v_expected_per_inst INT := 4;
  v_engg_actual INT;
  v_dental_actual INT;
BEGIN
  -- ------------------------------------------------------------------------
  -- Resolve institution UUIDs (match sibling M1/M3/M4 pattern).
  -- ------------------------------------------------------------------------
  SELECT id INTO v_engg_id
    FROM public.institutions
    WHERE name ILIKE '%Engineering%'
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1;

  SELECT id INTO v_dental_id
    FROM public.institutions
    WHERE name ILIKE '%Dental College%'
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1;

  IF v_engg_id IS NULL THEN
    RAISE WARNING 'Engineering institution not found; skipping ENGG new-policy seeds.';
  END IF;
  IF v_dental_id IS NULL THEN
    RAISE WARNING 'Dental institution not found; skipping DENTAL new-policy seeds.';
  END IF;

  IF v_engg_id IS NULL AND v_dental_id IS NULL THEN
    RAISE EXCEPTION 'Cannot seed HR new policies: neither Engineering nor Dental institution exists.';
  END IF;

  -- ------------------------------------------------------------------------
  -- 1. hr.new.remote_hybrid_work
  --    Indian higher-ed hybrid work norms; teaching = in-person mandatory;
  --    research / admin / IT = limited remote with HoD/Principal approval.
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.new.remote_hybrid_work', 'institution', v_engg_id,
       jsonb_build_object(
         '_meta', jsonb_build_object(
           'status', 'draft_starter',
           'needs_director_review', true,
           'basis', 'Indian higher-ed hybrid work norms 2024-2026'
         ),
         'eligibility_by_role', jsonb_build_object(
           'teaching_faculty', jsonb_build_object(
             'max_remote_days_per_week', 0,
             'reason', 'in-person teaching required'
           ),
           'research_faculty', jsonb_build_object(
             'max_remote_days_per_week', 1,
             'approval_chain', jsonb_build_array('HoD', 'Principal')
           ),
           'administrative', jsonb_build_object(
             'max_remote_days_per_week', 1
           ),
           'it_support', jsonb_build_object(
             'max_remote_days_per_week', 2
           )
         ),
         'remote_day_requirements', jsonb_build_object(
           'minimum_working_hours_per_remote_day', 7,
           'availability_window_per_remote_day', '10:00-17:00',
           'must_be_reachable_via', jsonb_build_array('whatsapp', 'email', 'phone'),
           'deliverables_documented', true
         ),
         'exception_approval_chain', jsonb_build_array('HoD', 'Principal', 'Director'),
         'trial_period_days_for_new_remote_arrangement', 30
       ),
       'Engineering: remote/hybrid work eligibility, daily availability window, exception chain. STARTER DRAFT — Director review required.',
       'object', 'major', 'draft_only', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.new.remote_hybrid_work', 'institution', v_dental_id,
       jsonb_build_object(
         '_meta', jsonb_build_object(
           'status', 'draft_starter',
           'needs_director_review', true,
           'basis', 'Indian higher-ed hybrid work norms 2024-2026'
         ),
         'eligibility_by_role', jsonb_build_object(
           'teaching_faculty', jsonb_build_object(
             'max_remote_days_per_week', 0,
             'reason', 'in-person teaching required'
           ),
           'research_faculty', jsonb_build_object(
             'max_remote_days_per_week', 1,
             'approval_chain', jsonb_build_array('HoD', 'Principal')
           ),
           'administrative', jsonb_build_object(
             'max_remote_days_per_week', 1
           ),
           'it_support', jsonb_build_object(
             'max_remote_days_per_week', 2
           )
         ),
         'remote_day_requirements', jsonb_build_object(
           'minimum_working_hours_per_remote_day', 7,
           'availability_window_per_remote_day', '10:00-17:00',
           'must_be_reachable_via', jsonb_build_array('whatsapp', 'email', 'phone'),
           'deliverables_documented', true
         ),
         'exception_approval_chain', jsonb_build_array('HoD', 'Principal', 'Director'),
         'trial_period_days_for_new_remote_arrangement', 30
       ),
       'Dental: remote/hybrid work eligibility, daily availability window, exception chain. STARTER DRAFT — Director review required.',
       'object', 'major', 'draft_only', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- ------------------------------------------------------------------------
  -- 2. hr.new.genai_usage
  --    NIST AI RMF + UGC AI guidelines + IIT Madras institutional AI policy.
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.new.genai_usage', 'institution', v_engg_id,
       jsonb_build_object(
         '_meta', jsonb_build_object(
           'status', 'draft_starter',
           'needs_director_review', true,
           'basis', 'NIST AI RMF + UGC AI guidelines + IIT Madras AI usage policy'
         ),
         'permitted_uses', jsonb_build_array(
           'Literature review and synthesis (with citation of AI tool used)',
           'Code generation for non-evaluation projects',
           'Email drafting and language polish',
           'Brainstorming and ideation',
           'Generating practice questions for own study'
         ),
         'prohibited_uses', jsonb_build_array(
           'Final grading or evaluation of student work',
           'Generating examination questions without human review',
           'Writing student feedback or recommendation letters',
           'Submitting AI-generated work as one''s own research',
           'Handling student personal data (PII) via public AI tools'
         ),
         'disclosure_requirements', jsonb_build_object(
           'required_for', jsonb_build_array(
             'academic papers',
             'research grant applications',
             'official college communications'
           ),
           'format', 'Footnote stating AI tool used and scope of assistance'
         ),
         'approved_ai_tools', jsonb_build_array(
           'ChatGPT (no PII)',
           'Claude (no PII)',
           'Gemini (no PII)',
           'local Llama deployments'
         ),
         'blocked_ai_tools', jsonb_build_array(),
         'training_required', false,
         'review_cycle_months', 6
       ),
       'Engineering: GenAI permitted/prohibited use cases, disclosure rules, approved tool list. STARTER DRAFT — Director review required.',
       'object', 'major', 'draft_only', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.new.genai_usage', 'institution', v_dental_id,
       jsonb_build_object(
         '_meta', jsonb_build_object(
           'status', 'draft_starter',
           'needs_director_review', true,
           'basis', 'NIST AI RMF + UGC AI guidelines + IIT Madras AI usage policy'
         ),
         'permitted_uses', jsonb_build_array(
           'Literature review and synthesis (with citation of AI tool used)',
           'Code generation for non-evaluation projects',
           'Email drafting and language polish',
           'Brainstorming and ideation',
           'Generating practice questions for own study'
         ),
         'prohibited_uses', jsonb_build_array(
           'Final grading or evaluation of student work',
           'Generating examination questions without human review',
           'Writing student feedback or recommendation letters',
           'Submitting AI-generated work as one''s own research',
           'Handling student personal data (PII) via public AI tools'
         ),
         'disclosure_requirements', jsonb_build_object(
           'required_for', jsonb_build_array(
             'academic papers',
             'research grant applications',
             'official college communications'
           ),
           'format', 'Footnote stating AI tool used and scope of assistance'
         ),
         'approved_ai_tools', jsonb_build_array(
           'ChatGPT (no PII)',
           'Claude (no PII)',
           'Gemini (no PII)',
           'local Llama deployments'
         ),
         'blocked_ai_tools', jsonb_build_array(),
         'training_required', false,
         'review_cycle_months', 6
       ),
       'Dental: GenAI permitted/prohibited use cases, disclosure rules, approved tool list. STARTER DRAFT — Director review required.',
       'object', 'major', 'draft_only', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- ------------------------------------------------------------------------
  -- 3. hr.new.social_media_conduct
  --    Personal account boundaries; official-vs-personal account rules.
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.new.social_media_conduct', 'institution', v_engg_id,
       jsonb_build_object(
         '_meta', jsonb_build_object(
           'status', 'draft_starter',
           'needs_director_review', true
         ),
         'personal_account_boundaries', jsonb_build_object(
           'may_post_about_employer', true,
           'must_use_personal_disclaimer', 'Views my own, not JKKN''s official position',
           'may_post_about_students_with_consent', false,
           'may_post_about_colleagues_with_consent', true
         ),
         'prohibited_posts', jsonb_build_array(
           'Student photos, names, or work without written consent',
           'Internal institutional decisions before official announcement',
           'Confidential exam content',
           'Comments on disciplinary cases (active or past)',
           'Religious/political/communal content tagged with JKKN affiliation'
         ),
         'official_communications', jsonb_build_object(
           'must_route_through', 'Director / General Manager - Communications',
           'personal_accounts_for_official_use_prohibited', true
         ),
         'violation_consequences', 'Per disciplinary action policy'
       ),
       'Engineering: social media conduct boundaries, prohibited posts, official-vs-personal account rules. STARTER DRAFT — Director review required.',
       'object', 'major', 'draft_only', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.new.social_media_conduct', 'institution', v_dental_id,
       jsonb_build_object(
         '_meta', jsonb_build_object(
           'status', 'draft_starter',
           'needs_director_review', true
         ),
         'personal_account_boundaries', jsonb_build_object(
           'may_post_about_employer', true,
           'must_use_personal_disclaimer', 'Views my own, not JKKN''s official position',
           'may_post_about_students_with_consent', false,
           'may_post_about_colleagues_with_consent', true
         ),
         'prohibited_posts', jsonb_build_array(
           'Student photos, names, or work without written consent',
           'Internal institutional decisions before official announcement',
           'Confidential exam content',
           'Comments on disciplinary cases (active or past)',
           'Religious/political/communal content tagged with JKKN affiliation'
         ),
         'official_communications', jsonb_build_object(
           'must_route_through', 'Director / General Manager - Communications',
           'personal_accounts_for_official_use_prohibited', true
         ),
         'violation_consequences', 'Per disciplinary action policy'
       ),
       'Dental: social media conduct boundaries, prohibited posts, official-vs-personal account rules. STARTER DRAFT — Director review required.',
       'object', 'major', 'draft_only', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- ------------------------------------------------------------------------
  -- 4. hr.new.data_privacy_it_acceptable_use
  --    DPDP Act 2023 compliant; college device use; BYOD; phishing.
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.new.data_privacy_it_acceptable_use', 'institution', v_engg_id,
       jsonb_build_object(
         '_meta', jsonb_build_object(
           'status', 'draft_starter',
           'needs_director_review', true,
           'basis', 'Digital Personal Data Protection Act 2023'
         ),
         'student_data_handling', jsonb_build_object(
           'lawful_processing_basis', 'consent_or_legitimate_purpose',
           'encryption_at_rest_required', true,
           'encryption_in_transit_required', true,
           'data_localization_india_required', true,
           'deletion_on_request_window_days', 30,
           'breach_notification_window_hours', 72
         ),
         'college_device_use', jsonb_build_object(
           'personal_use_permitted_outside_working_hours', true,
           'monitored', true,
           'antivirus_required', true,
           'no_unauthorized_software_install', true
         ),
         'byod_rules', jsonb_build_object(
           'permitted', true,
           'mdm_enrollment_required_for_student_data_access', true,
           'approved_apps_only_for_official_data', true
         ),
         'phishing_reporting', jsonb_build_object(
           'report_to', 'IT helpdesk + Principal',
           'no_consequences_for_false_positives', true
         ),
         'password_hygiene', jsonb_build_object(
           'min_length', 12,
           'rotation_days', 90,
           'mfa_required_for', jsonb_build_array('admin accounts', 'student data systems')
         )
       ),
       'Engineering: DPDP Act 2023 compliance, student data handling, BYOD, phishing reporting, password hygiene. STARTER DRAFT — Director review required.',
       'object', 'major', 'draft_only', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.new.data_privacy_it_acceptable_use', 'institution', v_dental_id,
       jsonb_build_object(
         '_meta', jsonb_build_object(
           'status', 'draft_starter',
           'needs_director_review', true,
           'basis', 'Digital Personal Data Protection Act 2023'
         ),
         'student_data_handling', jsonb_build_object(
           'lawful_processing_basis', 'consent_or_legitimate_purpose',
           'encryption_at_rest_required', true,
           'encryption_in_transit_required', true,
           'data_localization_india_required', true,
           'deletion_on_request_window_days', 30,
           'breach_notification_window_hours', 72
         ),
         'college_device_use', jsonb_build_object(
           'personal_use_permitted_outside_working_hours', true,
           'monitored', true,
           'antivirus_required', true,
           'no_unauthorized_software_install', true
         ),
         'byod_rules', jsonb_build_object(
           'permitted', true,
           'mdm_enrollment_required_for_student_data_access', true,
           'approved_apps_only_for_official_data', true
         ),
         'phishing_reporting', jsonb_build_object(
           'report_to', 'IT helpdesk + Principal',
           'no_consequences_for_false_positives', true
         ),
         'password_hygiene', jsonb_build_object(
           'min_length', 12,
           'rotation_days', 90,
           'mfa_required_for', jsonb_build_array('admin accounts', 'student data systems')
         )
       ),
       'Dental: DPDP Act 2023 compliance, student data handling, BYOD, phishing reporting, password hygiene. STARTER DRAFT — Director review required.',
       'object', 'major', 'draft_only', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- ------------------------------------------------------------------------
  -- Smoke test: assert per-institution count == 4.
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_engg_actual
      FROM public.platform_policies
      WHERE scope_type = 'institution'
        AND scope_id = v_engg_id
        AND policy_key LIKE 'hr.new.%';

    IF v_engg_actual <> v_expected_per_inst THEN
      RAISE EXCEPTION 'Engineering new-policy seed count mismatch: expected %, got %', v_expected_per_inst, v_engg_actual;
    END IF;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dental_actual
      FROM public.platform_policies
      WHERE scope_type = 'institution'
        AND scope_id = v_dental_id
        AND policy_key LIKE 'hr.new.%';

    IF v_dental_actual <> v_expected_per_inst THEN
      RAISE EXCEPTION 'Dental new-policy seed count mismatch: expected %, got %', v_expected_per_inst, v_dental_actual;
    END IF;
  END IF;

  RAISE NOTICE 'Wave 3 M8 new-policy seeds OK. Engineering=%, Dental=%.',
    COALESCE(v_engg_actual, 0), COALESCE(v_dental_actual, 0);
END;
$migration$;

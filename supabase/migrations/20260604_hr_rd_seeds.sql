-- ============================================================================
-- Migration: 20260604_hr_rd_seeds
-- Wave 3 (M3) — Seed 5 R&D HR policies × 2 institutions
-- ============================================================================
-- HR Policy Manual replacement substrate (R&D chapter): surface 5 R&D policies
-- (publication incentives, WFH rules, research leave, excursion, incentive
-- authority) as JSONB rows in `platform_policies`, scoped per institution.
-- Director-tweakable via /admin/hr/policies/rd/* admin pages (shipped in this
-- PR) — no deploy needed.
--
-- Per Director lock (2026-05-15): scope_type='institution', classification='major'.
-- All seeds default publication_state='published'. Engineering + Dental
-- institutions resolved by name LIKE pattern (matches sibling M1 pattern).
--
-- Seeds:
--   1. hr.rd.publication_incentives — incentive matrix for publishing papers
--   2. hr.rd.wfh_rules              — WFH eligibility (capped by publication count)
--   3. hr.rd.research_leave         — annual research-CL ceiling per faculty
--   4. hr.rd.excursion              — eligibility rule (per-institution variant)
--   5. hr.rd.incentive_authority    — who approves incentive payouts
--
-- TIER 0 — safe-additive (INSERT only with ON CONFLICT DO NOTHING).
-- Idempotent. Safe to re-apply.
--
-- Companion: 5 admin pages at app/(routes)/admin/hr/policies/rd/*. Pages
-- reference policy_keys via string literals during consolidation window;
-- cleanup PR after M0 lands flips them to constants in lib/policies/keys.ts.
-- ============================================================================

DO $migration$
DECLARE
  v_engg_id UUID;
  v_dental_id UUID;
  v_expected_per_inst INT := 5;
  v_engg_actual INT;
  v_dental_actual INT;
BEGIN
  -- ------------------------------------------------------------------------
  -- Resolve institution UUIDs (match sibling M1 pattern).
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
    RAISE WARNING 'Engineering institution not found; skipping ENGG R&D seeds.';
  END IF;
  IF v_dental_id IS NULL THEN
    RAISE WARNING 'Dental institution not found; skipping DENTAL R&D seeds.';
  END IF;

  IF v_engg_id IS NULL AND v_dental_id IS NULL THEN
    RAISE EXCEPTION 'Cannot seed HR R&D policies: neither Engineering nor Dental institution exists.';
  END IF;

  -- ------------------------------------------------------------------------
  -- 1. hr.rd.publication_incentives (JSONB §5)
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.rd.publication_incentives', 'institution', v_engg_id,
       jsonb_build_object(
         'min_impact_factor_for_conf_sponsorship', 0.5,
         'papers_required_for_conf_sponsorship', 2,
         'papers_required_for_md_additional_facilities', 5,
         'min_impact_factor_for_national_seminar', 1.0,
         'papers_required_for_national_seminar_TADA', 2,
         'papers_plus_patent_eligibility', jsonb_build_object('papers', 3, 'patents', 1),
         'reimbursement_claim_window_months', 1,
         'reimbursement_approver_chain', jsonb_build_array('Principal', 'Director'),
         'claim_form_doc_ref', 'https://drive.jkkn.ac.in/hr/forms/rd-claim-form',
         'reimbursement_policy_doc_ref', 'https://drive.jkkn.ac.in/hr/policy/rd-reimbursement'
       ),
       'Engineering: publication incentive matrix (papers/patents thresholds, reimbursement window, approver chain).',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.rd.publication_incentives', 'institution', v_dental_id,
       jsonb_build_object(
         'min_impact_factor_for_conf_sponsorship', 0.5,
         'papers_required_for_conf_sponsorship', 2,
         'papers_required_for_md_additional_facilities', 5,
         'min_impact_factor_for_national_seminar', 1.0,
         'papers_required_for_national_seminar_TADA', 2,
         'papers_plus_patent_eligibility', jsonb_build_object('papers', 3, 'patents', 1),
         'reimbursement_claim_window_months', 1,
         'reimbursement_approver_chain', jsonb_build_array('Principal', 'Director'),
         'claim_form_doc_ref', 'https://drive.jkkn.ac.in/hr/forms/rd-claim-form',
         'reimbursement_policy_doc_ref', 'https://drive.jkkn.ac.in/hr/policy/rd-reimbursement'
       ),
       'Dental: publication incentive matrix (papers/patents thresholds, reimbursement window, approver chain).',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- ------------------------------------------------------------------------
  -- 2. hr.rd.wfh_rules (JSONB §6)
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.rd.wfh_rules', 'institution', v_engg_id,
       jsonb_build_object(
         'max_per_week', 1,
         'required_indexing', jsonb_build_array('SCOPUS', 'WOS'),
         'approval_chain', jsonb_build_array('Principal', 'Director'),
         'publication_proof_required_fields', jsonb_build_array('vol_no', 'issue_no', 'PP'),
         'requires_published_indexed_pub', true
       ),
       'Engineering: WFH eligibility — capped by indexed-publication count and approver chain.',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.rd.wfh_rules', 'institution', v_dental_id,
       jsonb_build_object(
         'max_per_week', 1,
         'required_indexing', jsonb_build_array('SCOPUS', 'WOS'),
         'approval_chain', jsonb_build_array('Principal', 'Director'),
         'publication_proof_required_fields', jsonb_build_array('vol_no', 'issue_no', 'PP'),
         'requires_published_indexed_pub', true
       ),
       'Dental: WFH eligibility — capped by indexed-publication count and approver chain.',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- ------------------------------------------------------------------------
  -- 3. hr.rd.research_leave (JSONB §7)
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.rd.research_leave', 'institution', v_engg_id,
       jsonb_build_object(
         'max_days_per_year', 10,
         'combinable_with_special_cl_only', true,
         'combinable_with_holidays', true,
         'holidays_count_as_research_cl', false,
         'exception_approver_chain', jsonb_build_array('Principal', 'Director'),
         'label_per_institution', jsonb_build_object('engineering', 'Special Leave', 'dental', 'Casual Leave for Research')
       ),
       'Engineering: research-leave ceiling, combinability rules, exception approver chain.',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.rd.research_leave', 'institution', v_dental_id,
       jsonb_build_object(
         'max_days_per_year', 10,
         'combinable_with_special_cl_only', true,
         'combinable_with_holidays', true,
         'holidays_count_as_research_cl', false,
         'exception_approver_chain', jsonb_build_array('Principal', 'Director'),
         'label_per_institution', jsonb_build_object('engineering', 'Special Leave', 'dental', 'Casual Leave for Research')
       ),
       'Dental: research-leave ceiling, combinability rules, exception approver chain.',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- ------------------------------------------------------------------------
  -- 4. hr.rd.excursion (JSONB §8) — per-institution variant
  --   Engineering: papers_published eligibility model
  --   Dental:      facilitator_grade eligibility model
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.rd.excursion', 'institution', v_engg_id,
       jsonb_build_object(
         'eligibility_model', 'papers_published',
         'min_papers_published', 2,
         'top_n_eligible_with_family', 10,
         'must_be_during_holidays', true,
         'management_contribution_rule', 'case_by_case',
         'documentation_required', true,
         'documentation_storage_ref', 'Staff Drive Excursions folder',
         'application_form_ref', 'https://drive.jkkn.ac.in/hr/forms/excursion-application'
       ),
       'Engineering: excursion eligibility driven by published-paper count (top N go with family).',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.rd.excursion', 'institution', v_dental_id,
       jsonb_build_object(
         'eligibility_model', 'facilitator_grade',
         'facilitator_grade_min', 'B',
         'facilitator_grading_doc_ref', 'https://drive.jkkn.ac.in/hr/policy/facilitator-grading',
         'must_be_during_holidays', true,
         'management_contribution_rule', 'case_by_case',
         'documentation_required', true,
         'documentation_storage_ref', 'Staff Drive Excursions folder',
         'application_form_ref', 'https://drive.jkkn.ac.in/hr/forms/excursion-application'
       ),
       'Dental: excursion eligibility driven by facilitator grade (case-by-case management contribution).',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- ------------------------------------------------------------------------
  -- 5. hr.rd.incentive_authority (JSONB §9)
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.rd.incentive_authority', 'institution', v_engg_id,
       jsonb_build_object(
         'journal_pub_assistance_basis', 'depends_on_journal_nature',
         'sponsored_research_overhead_approver', 'MD',
         'sponsored_research_pi_authority', 'MD',
         'sponsored_research_approval_basis', 'case_by_case_by_management'
       ),
       'Engineering: who approves R&D incentive payouts (journal assistance + sponsored-research overheads + PI authority).',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.rd.incentive_authority', 'institution', v_dental_id,
       jsonb_build_object(
         'journal_pub_assistance_basis', 'depends_on_journal_nature',
         'sponsored_research_overhead_approver', 'MD',
         'sponsored_research_pi_authority', 'MD',
         'sponsored_research_approval_basis', 'case_by_case_by_management'
       ),
       'Dental: who approves R&D incentive payouts (journal assistance + sponsored-research overheads + PI authority).',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- ------------------------------------------------------------------------
  -- Smoke test: assert per-institution count == 5.
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_engg_actual
      FROM public.platform_policies
      WHERE scope_type = 'institution'
        AND scope_id = v_engg_id
        AND policy_key LIKE 'hr.rd.%';

    IF v_engg_actual <> v_expected_per_inst THEN
      RAISE EXCEPTION 'Engineering R&D seed count mismatch: expected %, got %', v_expected_per_inst, v_engg_actual;
    END IF;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dental_actual
      FROM public.platform_policies
      WHERE scope_type = 'institution'
        AND scope_id = v_dental_id
        AND policy_key LIKE 'hr.rd.%';

    IF v_dental_actual <> v_expected_per_inst THEN
      RAISE EXCEPTION 'Dental R&D seed count mismatch: expected %, got %', v_expected_per_inst, v_dental_actual;
    END IF;
  END IF;

  RAISE NOTICE 'Wave 3 M3 R&D seeds OK. Engineering=%, Dental=%.',
    COALESCE(v_engg_actual, 0), COALESCE(v_dental_actual, 0);
END;
$migration$;

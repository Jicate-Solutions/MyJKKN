-- ============================================================================
-- Migration: 20260610_hr_governance_part3_seeds
-- Wave 3 (M6c) — Seed 3 governance HR policies × 2 institutions
-- ============================================================================
-- HR Policy Manual replacement substrate (Governance — part 3 of 3): surface
-- 3 governance/workflow policies (general excursion, resignation workflow,
-- paper-publication reimbursement workflow) as JSONB rows in
-- `platform_policies`, scoped per institution. Director-tweakable via
-- /admin/hr/policies/{excursion-general,resignation-workflow,reimbursement-workflow}
-- admin pages (shipped in this PR) — no deploy needed.
--
-- Per Director lock (2026-05-15): scope_type='institution', classification='major',
-- publication_state='published'. Engineering + Dental institutions resolved by
-- name LIKE pattern (matches sibling M1/M3 pattern).
--
-- Seeds (3 keys × 2 institutions = 6 rows):
--   1. hr.excursion_general        — institution-level excursion types + approval
--   2. hr.resignation_workflow     — RULE substrate: min service, notice, etc.
--   3. hr.reimbursement_workflow   — paper publication reimbursement workflow
--
-- IMPORTANT relationship — RULE vs CASE substrates:
--   `hr.resignation_workflow` (THIS policy) stores the RULES governing
--   resignations (min 2-year service, 2-month notice, end-of-AY constraint).
--   `hr_offboarding_cases` (Wave 1 γ #890, migration
--   20260515000004_hr_offboarding_substrate.sql) stores actual resignation
--   CASE INSTANCES — one row per staff exit. Both coexist:
--     - this RULE substrate drives policy enforcement at submission time
--     - the CASE substrate records the resulting workflow execution
--
-- Per spec §32, §34, §35 (specs/hr-policy-jsonb-structures-2026-05-15.md).
--
-- NOTE on scope: spec §34/§35 originally proposed scope_type='global'. The
-- Director's Wave 3 M6c lock (task brief) elects scope_type='institution' so
-- the two colleges (Engineering / Dental) can tune notice period, reimbursement
-- approver chain, etc. independently if they ever diverge. Today the seeds are
-- identical across the two institutions for #34 and #35; editing diverges them.
--
-- TIER 0 — safe-additive (INSERT only with ON CONFLICT DO NOTHING).
-- Idempotent. Safe to re-apply.
--
-- Companion: 3 admin pages at
--   app/(routes)/admin/hr/policies/excursion-general/page.tsx
--   app/(routes)/admin/hr/policies/resignation-workflow/page.tsx
--   app/(routes)/admin/hr/policies/reimbursement-workflow/page.tsx
-- All re-use the shared <InstitutionPolicyEditor /> shipped in Wave 3 M1.
-- ============================================================================

DO $migration$
DECLARE
  v_engg_id UUID;
  v_dental_id UUID;
  v_expected_per_inst INT := 3;
  v_engg_actual INT;
  v_dental_actual INT;
BEGIN
  -- ------------------------------------------------------------------------
  -- Resolve institution UUIDs (match sibling M1/M3 pattern).
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
    RAISE WARNING 'Engineering institution not found; skipping ENGG governance-part3 seeds.';
  END IF;
  IF v_dental_id IS NULL THEN
    RAISE WARNING 'Dental institution not found; skipping DENTAL governance-part3 seeds.';
  END IF;

  IF v_engg_id IS NULL AND v_dental_id IS NULL THEN
    RAISE EXCEPTION 'Cannot seed HR governance-part3 policies: neither Engineering nor Dental institution exists.';
  END IF;

  -- ------------------------------------------------------------------------
  -- 1. hr.excursion_general (JSONB §32)
  --    Institution-level excursion programme (separate from R&D hr.rd.excursion
  --    in M3 which is the R&D-incentive variant). Lists permitted excursion
  --    types and who approves day excursions.
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.excursion_general', 'institution', v_engg_id,
       jsonb_build_object(
         'types', jsonb_build_array(
           'day', 'overnight', 'camp', 'interstate',
           'international', 'weekend_vacation', 'adventure', 'sea_air'
         ),
         'day_excursion_approver', 'Principal_or_nominee',
         'approval_form_required', true,
         'educational_outcome_assessment_required', true,
         'impact_on_school_assessment_required', true
       ),
       'Engineering: institution-level excursion programme — permitted types and approval flow (separate from R&D incentive excursion).',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.excursion_general', 'institution', v_dental_id,
       jsonb_build_object(
         'types', jsonb_build_array(
           'day', 'overnight', 'camp', 'interstate',
           'international', 'weekend_vacation', 'adventure', 'sea_air'
         ),
         'day_excursion_approver', 'Principal_or_nominee',
         'approval_form_required', true,
         'educational_outcome_assessment_required', true,
         'impact_on_school_assessment_required', true
       ),
       'Dental: institution-level excursion programme — permitted types and approval flow (separate from R&D incentive excursion).',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- ------------------------------------------------------------------------
  -- 2. hr.resignation_workflow (JSONB §34)
  --    RULE substrate: governs when/how a resignation may be filed and
  --    settled. The CASE table is hr_offboarding_cases (Wave 1 γ #890).
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.resignation_workflow', 'institution', v_engg_id,
       jsonb_build_object(
         'per_appointment_letter_provisions', true,
         'dues_settlement_requires_clearance_form', true,
         'min_service_years', 2,
         'notice_period_months', 2,
         'notice_or_pay_in_lieu', true,
         'notice_starts_after_md_approval', true,
         'end_of_academic_year_only', true,
         'offboarding_workflow_doc_ref', 'https://drive.jkkn.ac.in/hr/policy/offboarding-workflow'
       ),
       'Engineering: resignation rules — minimum service (2y), notice period (2mo), academic-year alignment. Case execution lives in hr_offboarding_cases.',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.resignation_workflow', 'institution', v_dental_id,
       jsonb_build_object(
         'per_appointment_letter_provisions', true,
         'dues_settlement_requires_clearance_form', true,
         'min_service_years', 2,
         'notice_period_months', 2,
         'notice_or_pay_in_lieu', true,
         'notice_starts_after_md_approval', true,
         'end_of_academic_year_only', true,
         'offboarding_workflow_doc_ref', 'https://drive.jkkn.ac.in/hr/policy/offboarding-workflow'
       ),
       'Dental: resignation rules — minimum service (2y), notice period (2mo), academic-year alignment. Case execution lives in hr_offboarding_cases.',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- ------------------------------------------------------------------------
  -- 3. hr.reimbursement_workflow (JSONB §35)
  --    Paper-publication reimbursement workflow: how authors apply, who
  --    approves, what windows / one-on-one requirements apply.
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.reimbursement_workflow', 'institution', v_engg_id,
       jsonb_build_object(
         'paper_authors_apply_via_hr_app', true,
         'application_window_months', 1,
         'select_principal_not_reporting_manager', true,
         'director_one_on_one_required', true,
         'claim_form_template_ref', 'https://drive.jkkn.ac.in/hr/forms/publication-reimbursement-claim',
         'r_and_d_policy_doc_ref', 'https://drive.jkkn.ac.in/hr/policy/rd-reimbursement'
       ),
       'Engineering: paper-publication reimbursement workflow — authors apply via HR app, 1-month window, Director 1:1 confirmation.',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type,
       classification, publication_state, is_system)
    VALUES
      ('hr.reimbursement_workflow', 'institution', v_dental_id,
       jsonb_build_object(
         'paper_authors_apply_via_hr_app', true,
         'application_window_months', 1,
         'select_principal_not_reporting_manager', true,
         'director_one_on_one_required', true,
         'claim_form_template_ref', 'https://drive.jkkn.ac.in/hr/forms/publication-reimbursement-claim',
         'r_and_d_policy_doc_ref', 'https://drive.jkkn.ac.in/hr/policy/rd-reimbursement'
       ),
       'Dental: paper-publication reimbursement workflow — authors apply via HR app, 1-month window, Director 1:1 confirmation.',
       'object', 'major', 'published', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- ------------------------------------------------------------------------
  -- Smoke test: assert per-institution count == 3 for our 3 keys.
  -- ------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_engg_actual
      FROM public.platform_policies
      WHERE scope_type = 'institution'
        AND scope_id = v_engg_id
        AND policy_key IN ('hr.excursion_general',
                           'hr.resignation_workflow',
                           'hr.reimbursement_workflow');

    IF v_engg_actual <> v_expected_per_inst THEN
      RAISE EXCEPTION 'Engineering governance-part3 seed count mismatch: expected %, got %',
        v_expected_per_inst, v_engg_actual;
    END IF;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_dental_actual
      FROM public.platform_policies
      WHERE scope_type = 'institution'
        AND scope_id = v_dental_id
        AND policy_key IN ('hr.excursion_general',
                           'hr.resignation_workflow',
                           'hr.reimbursement_workflow');

    IF v_dental_actual <> v_expected_per_inst THEN
      RAISE EXCEPTION 'Dental governance-part3 seed count mismatch: expected %, got %',
        v_expected_per_inst, v_dental_actual;
    END IF;
  END IF;

  RAISE NOTICE 'Wave 3 M6c governance-part3 seeds OK. Engineering=%, Dental=%.',
    COALESCE(v_engg_actual, 0), COALESCE(v_dental_actual, 0);
END;
$migration$;

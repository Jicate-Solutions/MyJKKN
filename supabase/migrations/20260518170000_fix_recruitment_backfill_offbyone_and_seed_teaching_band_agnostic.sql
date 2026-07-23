-- ============================================================================
-- 20260518170000_fix_recruitment_backfill_offbyone_and_seed_teaching_band_agnostic
-- ----------------------------------------------------------------------------
-- Two-part fix that unblocks 14 stuck teaching-faculty candidates in org
-- feb0b6ae-b040-4c21-94e0-d2243155ff5d (including Sethupriya at
-- ee9d4b7b-e638-4609-b568-99beb1f4a4c1) which have empty approval_chain
-- AND no salary band, leaving them un-approvable through any path.
--
-- PART 1 — Off-by-one fix in fn_backfill_empty_recruitment_chains
--   Previous version set current_step = 1 after backfill, but JS
--   submitCandidate (lib/services/hr/recruitment-service.ts:448) sets
--   current_step = 0, and JS approveCandidate reads
--   chain[candidate.current_step] (0-indexed). A backfilled row with
--   current_step = 1 silently SKIPS the first approver on a 2-step chain
--   (e.g., medical_superintendent skipped in [medical_superintendent,
--   director]) and THROWS "Approval chain exhausted" for any 1-step
--   chain (e.g., Teaching Faculty Over Rs.1L Director-only flow). This
--   fix sets current_step = 0 to match the canonical JS path.
--
-- PART 2 — Band-agnostic Teaching Faculty fallback flow
--   The 3 existing teaching_faculty flows each require a specific salary
--   band (under_50k / 50k_to_1L / over_1L). When a candidate is
--   submitted with proposed_monthly_salary_band = NULL (legacy path),
--   no flow matches and the backfill function reports no_match. This
--   adds one band-agnostic flow that the Priority-2 branch of the
--   backfill function can match for any teaching_faculty candidate that
--   lacks a salary band. The chain routes a single step to Director,
--   who can either approve directly OR send back for proper
--   salary-band classification.
--
-- IDEMPOTENCY
--   Part 1: CREATE OR REPLACE FUNCTION is natively idempotent.
--   Part 2: INSERT ... WHERE NOT EXISTS guards against re-apply on prod
--           where the row may already exist. Match key: org +
--           recruitment_approval + active + role_category=teaching_faculty
--           + salary_band IS NULL/empty (the exact Priority-2 fallback
--           shape).
--
-- TIER classification
--   TIER-1 (modifies a SECURITY DEFINER function + inserts one policy
--   row that affects future legacy-path teaching_faculty submissions).
--   Requires Director typed approval before apply on prod.
-- ============================================================================

-- =====================================================================
-- PART 1 — Off-by-one fix in fn_backfill_empty_recruitment_chains
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_backfill_empty_recruitment_chains(
  p_hr_org_id uuid,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scanned     int := 0;
  v_backfilled  int := 0;
  v_no_match    int := 0;
  v_details     jsonb := '[]'::jsonb;
  v_candidate   record;
  v_flow        record;
  v_chain       jsonb;
  v_step        jsonb;
  v_step_in     jsonb;
  v_idx         int;
BEGIN
  IF p_hr_org_id IS NULL THEN
    RAISE EXCEPTION 'p_hr_org_id is required';
  END IF;

  -- Iterate empty-chain pending candidates for this org
  FOR v_candidate IN
    SELECT id, name, role_category, proposed_monthly_salary_band
    FROM hr_recruitment_candidates
    WHERE hr_organization_id = p_hr_org_id
      AND status IN ('submitted', 'pending_approval')
      AND (approval_chain IS NULL OR approval_chain = '[]'::jsonb)
    ORDER BY created_at NULLS LAST, id
  LOOP
    v_scanned := v_scanned + 1;

    -- Priority 1: exact match on (role_category, salary_band).
    -- Priority 2: role_category only (candidate has no band, or no exact match).
    v_flow := NULL;

    IF v_candidate.proposed_monthly_salary_band IS NOT NULL THEN
      SELECT id, flow_name, steps
      INTO v_flow
      FROM hr_approval_flows
      WHERE hr_organization_id = p_hr_org_id
        AND flow_for = 'recruitment_approval'
        AND is_active = true
        AND conditions->>'role_category' = v_candidate.role_category
        AND conditions->>'monthly_salary_band' = v_candidate.proposed_monthly_salary_band
      ORDER BY created_at NULLS LAST
      LIMIT 1;
    END IF;

    IF v_flow IS NULL THEN
      SELECT id, flow_name, steps
      INTO v_flow
      FROM hr_approval_flows
      WHERE hr_organization_id = p_hr_org_id
        AND flow_for = 'recruitment_approval'
        AND is_active = true
        AND conditions->>'role_category' = v_candidate.role_category
        AND (conditions->>'monthly_salary_band' IS NULL
             OR conditions->>'monthly_salary_band' = '')
      ORDER BY created_at NULLS LAST
      LIMIT 1;
    END IF;

    IF v_flow IS NULL THEN
      v_no_match := v_no_match + 1;
      v_details := v_details || jsonb_build_object(
        'candidate_id', v_candidate.id,
        'candidate_name', v_candidate.name,
        'role_category', v_candidate.role_category,
        'salary_band', v_candidate.proposed_monthly_salary_band,
        'matched_flow_name', NULL,
        'would_set_chain', NULL,
        'chain_step_count', NULL
      );
      CONTINUE;
    END IF;

    -- Build chain snapshot mirroring the JS buildApprovalChain shape.
    v_chain := '[]'::jsonb;
    v_idx := 0;
    FOR v_step_in IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_flow.steps, '[]'::jsonb))
    LOOP
      v_idx := v_idx + 1;
      v_step := jsonb_build_object(
        'step_order',
          COALESCE((v_step_in->>'chain_order')::int, v_idx),
        'approver_role', v_step_in->>'approver_role',
        'approver_user_id', NULL,
        'status', 'pending',
        'escalate_after_hours',
          COALESCE((v_step_in->>'escalate_after_hours')::int, 72)
      );
      v_chain := v_chain || jsonb_build_array(v_step);
    END LOOP;

    IF NOT p_dry_run THEN
      UPDATE hr_recruitment_candidates
      SET approval_chain = v_chain,
          current_step = 0,  -- FIX: was 1; JS submitCandidate sets 0; chain is 0-indexed
          updated_at = now()
      WHERE id = v_candidate.id
        AND (approval_chain IS NULL OR approval_chain = '[]'::jsonb);
    END IF;

    v_backfilled := v_backfilled + 1;
    v_details := v_details || jsonb_build_object(
      'candidate_id', v_candidate.id,
      'candidate_name', v_candidate.name,
      'role_category', v_candidate.role_category,
      'salary_band', v_candidate.proposed_monthly_salary_band,
      'matched_flow_name', v_flow.flow_name,
      'would_set_chain', v_chain,
      'chain_step_count', jsonb_array_length(v_chain)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'scanned', v_scanned,
    'backfilled', v_backfilled,
    'no_match', v_no_match,
    'details', v_details
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_backfill_empty_recruitment_chains(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_backfill_empty_recruitment_chains(uuid, boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_backfill_empty_recruitment_chains(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.fn_backfill_empty_recruitment_chains(uuid, boolean) IS
  'Backfills approval_chain on hr_recruitment_candidates with empty chains. '
  'Mirrors buildApprovalChain in lib/services/hr/recruitment-service.ts. '
  'p_dry_run=true (default) returns what would change without writing. '
  'Sets current_step = 0 (zero-indexed) to match the canonical JS path.';

-- =====================================================================
-- PART 2 — Band-agnostic Teaching Faculty fallback flow
-- =====================================================================
-- Routes any teaching_faculty candidate without a salary band to
-- Director as the sole approver. The Priority-2 branch of
-- fn_backfill_empty_recruitment_chains matches this flow because
-- conditions does not set 'monthly_salary_band', so
-- conditions->>'monthly_salary_band' returns NULL.

INSERT INTO public.hr_approval_flows (
  id,
  hr_organization_id,
  flow_for,
  flow_name,
  conditions,
  steps,
  is_active,
  created_at
)
SELECT
  gen_random_uuid(),
  'feb0b6ae-b040-4c21-94e0-d2243155ff5d'::uuid,
  'recruitment_approval',
  'Teaching Faculty — Band-agnostic (Director fallback)',
  '{"role_category":"teaching_faculty"}'::jsonb,
  '[{"chain_order":1,"approver_role":"director","escalate_after_hours":72}]'::jsonb,
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.hr_approval_flows
  WHERE hr_organization_id = 'feb0b6ae-b040-4c21-94e0-d2243155ff5d'::uuid
    AND flow_for = 'recruitment_approval'
    AND is_active = true
    AND conditions->>'role_category' = 'teaching_faculty'
    AND (conditions->>'monthly_salary_band' IS NULL
         OR conditions->>'monthly_salary_band' = '')
);

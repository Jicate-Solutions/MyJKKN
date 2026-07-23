-- ============================================================================
-- fn_backfill_empty_recruitment_chains
-- ----------------------------------------------------------------------------
-- Director-pressable backfill for hr_recruitment_candidates rows that were
-- submitted before the chain-builder was fully configured and ended up with
-- approval_chain = '[]' or NULL. Without a chain, they sit forever in the
-- pending queue: no approver row to consult.
--
-- This fn mirrors the JS buildApprovalChain (lib/services/hr/recruitment-service.ts):
--   - Scans candidates in (status IN ('submitted','pending_approval')) with empty chain
--   - For each, finds the best matching active flow in hr_approval_flows:
--       priority: (role_category + monthly_salary_band) > (role_category only)
--   - If matched: builds chain snapshot with same step shape as JS path
--   - If not matched: reports candidate as no_match (does NOT skip silently)
--   - Dry-run mode reports what WOULD happen; apply mode UPDATEs the row.
--
-- Returns jsonb:
--   { dry_run, scanned, backfilled, no_match,
--     details: [{ candidate_id, candidate_name, role_category, salary_band,
--                 matched_flow_name|null, would_set_chain|null,
--                 chain_step_count|null }] }
-- ============================================================================

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

    -- Find best matching flow.
    -- Priority 1: exact match on role_category + monthly_salary_band.
    -- Priority 2: role_category only (when candidate has no salary_band, or
    --             no exact-band flow exists).
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
      -- Report as no_match; do NOT update
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
          current_step = 1,
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

-- ACL: lock down — caller already requires super_admin via the API route guard.
REVOKE EXECUTE ON FUNCTION public.fn_backfill_empty_recruitment_chains(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_backfill_empty_recruitment_chains(uuid, boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_backfill_empty_recruitment_chains(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.fn_backfill_empty_recruitment_chains(uuid, boolean) IS
  'Backfills approval_chain on hr_recruitment_candidates with empty chains. '
  'Mirrors buildApprovalChain in lib/services/hr/recruitment-service.ts. '
  'p_dry_run=true (default) returns what would change without writing.';

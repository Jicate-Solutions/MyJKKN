-- ============================================================================
-- 20260510100003 — admission_adopt_structure_for_lead RPC
-- ============================================================================
-- Atomically: flip legacy_fee_mode=false, resolve fee_items via the existing
-- resolution RPC, persist resolved items. Any RAISE EXCEPTION rolls back.
--
-- Replaces the Plan 3 service-level sequence (flip-flag + resolve + log) with
-- a single SECURITY DEFINER call so the flag flip and fee resolution are
-- transactionally atomic.
--
-- Permission gate: admission_fees.manage_adjustments
-- (admin-tier; granted in 20260507100003)
--
-- Plan: 2026-05-05-admission-fees-plan-06-cutover-adoption.md Task 6
-- Spec §12.1
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admission_adopt_structure_for_lead(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resolved jsonb;
    v_caller   uuid := auth.uid();
BEGIN
    IF NOT public.user_has_permission('admission_fees.manage_adjustments') THEN
        RAISE EXCEPTION 'permission_denied: admission_fees.manage_adjustments required'
            USING ERRCODE = '42501';
    END IF;

    -- Flip the flag
    UPDATE public.learners_profiles
       SET legacy_fee_mode = false,
           updated_at = now(),
           updated_by = v_caller
     WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    -- Resolve fee_items (this also writes them back to the row)
    v_resolved := public.admission_resolve_fee_items_for_lead(p_learner_id);

    -- Hard fail if no match — adoption shouldn't succeed silently into empty fees
    IF jsonb_array_length(v_resolved) = 0 THEN
        RAISE EXCEPTION 'adopt_structure_no_match: 8-dim lookup found no fee structure';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'learner_id', p_learner_id,
        'fee_items', v_resolved,
        'item_count', jsonb_array_length(v_resolved)
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_adopt_structure_for_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_adopt_structure_for_lead(uuid) TO authenticated;

-- ============================================================================
-- Premium Stay Phase 1 — fn_hostel_premium_evaluate(learner_id, tier_id)
-- ============================================================================
-- Created: 2026-05-16
-- Spec: .claude/scratch/premium-stay-spec-2026-05-16.html (decision-#3 eligibility)
--
-- SECURITY DEFINER reader RPC. Returns a JSON verdict for whether a learner
-- is eligible to opt into a given tier. Service-layer wraps this for the
-- learner-pick UI and admission-flow gating.
--
-- Checks performed (in order; short-circuit on first failure):
--   1. tier_id exists in hostel_tier_policy AND is_active = true
--   2. tier is premium / premium_plus (standard tier is always eligible)
--   3. eligibility.require_fees_clear policy → learner has no active
--      hostel_allocation with fee_status NOT IN (paid, waived)
--   4. learner has SOME hostel_allocation row (is a hostelite)
--
-- Returns shape:
--   { eligible: bool, reason: text }
--   reason values:
--     - "ok"                       (eligible)
--     - "tier_not_found"
--     - "tier_inactive"
--     - "standard_tier_always_eligible"   (info, eligible=true)
--     - "not_a_hostelite"           (no allocation rows at all)
--     - "outstanding_dues"          (require_fees_clear policy violated)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_hostel_premium_evaluate(
  p_learner_id uuid,
  p_tier_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tier_record record;
  v_eligibility jsonb;
  v_require_fees_clear boolean;
  v_alloc_count integer;
  v_unpaid_count integer;
BEGIN
  -- ------------------------------------------------------------------------
  -- Step 1: resolve tier row
  -- ------------------------------------------------------------------------
  SELECT htp.tier_key, htp.is_active
    INTO v_tier_record
    FROM public.hostel_tier_policy htp
   WHERE htp.id = p_tier_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'tier_not_found');
  END IF;

  IF v_tier_record.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'tier_inactive');
  END IF;

  -- ------------------------------------------------------------------------
  -- Step 2: standard tier is always eligible (it's the default, no gating)
  -- ------------------------------------------------------------------------
  IF v_tier_record.tier_key = 'standard' THEN
    RETURN jsonb_build_object('eligible', true, 'reason', 'standard_tier_always_eligible');
  END IF;

  -- ------------------------------------------------------------------------
  -- Step 3: read eligibility policy from platform_policies
  --         (Director-tweakable via /admin/platform-policies)
  -- ------------------------------------------------------------------------
  v_eligibility := public.fn_get_policy_json(
    'hostel.premium.eligibility',
    '{"require_fees_clear":true}'::jsonb,
    NULL
  );
  v_require_fees_clear := COALESCE((v_eligibility ->> 'require_fees_clear')::boolean, true);

  -- ------------------------------------------------------------------------
  -- Step 4: learner must have SOME hostel allocation (be a hostelite)
  -- ------------------------------------------------------------------------
  SELECT count(*) INTO v_alloc_count
    FROM public.hostel_allocations ha
   WHERE ha.learner_id = p_learner_id;

  IF v_alloc_count = 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'not_a_hostelite');
  END IF;

  -- ------------------------------------------------------------------------
  -- Step 5: fees-clear gate when required
  -- ------------------------------------------------------------------------
  IF v_require_fees_clear THEN
    SELECT count(*) INTO v_unpaid_count
      FROM public.hostel_allocations ha
     WHERE ha.learner_id = p_learner_id
       AND ha.status = 'active'
       AND (ha.fee_status IS NULL OR ha.fee_status NOT IN ('paid', 'waived'));

    IF v_unpaid_count > 0 THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'outstanding_dues');
    END IF;
  END IF;

  -- All gates passed
  RETURN jsonb_build_object('eligible', true, 'reason', 'ok');
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_hostel_premium_evaluate(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hostel_premium_evaluate(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_hostel_premium_evaluate(uuid, uuid) IS
  'Premium Stay Phase 1: returns eligibility verdict for (learner, tier) pair. Reads hostel.premium.eligibility platform_policy at runtime — Director can flip require_fees_clear without redeploy. Standard tier always eligible. Consumed by hostel-premium-allocation-service.getEligibility().';

-- Verification — exercise the function against a known-bad tier id
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.fn_hostel_premium_evaluate(
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );

  IF v_result ->> 'reason' <> 'tier_not_found' THEN
    RAISE EXCEPTION 'fn_hostel_premium_evaluate sanity check failed: expected tier_not_found, got %', v_result;
  END IF;

  RAISE NOTICE 'fn_hostel_premium_evaluate sanity check: % (expected tier_not_found)', v_result;
END $$;

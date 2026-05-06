-- ============================================================================
-- 20260507100004 — admission_resolve_fee_items_for_lead RPC
-- ============================================================================
-- Spec §7. Computes the resolved fee_items[] for a learner by:
--   1. Looking up matching active fee_structure on the 8 dimensions
--   2. Loading base items from the structure
--   3. Applying active adjustments (per-category merged, global appended)
--   4. Clamping negative resulting amounts to 0 (with audit log entry)
--   5. Persisting result into learners_profiles.fee_items
--   6. Returning the JSONB array
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admission_resolve_fee_items_for_lead(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lead              record;
    v_structure_id      uuid;
    v_resolved          jsonb;
    v_base_items        jsonb;
    v_adjustments       jsonb;
    v_global_deltas_sum numeric(15,2) := 0;
BEGIN
    -- 1. Load lead's matrix dimensions
    SELECT institution_id, degree_id, department_id, program_id,
           quota_id, community_category_id, accommodation_type_id, admission_year_id,
           legacy_fee_mode
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    -- Legacy mode short-circuit: return existing fee_items unchanged.
    IF v_lead.legacy_fee_mode = true THEN
        RETURN COALESCE((SELECT fee_items FROM public.learners_profiles WHERE id = p_learner_id), '[]'::jsonb);
    END IF;

    -- 2. Lookup matching active fee structure on the 8 dimensions
    SELECT id INTO v_structure_id
      FROM public.admission_fee_structures
     WHERE institution_id        = v_lead.institution_id
       AND degree_id             = v_lead.degree_id
       AND department_id         = v_lead.department_id
       AND programme_id          = v_lead.program_id
       AND quota_id              = v_lead.quota_id
       AND community_category_id = v_lead.community_category_id
       AND accommodation_type_id = v_lead.accommodation_type_id
       AND admission_year_id     = v_lead.admission_year_id
       AND status = 'active'
     LIMIT 1;

    IF v_structure_id IS NULL THEN
        -- No-match: write empty array. Caller distinguishes by inspecting array length.
        UPDATE public.learners_profiles SET fee_items = '[]'::jsonb WHERE id = p_learner_id;
        RETURN '[]'::jsonb;
    END IF;

    -- 3. Base items from the structure
    SELECT jsonb_agg(jsonb_build_object(
                'category_id',   fsi.billing_category_id,
                'category_name', bc.category_name,
                'amount',        fsi.amount,
                'source',        'structure'))
      INTO v_base_items
      FROM public.admission_fee_structure_items fsi
      JOIN public.billing_categories bc ON bc.id = fsi.billing_category_id
     WHERE fsi.fee_structure_id = v_structure_id;

    IF v_base_items IS NULL THEN
        v_base_items := '[]'::jsonb;
    END IF;

    -- 4. Active adjustments — merge per-category, sum global deltas
    -- Per-category merge: GROUP adjustments by billing_category_id, sum delta_amount,
    -- then for each base item add the matching summed delta. Items that don't have
    -- a matching adjustment stay unchanged.
    -- Global (billing_category_id IS NULL) deltas summed into v_global_deltas_sum,
    -- appended as a synthetic "Adjustment" row at the end.

    WITH per_cat AS (
        SELECT billing_category_id, SUM(delta_amount) AS delta_sum
          FROM public.admission_fee_adjustments
         WHERE learner_id = p_learner_id
           AND status = 'active'
           AND billing_category_id IS NOT NULL
         GROUP BY billing_category_id
    )
    SELECT jsonb_agg(
             jsonb_build_object(
               'category_id',   item->>'category_id',
               'category_name', item->>'category_name',
               'amount',        GREATEST(0, (item->>'amount')::numeric
                                  + COALESCE(pc.delta_sum, 0)),
               'source',        item->>'source'))
      INTO v_resolved
      FROM jsonb_array_elements(v_base_items) AS item
      LEFT JOIN per_cat pc ON pc.billing_category_id = (item->>'category_id')::uuid;

    IF v_resolved IS NULL THEN
        v_resolved := '[]'::jsonb;
    END IF;

    -- Global deltas
    SELECT COALESCE(SUM(delta_amount), 0)
      INTO v_global_deltas_sum
      FROM public.admission_fee_adjustments
     WHERE learner_id = p_learner_id
       AND status = 'active'
       AND billing_category_id IS NULL;

    IF v_global_deltas_sum <> 0 THEN
        v_resolved := v_resolved || jsonb_build_array(
            jsonb_build_object(
                'category_id',   NULL,
                'category_name', 'Global Adjustment',
                'amount',        v_global_deltas_sum,
                'source',        'adjustment_global'
            )
        );
    END IF;

    -- 5. Persist
    UPDATE public.learners_profiles
       SET fee_items = v_resolved,
           updated_at = now()
     WHERE id = p_learner_id;

    -- 6. Return
    RETURN v_resolved;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid) TO authenticated;

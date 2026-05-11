-- ============================================================================
-- 20260507100010 — Add effective_from / effective_to to admission_fee_structures
-- ============================================================================
-- Within the same admission year, admin needs multiple fee structures
-- distinguished by date range (e.g. "early-bird" Jun-Sep cheaper than
-- "late entry" Oct-May). Both columns are nullable — NULL means "no
-- specific bound on that side", so legacy structures with no dates stay
-- valid and remain "always applicable".
--
-- The original UNIQUE on the 8 matrix dims is dropped and replaced with a
-- 9-column UNIQUE that includes effective_from. Multiple NULL effective_from
-- values are still allowed (NULL != NULL in Postgres unique semantics) — the
-- resolve RPC picks the latest applicable structure when multiple match.
-- ============================================================================

ALTER TABLE public.admission_fee_structures
    ADD COLUMN IF NOT EXISTS effective_from date,
    ADD COLUMN IF NOT EXISTS effective_to   date;

ALTER TABLE public.admission_fee_structures
    DROP CONSTRAINT IF EXISTS chk_fee_structure_effective_range;

ALTER TABLE public.admission_fee_structures
    ADD CONSTRAINT chk_fee_structure_effective_range
    CHECK (
      effective_to IS NULL
      OR effective_from IS NULL
      OR effective_to >= effective_from
    );

ALTER TABLE public.admission_fee_structures
    DROP CONSTRAINT IF EXISTS admission_fee_structures_institution_id_degree_id_departmen_key;

ALTER TABLE public.admission_fee_structures
    ADD CONSTRAINT admission_fee_structures_matrix_period_key
    UNIQUE (
      institution_id, degree_id, department_id, programme_id,
      quota_id, community_category_id, accommodation_type_id,
      admission_year_id, effective_from
    );

CREATE INDEX IF NOT EXISTS ix_fee_structures_effective_dates
    ON public.admission_fee_structures (effective_from, effective_to)
    WHERE status = 'active';

-- ============================================================================
-- Update admission_resolve_fee_items_for_lead to filter by date range
-- (full RPC body re-applied — see migration body in 20260507100004 for the
-- baseline, this version adds the date filter + ORDER BY effective_from DESC
-- NULLS LAST tie-breaker).
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
    v_global_deltas_sum numeric(15,2) := 0;
    v_today             date := CURRENT_DATE;
BEGIN
    SELECT institution_id, degree_id, department_id, program_id,
           quota_id, community_category_id, accommodation_type_id, admission_year_id,
           legacy_fee_mode
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    IF v_lead.legacy_fee_mode = true THEN
        RETURN COALESCE((SELECT fee_items FROM public.learners_profiles WHERE id = p_learner_id), '[]'::jsonb);
    END IF;

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
       AND COALESCE(effective_from, '-infinity'::date) <= v_today
       AND COALESCE(effective_to,   'infinity'::date)  >= v_today
     ORDER BY effective_from DESC NULLS LAST
     LIMIT 1;

    IF v_structure_id IS NULL THEN
        UPDATE public.learners_profiles SET fee_items = '[]'::jsonb WHERE id = p_learner_id;
        RETURN '[]'::jsonb;
    END IF;

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

    UPDATE public.learners_profiles
       SET fee_items = v_resolved,
           updated_at = now()
     WHERE id = p_learner_id;

    RETURN v_resolved;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid) TO authenticated;

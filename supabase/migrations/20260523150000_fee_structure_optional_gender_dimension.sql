-- ============================================================================
-- 20260523150000 — Add optional gender dimension to admission fee structures
-- ============================================================================
-- Some programmes (e.g., BSC Nursing) have different fee structures for male
-- vs female students. This migration adds a nullable gender column:
--   NULL  = applies to any gender (backwards-compatible default)
--   'MALE'/'FEMALE' = gender-specific structure
--
-- Resolution priority (in RPC): exact gender match > NULL (wildcard) fallback.
-- Overlap trigger: prevents same community from being covered by both a
-- gender-specific AND a gender-NULL structure for the same 7 dims.
-- ============================================================================

-- 1. Add nullable gender column
ALTER TABLE public.admission_fee_structures
  ADD COLUMN IF NOT EXISTS gender text NULL;

COMMENT ON COLUMN public.admission_fee_structures.gender IS
  'Optional gender filter. NULL = any gender. MALE/FEMALE = gender-specific.';

-- 2. Update overlap trigger to include gender in the collision check
CREATE OR REPLACE FUNCTION public._fee_structure_community_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_self public.admission_fee_structures%ROWTYPE;
BEGIN
    SELECT * INTO v_self
      FROM public.admission_fee_structures
     WHERE id = NEW.fee_structure_id;

    IF v_self.status = 'archived' THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.admission_fee_structure_communities j
          JOIN public.admission_fee_structures fs ON fs.id = j.fee_structure_id
         WHERE j.community_category_id = NEW.community_category_id
           AND j.fee_structure_id <> NEW.fee_structure_id
           AND fs.institution_id        = v_self.institution_id
           AND fs.degree_id             = v_self.degree_id
           AND fs.department_id         = v_self.department_id
           AND fs.programme_id          = v_self.programme_id
           AND fs.quota_id              = v_self.quota_id
           AND fs.accommodation_type_id = v_self.accommodation_type_id
           AND fs.admission_year_id     = v_self.admission_year_id
           AND fs.status <> 'archived'
           -- Gender overlap: same gender, or either side is NULL (wildcard)
           AND (fs.gender IS NOT DISTINCT FROM v_self.gender
                OR fs.gender IS NULL
                OR v_self.gender IS NULL)
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23505',
            MESSAGE = 'Another active fee structure already covers community '
                   || NEW.community_category_id::text
                   || ' for this dimension combination (including gender: '
                   || COALESCE(v_self.gender, 'Any')
                   || '). Archive the existing structure first.';
    END IF;

    RETURN NEW;
END;
$$;

-- 3. Update the fee resolution RPC to match gender with fallback
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
    -- 1. Load learner dimensions (now includes gender)
    SELECT institution_id, degree_id, department_id, program_id,
           quota_id, community_category_id, accommodation_type_id, admission_year_id,
           legacy_fee_mode, gender
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    IF v_lead.legacy_fee_mode = true THEN
        RETURN COALESCE((SELECT fee_items FROM public.learners_profiles WHERE id = p_learner_id), '[]'::jsonb);
    END IF;

    -- 2. Lookup: prefer exact gender match, fall back to gender IS NULL (any)
    SELECT afs.id INTO v_structure_id
      FROM public.admission_fee_structures afs
     WHERE afs.institution_id        = v_lead.institution_id
       AND afs.degree_id             = v_lead.degree_id
       AND afs.department_id         = v_lead.department_id
       AND afs.programme_id          = v_lead.program_id
       AND afs.quota_id              = v_lead.quota_id
       AND afs.accommodation_type_id = v_lead.accommodation_type_id
       AND afs.admission_year_id     = v_lead.admission_year_id
       AND afs.status = 'active'
       AND EXISTS (
             SELECT 1 FROM public.admission_fee_structure_communities j
              WHERE j.fee_structure_id      = afs.id
                AND j.community_category_id = v_lead.community_category_id
           )
       AND (afs.gender = UPPER(v_lead.gender) OR afs.gender IS NULL)
     ORDER BY afs.gender IS NOT NULL DESC
     LIMIT 1;

    IF v_structure_id IS NULL THEN
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

    -- 4. Adjustments — per-category merge + global deltas
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

    -- 5. Persist + return
    UPDATE public.learners_profiles
       SET fee_items = v_resolved,
           updated_at = now()
     WHERE id = p_learner_id;

    RETURN v_resolved;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid) TO authenticated;
